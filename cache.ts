/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Qssaf
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { PluginNative } from "@utils/types";

import { settings } from "./settings";
import { categorize, MAX_ITEM_BYTES, MIME_EXT } from "./urls";

// Undefined until Discord is fully restarted once after installing, since native code lives in the main process.
export const Native = VencordNative.pluginHelpers.GifCache as PluginNative<typeof import("./native")> | undefined;

const logger = new Logger("GifCache");

/** Decoded blobs kept in memory. Entries still shown on screen are never revoked. */
const POOL_BUDGET_BYTES = 128 * 1024 * 1024;
const MAX_PARALLEL_CAPTURES = 3;

const diskKeys = new Set<string>();
let indexLoaded = false;
let ready: Promise<void> = Promise.resolve();

interface Pooled {
    url: string;
    size: number;
    users: Set<WeakRef<HTMLImageElement | HTMLVideoElement>>;
}
const pool = new Map<string, Pooled>();
let poolBytes = 0;

const inflight = new Map<string, Promise<boolean>>();
const captureQueue = new Map<string, string>();
const uncapturable = new Set<string>();
const capturing = new Set<string>();

export function isEnabled(key: string) {
    return settings.store[categorize(key)];
}

export function startCache() {
    ready = Native!.init(settings.store.maxSizeMB)
        .then(keys => keys.forEach(k => diskKeys.add(k)))
        .catch(e => logger.error("Failed to load cache index", e))
        .finally(() => indexLoaded = true);
}

/** Resolves once we know which keys are on disk. */
export function whenReady() {
    return ready;
}

/** true / false once the index is loaded, undefined before. */
export function isOnDisk(key: string) {
    return indexLoaded ? diskKeys.has(key) : undefined;
}

function forget(evicted: string[]) {
    for (const key of evicted) diskKeys.delete(key);
}

/** In-memory blob URL for key, registering el as a user so it is not revoked while shown. */
export function pooledUrl(key: string, el: HTMLImageElement | HTMLVideoElement) {
    const entry = pool.get(key);
    if (!entry) return null;

    // re-insert to keep the map in least recently used order
    pool.delete(key);
    pool.set(key, entry);
    entry.users.add(new WeakRef(el));
    return entry.url;
}

function makeRoom(bytes: number) {
    for (const [key, entry] of pool) {
        if (poolBytes + bytes <= POOL_BUDGET_BYTES) return;

        let inUse = false;
        for (const ref of entry.users) {
            const el = ref.deref();
            if (el?.isConnected && el.currentSrc === entry.url) inUse = true;
            else entry.users.delete(ref);
        }
        if (inUse) continue;

        URL.revokeObjectURL(entry.url);
        pool.delete(key);
        poolBytes -= entry.size;
    }
}

/**
 * Puts key into the memory pool, reading it from disk or, if allowed, downloading it through the main process.
 * Resolves to whether the key is now pooled.
 */
export function load(url: string, key: string, allowDownload: boolean) {
    if (pool.has(key)) return Promise.resolve(true);

    let promise = inflight.get(key);
    if (promise) return promise;

    promise = (async () => {
        let result = diskKeys.has(key) ? await Native!.read(url) : null;
        if (!result) {
            diskKeys.delete(key);
            if (!allowDownload) return false;

            const downloaded = await Native!.download(url);
            if (!downloaded) return false;
            diskKeys.add(downloaded.key);
            forget(downloaded.evicted);
            result = downloaded;
        }

        const blob = new Blob([result.data], { type: result.type });
        makeRoom(blob.size);
        pool.set(key, { url: URL.createObjectURL(blob), size: blob.size, users: new Set() });
        poolBytes += blob.size;
        return true;
    })()
        .catch(e => {
            logger.error("Failed to load", url, e);
            return false;
        })
        .finally(() => inflight.delete(key));

    inflight.set(key, promise);
    return promise;
}

/**
 * Saves media the browser just finished loading. With force-cache the bytes come straight
 * out of Chromium's HTTP cache, so this does not download anything again.
 */
export function capture(url: string, key: string) {
    if (diskKeys.has(key) || uncapturable.has(key) || captureQueue.has(key) || capturing.has(key)) return;
    captureQueue.set(key, url);
    pumpCaptures();
}

function pumpCaptures() {
    for (const [key, url] of captureQueue) {
        if (capturing.size >= MAX_PARALLEL_CAPTURES) return;
        captureQueue.delete(key);
        capturing.add(key);
        captureOne(url, key).finally(() => {
            capturing.delete(key);
            pumpCaptures();
        });
    }
}

async function captureOne(url: string, key: string) {
    try {
        const res = await fetch(url, { cache: "force-cache", credentials: "omit" });
        const type = res.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
        const length = Number(res.headers.get("content-length") ?? 0);
        if (!res.ok || !(type in MIME_EXT) || length > MAX_ITEM_BYTES) {
            await res.body?.cancel();
            uncapturable.add(key);
            return;
        }

        const stored = await Native!.store(url, new Uint8Array(await res.arrayBuffer()), type);
        if (!stored) return void uncapturable.add(key);
        diskKeys.add(stored.key);
        forget(stored.evicted);
    } catch {
        // no CORS headers: the browser can show it but we cannot read it without downloading it again
        uncapturable.add(key);
    }
}

export async function setLimit(limitMB: number) {
    forget(await Native?.setLimit(limitMB) ?? []);
}

export async function clearCache() {
    await Native?.clear();
    diskKeys.clear();
    uncapturable.clear();
}
