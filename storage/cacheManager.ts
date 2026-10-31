/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";

const CACHE_NAME = "vencord-gif-cache-v1";
const MAX_IN_MEMORY_BLOBS = 120;
const logger = new Logger("GifCache:Manager");

interface BlobEntry {
    blobUrl: string;
    refCount: number;
    lastUsed: number;
    size: number;
}

export class CacheManager {
    private blobMap = new Map<string, BlobEntry>();
    private cachePromise: Promise<Cache> | null = null;

    private async getCache(): Promise<Cache> {
        if (!this.cachePromise) {
            this.cachePromise = window.caches.open(CACHE_NAME);
        }
        return this.cachePromise;
    }

    public hasInMemory(url: string): boolean {
        return this.blobMap.has(url);
    }

    public getInMemoryBlobUrl(url: string): string | null {
        const entry = this.blobMap.get(url);
        if (entry) {
            entry.lastUsed = Date.now();
            return entry.blobUrl;
        }
        return null;
    }

    public async getBlobUrl(url: string): Promise<string | null> {
        const inMemory = this.getInMemoryBlobUrl(url);
        if (inMemory) {
            return inMemory;
        }

        try {
            const cache = await this.getCache();
            const response = await cache.match(url);
            if (!response) return null;

            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);

            this.blobMap.set(url, {
                blobUrl,
                refCount: 1,
                lastUsed: Date.now(),
                size: blob.size,
            });

            this.pruneBlobPool();
            return blobUrl;
        } catch (err) {
            logger.error("Failed to retrieve cached media", err);
            return null;
        }
    }

    public async cacheMedia(url: string, response: Response): Promise<string | null> {
        try {
            const blob = await response.blob();
            if (blob.size === 0) return null;

            const cache = await this.getCache();
            const cacheResponse = new Response(blob, {
                headers: {
                    "Content-Type": blob.type || "application/octet-stream",
                    "Content-Length": String(blob.size),
                },
            });

            await cache.put(url, cacheResponse);

            const blobUrl = URL.createObjectURL(blob);
            this.blobMap.set(url, {
                blobUrl,
                refCount: 1,
                lastUsed: Date.now(),
                size: blob.size,
            });

            this.pruneBlobPool();
            return blobUrl;
        } catch (err) {
            logger.error(`Failed to cache media for ${url}`, err);
            return null;
        }
    }

    public releaseBlob(url: string): void {
        const entry = this.blobMap.get(url);
        if (entry && entry.refCount > 0) {
            entry.refCount--;
        }
    }

    private pruneBlobPool(): void {
        if (this.blobMap.size <= MAX_IN_MEMORY_BLOBS) return;

        const entries = Array.from(this.blobMap.entries())
            .filter(([_, entry]) => entry.refCount <= 0)
            .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

        const toRemove = entries.slice(0, this.blobMap.size - MAX_IN_MEMORY_BLOBS);
        for (const [key, entry] of toRemove) {
            URL.revokeObjectURL(entry.blobUrl);
            this.blobMap.delete(key);
        }
    }

    public async getStats(): Promise<{ count: number; totalBytes: number }> {
        try {
            const cache = await this.getCache();
            const keys = await cache.keys();
            let totalBytes = 0;

            for (const entry of this.blobMap.values()) {
                totalBytes += entry.size;
            }

            return {
                count: keys.length,
                totalBytes,
            };
        } catch (err) {
            logger.error("Failed to read cache stats", err);
            return { count: 0, totalBytes: 0 };
        }
    }

    public async clearCache(): Promise<void> {
        try {
            for (const entry of this.blobMap.values()) {
                URL.revokeObjectURL(entry.blobUrl);
            }
            this.blobMap.clear();

            await window.caches.delete(CACHE_NAME);
            this.cachePromise = null;
            logger.info("Cache successfully cleared");
        } catch (err) {
            logger.error("Failed to clear cache", err);
        }
    }

    public destroy(): void {
        for (const entry of this.blobMap.values()) {
            URL.revokeObjectURL(entry.blobUrl);
        }
        this.blobMap.clear();
        this.cachePromise = null;
    }
}

export const cacheManager = new CacheManager();
