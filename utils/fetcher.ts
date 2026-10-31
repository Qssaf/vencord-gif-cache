/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";

import { settings } from "../settings";
import { cacheManager } from "../storage/cacheManager";

const logger = new Logger("GifCache:Fetcher");
const pendingFetches = new Map<string, Promise<string | null>>();

const ALLOWED_CONTENT_TYPES = [
    "image/gif",
    "image/webp",
    "image/png",
    "image/jpeg",
    "image/apng",
    "video/mp4",
    "video/webm",
    "application/json",
];

export type MediaCategory = "gif" | "video" | "emoji" | "sticker" | "avatar" | "attachment" | "other";

export function categorizeUrl(url: string): MediaCategory | null {
    if (!url || url.startsWith("data:") || url.startsWith("blob:")) return null;

    try {
        const parsed = new URL(url);
        const path = parsed.pathname.toLowerCase();
        const host = parsed.hostname.toLowerCase();

        // Videos
        if (path.endsWith(".mp4") || path.endsWith(".webm") || path.endsWith(".mov")) {
            return "video";
        }

        // Discord CDN Assets
        if (
            host.includes("discordapp.net") ||
            host.includes("discordapp.com") ||
            host.includes("discord.com")
        ) {
            if (path.includes("/emojis/")) return "emoji";
            if (path.includes("/stickers/")) return "sticker";
            if (
                path.includes("/avatars/") ||
                path.includes("/user-avatars/") ||
                path.includes("/guild-events/") ||
                path.includes("/icons/") ||
                path.includes("/banners/") ||
                path.includes("/splashes/")
            ) {
                return "avatar";
            }
            if (path.includes("/attachments/")) {
                if (path.endsWith(".gif") || path.endsWith(".webp")) return "gif";
                if (path.endsWith(".mp4") || path.endsWith(".webm") || path.endsWith(".mov")) return "video";
                return "attachment";
            }
        }

        // Tenor / Giphy
        if (host.includes("tenor.com") || host.includes("giphy.com")) {
            if (path.endsWith(".mp4") || path.endsWith(".webm")) return "video";
            return "gif";
        }

        // Generic files
        if (path.endsWith(".gif")) return "gif";
        if (path.endsWith(".webp") || path.endsWith(".png") || path.endsWith(".jpg") || path.endsWith(".jpeg")) {
            return "other";
        }
    } catch {
        return null;
    }

    return null;
}

export function isCachableMediaUrl(url: string): boolean {
    const category = categorizeUrl(url);
    if (!category) return false;

    switch (category) {
        case "gif":
            return settings.store.cacheGifs;
        case "video":
            return settings.store.cacheVideos;
        case "emoji":
            return settings.store.cacheEmojis;
        case "sticker":
            return settings.store.cacheStickers;
        case "avatar":
            return settings.store.cacheAvatars;
        case "attachment":
            return settings.store.cacheAttachments;
        case "other":
            return settings.store.cacheAttachments;
        default:
            return false;
    }
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
                return null;
            }

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
