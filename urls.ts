/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Qssaf
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Shared by the renderer and native.ts, so it must stay free of browser- and node-only imports.

export type Category = "gifs" | "emojis" | "stickers" | "profiles" | "images";

export const MAX_ITEM_BYTES = 25 * 1024 * 1024;

export const MIME_EXT: Record<string, string> = {
    "image/gif": "gif",
    "image/webp": "webp",
    "image/png": "png",
    "image/apng": "png",
    "image/jpeg": "jpg",
    "image/avif": "avif",
    "video/mp4": "mp4",
    "video/webm": "webm",
};

const MEDIA_HOST = /^(cdn\.discordapp\.com|media\.discordapp\.net|images-ext-\d+\.discordapp\.net|media\d*\.tenor\.com|(media\d*|i)\.giphy\.com|static\.klipy\.com)$/;
const GIF_HOST = /(^|\.)(tenor\.com|giphy\.com|klipy\.com)$/;
// Discord signs attachment URLs with expiring params; the bytes behind them never change.
const VOLATILE_PARAMS = ["ex", "is", "hm"];

/** Stable cache key for a media URL, or null if the URL is not one we cache. */
export function cacheKey(raw: string): string | null {
    if (!raw.startsWith("https://")) return null;

    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }
    if (!MEDIA_HOST.test(url.hostname)) return null;

    url.hostname = url.hostname.replace(/^images-ext-\d+\./, "images-ext.");
    for (const param of VOLATILE_PARAMS) url.searchParams.delete(param);
    url.searchParams.sort();
    url.hash = "";
    return url.href;
}

export function categorize(key: string): Category {
    const { hostname, pathname } = new URL(key);
    if (GIF_HOST.test(hostname)) return "gifs";

    if (hostname === "images-ext.discordapp.net") {
        // /external/<sig>/https/<host>/...
        const proxied = pathname.split("/")[4] ?? "";
        return GIF_HOST.test(proxied) ? "gifs" : "images";
    }

    if (pathname.startsWith("/emojis/")) return "emojis";
    if (pathname.startsWith("/stickers/")) return "stickers";
    if (pathname.startsWith("/attachments/") || pathname.startsWith("/ephemeral-attachments/"))
        return /\.(gif|webp)$/i.test(pathname) ? "gifs" : "images";

    // avatars, guild icons, banners, avatar decorations, role icons, ...
    return "profiles";
}
