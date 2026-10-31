/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";

import { cacheManager } from "../storage/cacheManager";

const logger = new Logger("GifCache:Fetcher");
const pendingFetches = new Map<string, Promise<string | null>>();

const ALLOWED_CONTENT_TYPES = [
    "image/gif",
    "image/webp",
    "image/apng",
    "video/mp4",
    "video/webm",
];

export function isCachableMediaUrl(url: string): boolean {
    if (!url || url.startsWith("data:") || url.startsWith("blob:")) return false;

    try {
        const parsed = new URL(url);
        const path = parsed.pathname.toLowerCase();

        if (
            path.endsWith(".gif") ||
            path.endsWith(".webp") ||
            path.endsWith(".mp4") ||
            path.endsWith(".webm")
        ) {
            return true;
        }

        // Tenor / Giphy CDNs
        if (
            parsed.hostname.includes("tenor.com") ||
            parsed.hostname.includes("giphy.com") ||
            parsed.hostname.includes("media.discordapp.net") ||
            parsed.hostname.includes("cdn.discordapp.com")
        ) {
            return true;
        }
    } catch {
        return false;
    }

    return false;
}

export async function fetchAndCache(url: string): Promise<string | null> {
    if (!isCachableMediaUrl(url)) return null;

    if (cacheManager.hasInMemory(url)) {
        return cacheManager.getInMemoryBlobUrl(url);
    }

    const pending = pendingFetches.get(url);
    if (pending) {
        return pending;
    }

    const fetchPromise = (async () => {
        try {
            // First check if already in CacheStorage
            const existingBlob = await cacheManager.getBlobUrl(url);
            if (existingBlob) {
                return existingBlob;
            }

            const response = await fetch(url, {
                mode: "cors",
                credentials: "omit",
            });

            if (!response.ok) {
                logger.warn(`Failed to fetch media (status ${response.status}): ${url}`);
                return null;
            }

            const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
            if (contentType && !ALLOWED_CONTENT_TYPES.includes(contentType)) {
                // Not an animated GIF or video
                return null;
            }

            const contentLengthHeader = response.headers.get("content-length");
            const expectedLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : null;

            const blobUrl = await cacheManager.cacheMedia(url, response);
            return blobUrl;
        } catch (err) {
            logger.warn(`Network/CORS error fetching media for cache: ${url}`, err);
            return null;
        } finally {
            pendingFetches.delete(url);
        }
    })();

    pendingFetches.set(url, fetchPromise);
    return fetchPromise;
}
