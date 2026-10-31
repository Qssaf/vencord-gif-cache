/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { IconUtils } from "@webpack/common";

import { settings } from "./settings";
import { cacheManager } from "./storage/cacheManager";
import { fetchAndCache, isCachableMediaUrl } from "./utils/fetcher";

const logger = new Logger("GifCache");

const originalIconMethods = new Map<string, any>();

function wrapIconMethod(target: any, methodName: string) {
    if (!target || typeof target[methodName] !== "function") return;

    const original = target[methodName];
    originalIconMethods.set(methodName, original);

    target[methodName] = function (this: any, ...args: any[]) {
        const url = original.apply(this, args);
        if (!url || typeof url !== "string" || !isCachableMediaUrl(url)) {
            return url;
        }

        const inMemory = cacheManager.getInMemoryBlobUrl(url);
        if (inMemory) {
            return inMemory;
        }

        void fetchAndCache(url);
        return url;
    };
}

function unwrapIconMethods(target: any) {
    if (!target) return;
    for (const [methodName, original] of originalIconMethods.entries()) {
        try {
            target[methodName] = original;
        } catch {
            // Ignore if sealed
        }
    }
    originalIconMethods.clear();
}

export default definePlugin({
    name: "GifCache",
    description: "Persistently caches GIFs, emojis, stickers, avatars, and videos locally to save bandwidth on slow internet",
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
        // Wrap IconUtils to catch inline emojis, reactions, avatars, and server icons
        if (IconUtils) {
            wrapIconMethod(IconUtils, "getEmojiURL");
            wrapIconMethod(IconUtils, "getUserAvatarURL");
            wrapIconMethod(IconUtils, "getGuildIconURL");
            wrapIconMethod(IconUtils, "getGuildBannerURL");
            wrapIconMethod(IconUtils, "getUserBannerURL");
        }

        logger.info("Universal media cache active (GIFs, emojis, stickers, avatars, attachments)");
    },

    stop() {
        if (IconUtils) {
            unwrapIconMethods(IconUtils);
        }
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
