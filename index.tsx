/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";

import { settings } from "./settings";
import { cacheManager } from "./storage/cacheManager";
import { fetchAndCache, isCachableMediaUrl } from "./utils/fetcher";

const logger = new Logger("GifCache");

export default definePlugin({
    name: "GifCache",
    description: "Caches loaded GIFs and Tenor videos locally to prevent re-downloading on slow internet",
    authors: [{ name: "Sisyphus", id: 0n }],
    tags: ["Media", "Utility"],
    settings,

    patches: [
        {
            find: ".handleImageLoad)",
            replacement: {
                match: /getSrc\(\i\)\{/,
                replace: "$&var _vcCached=$self.getCachedSrc(this?.props,arguments[1]);if(_vcCached)return _vcCached;",
            },
        },
    ],

    // Expose for testing & QA scenarios
    cacheManager,
    fetchAndCache,

    start() {
        logger.info("GifCache initialized");
    },

    stop() {
        cacheManager.destroy();
        logger.info("GifCache stopped");
    },

    getCachedSrc(props: { src?: string; original?: string; url?: string }, _freeze?: boolean): string | undefined {
        const targetUrl = props?.src || props?.original || props?.url;
        if (!targetUrl || typeof targetUrl !== "string") return;

        if (!isCachableMediaUrl(targetUrl)) return;

        // Synchronously return in-memory blob URL if available
        const inMemoryBlob = cacheManager.getInMemoryBlobUrl(targetUrl);
        if (inMemoryBlob) {
            return inMemoryBlob;
        }

        // Kick off background fetch / hydration
        void fetchAndCache(targetUrl);

        return;
    },
});
