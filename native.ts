/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Qssaf
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash } from "crypto";
import { app, IpcMainInvokeEvent, net, shell } from "electron";
import { writeFileSync } from "fs";
import { mkdir, readdir, readFile, rename, rm, unlink, writeFile } from "fs/promises";
import { join } from "path";

import { cacheKey, MAX_ITEM_BYTES, MIME_EXT } from "./urls";

// Every export of this file is an IPC method callable by the renderer, so helpers stay unexported
// and every input is validated: keys are always derived here from whitelisted URLs.

const DIR = join(app.getPath("userData"), "GifCache");
const INDEX_FILE = join(DIR, "index.json");

interface Entry {
    /** file name */
    f: string;
    /** size in bytes */
    s: number;
    /** mime type */
    t: string;
    /** last access, ms */
    a: number;
}

const entries = new Map<string, Entry>();
let totalBytes = 0;
let limitBytes = 2000 * 1024 * 1024;
let loading: Promise<void> | undefined;
let saveTimer: NodeJS.Timeout | undefined;
let dirty = false;

function load() {
    return loading ??= (async () => {
        await mkdir(DIR, { recursive: true });

        try {
            const saved: Record<string, Entry> = JSON.parse(await readFile(INDEX_FILE, "utf8"));
            for (const [key, entry] of Object.entries(saved)) entries.set(key, entry);
        } catch {
            // missing or corrupt index: start empty, orphaned files are removed below
        }

        const files = new Set(await readdir(DIR));
        const referenced = new Set<string>();
        for (const [key, entry] of entries) {
            if (files.has(entry.f)) {
                referenced.add(entry.f);
                totalBytes += entry.s;
            } else {
                entries.delete(key);
                dirty = true;
            }
        }
        for (const file of files) {
            if (file !== "index.json" && !referenced.has(file))
                await unlink(join(DIR, file)).catch(() => { });
        }

        app.once("before-quit", flushSync);
    })();
}

function serializeIndex() {
    dirty = false;
    return JSON.stringify(Object.fromEntries(entries));
}

// shortcut: the whole index is rewritten on save; fine up to ~50k entries, move to SQLite if it grows past that
function scheduleSave() {
    dirty = true;
    saveTimer ??= setTimeout(async () => {
        saveTimer = undefined;
        const tmp = INDEX_FILE + ".tmp";
        try {
            await writeFile(tmp, serializeIndex());
            await rename(tmp, INDEX_FILE);
        } catch (e) {
            console.error("[GifCache] Failed to save index", e);
            dirty = true;
        }
    }, 10_000);
}

function flushSync() {
    if (!dirty) return;
    try {
        writeFileSync(INDEX_FILE, serializeIndex());
    } catch (e) {
        console.error("[GifCache] Failed to save index", e);
    }
}

/** Deletes least recently used entries until the cache is below 90% of the limit. Returns their keys. */
async function evict(): Promise<string[]> {
    if (totalBytes <= limitBytes) return [];

    const evicted: string[] = [];
    const oldestFirst = [...entries].sort((a, b) => a[1].a - b[1].a);
    for (const [key, entry] of oldestFirst) {
        if (totalBytes <= limitBytes * 0.9) break;
        entries.delete(key);
        totalBytes -= entry.s;
        evicted.push(key);
        await unlink(join(DIR, entry.f)).catch(() => { });
    }
    scheduleSave();
    return evicted;
}

async function put(key: string, data: Uint8Array, type: string): Promise<string[]> {
    await load();
    const f = createHash("sha256").update(key).digest("hex").slice(0, 40) + "." + MIME_EXT[type];
    const tmp = join(DIR, `${f}.${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
    await writeFile(tmp, data);
    await rename(tmp, join(DIR, f));

    const old = entries.get(key);
    if (old) totalBytes -= old.s;
    entries.set(key, { f, s: data.byteLength, t: type, a: Date.now() });
    totalBytes += data.byteLength;
    scheduleSave();
    return evict();
}

function isValidMedia(type: unknown, size: number): type is string {
    return typeof type === "string" && type in MIME_EXT && size > 0 && size <= MAX_ITEM_BYTES;
}

/** Loads the index and returns every cached key. */
export async function init(_: IpcMainInvokeEvent, limitMB: number) {
    await load();
    if (Number.isFinite(limitMB) && limitMB > 0) limitBytes = limitMB * 1024 * 1024;
    await evict();
    return [...entries.keys()];
}

export async function read(_: IpcMainInvokeEvent, url: string) {
    await load();
    const key = typeof url === "string" && cacheKey(url);
    const entry = key && entries.get(key);
    if (!entry) return null;

    try {
        const data = await readFile(join(DIR, entry.f));
        entry.a = Date.now();
        scheduleSave();
        return { data: new Uint8Array(data), type: entry.t };
    } catch {
        entries.delete(key);
        totalBytes -= entry.s;
        scheduleSave();
        return null;
    }
}

/** Stores bytes the renderer already has (read back from Chromium's HTTP cache). */
export async function store(_: IpcMainInvokeEvent, url: string, data: Uint8Array, type: string) {
    const key = typeof url === "string" && cacheKey(url);
    if (!key || !(data instanceof Uint8Array) || !isValidMedia(type, data.byteLength)) return null;
    return { key, evicted: await put(key, data, type) };
}

/** Downloads media the renderer cannot read itself (no CORS headers), stores it and returns it. */
export async function download(_: IpcMainInvokeEvent, url: string) {
    const key = typeof url === "string" && cacheKey(url);
    if (!key) return null;

    try {
        const res = await net.fetch(url);
        const type = res.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
        if (!res.ok || !isValidMedia(type, Number(res.headers.get("content-length") ?? 1))) {
            await res.body?.cancel();
            return null;
        }

        const data = new Uint8Array(await res.arrayBuffer());
        if (!isValidMedia(type, data.byteLength)) return null;

        return { key, data, type, evicted: await put(key, data, type) };
    } catch (e) {
        console.error("[GifCache] Download failed", url, e);
        return null;
    }
}

export async function setLimit(_: IpcMainInvokeEvent, limitMB: number) {
    if (!Number.isFinite(limitMB) || limitMB <= 0) return [];
    await load();
    limitBytes = limitMB * 1024 * 1024;
    return evict();
}

export async function stats() {
    await load();
    return { count: entries.size, bytes: totalBytes, dir: DIR };
}

export async function clear() {
    await load();
    entries.clear();
    totalBytes = 0;
    await rm(DIR, { recursive: true, force: true });
    await mkdir(DIR, { recursive: true });
    dirty = false;
}

export function openFolder() {
    return shell.openPath(DIR);
}
