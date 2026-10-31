/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Qssaf
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import definePlugin, { StartAt } from "@utils/types";

import { capture, isEnabled, isOnDisk, load, Native, pooledUrl, startCache, whenReady } from "./cache";
import { settings } from "./settings";
import { cacheKey } from "./urls";

// Media is intercepted where every image and video gets its source: the src setter and setAttribute("src")
// of <img> and <video>. That covers all of Discord's components without patching any of them.

type MediaElement = HTMLImageElement | HTMLVideoElement;
type SetSrc = (el: MediaElement, src: string) => void;

const logger = new Logger("GifCache");

/** The URL Discord asked for, per element, while we decide what to actually load. */
const wanted = new WeakMap<Element, string>();
const unhooks: (() => void)[] = [];

/** Returns true if we took over setting the element's source. */
function intercept(el: MediaElement, url: string, setSrc: SetSrc): boolean {
    const key = cacheKey(url);
    if (!key || !isEnabled(key)) {
        wanted.delete(el);
        return false;
    }
    wanted.set(el, url);

    const pooled = pooledUrl(key, el);
    if (pooled) {
        setSrc(el, pooled);
        return true;
    }

    if (el instanceof HTMLVideoElement) {
        // loop may be set after src, so decide once React has applied every prop
        queueMicrotask(() => resolveVideo(el, url, key, setSrc));
        return true;
    }

    if (isOnDisk(key) === false) {
        captureOnLoad(el, url, key);
        return false;
    }

    void resolveImage(el, url, key, setSrc);
    return true;
}

async function resolveImage(el: HTMLImageElement, url: string, key: string, setSrc: SetSrc) {
    await whenReady();
    const pooled = isOnDisk(key) && await load(url, key, false) && pooledUrl(key, el);
    if (wanted.get(el) !== url) return;

    setSrc(el, pooled || url);
    if (!pooled) captureOnLoad(el, url, key);
}

async function resolveVideo(el: HTMLVideoElement, url: string, key: string, setSrc: SetSrc) {
    if (wanted.get(el) !== url) return;

    // Only GIF-style videos. Regular videos would be downloaded in full just for being on screen.
    if (!el.loop) {
        wanted.delete(el);
        setSrc(el, url);
        return;
    }

    // Many GIF videos have no CORS headers, so the main process downloads them once instead of the browser.
    await whenReady();
    const pooled = await load(url, key, true) && pooledUrl(key, el);
    if (wanted.get(el) === url) setSrc(el, pooled || url);
}

function captureOnLoad(el: HTMLImageElement, url: string, key: string) {
    el.addEventListener("load", () => {
        // currentSrc differs when srcset picked another URL; that one is not in the HTTP cache under url
        if (wanted.get(el) === url && el.currentSrc === new URL(url).href) capture(url, key);
    }, { once: true });
}

function hookSrc(proto: HTMLImageElement | HTMLVideoElement) {
    const ownSrc = Object.getOwnPropertyDescriptor(proto, "src");
    const src = ownSrc ?? Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src")!;
    const setSrc: SetSrc = (el, value) => src.set!.call(el, value);

    Object.defineProperty(proto, "src", {
        configurable: true,
        enumerable: src.enumerable,
        get() {
            // Discord code reading src back gets the URL it set, not our blob: URL
            return wanted.get(this) ?? src.get!.call(this);
        },
        set(value) {
            if (!intercept(this, String(value), setSrc)) src.set!.call(this, value);
        },
    });

    proto.setAttribute = function (this: MediaElement, name: string, value: string) {
        if (name === "src" && intercept(this, String(value), setSrc)) return;
        Element.prototype.setAttribute.call(this, name, value);
    };
    proto.removeAttribute = function (this: MediaElement, name: string) {
        if (name === "src") wanted.delete(this);
        Element.prototype.removeAttribute.call(this, name);
    };

    unhooks.push(() => {
        if (ownSrc) Object.defineProperty(proto, "src", ownSrc);
        else delete (proto as any).src;
        delete (proto as any).setAttribute;
        delete (proto as any).removeAttribute;
    });
}

export default definePlugin({
    name: "GifCache",
    description: "Saves GIFs, emojis, stickers, avatars and images to disk so they never download twice",
    authors: [{ name: "Qssaf", id: 0n }],
    tags: ["Media", "Utility"],
    settings,
    startAt: StartAt.Init,

    start() {
        if (!Native) {
            logger.error("Native module missing. Fully restart Discord to finish installing.");
            return;
        }

        startCache();
        hookSrc(HTMLImageElement.prototype);
        hookSrc(HTMLVideoElement.prototype);

        // storage used by the previous version of this plugin
        void caches.delete("vencord-gif-cache-v1");
    },

    stop() {
        for (const unhook of unhooks.splice(0)) unhook();
    },
});
