/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Flex } from "@components/Flex";
import { Paragraph } from "@components/Paragraph";
import { OptionType } from "@utils/types";
import { useEffect, useState } from "@webpack/common";

import { cacheManager } from "./storage/cacheManager";

function CacheControls() {
    const [stats, setStats] = useState({ count: 0, totalBytes: 0 });
    const [clearing, setClearing] = useState(false);

    const updateStats = async () => {
        const currentStats = await cacheManager.getStats();
        setStats(currentStats);
    };

    useEffect(() => {
        updateStats();
    }, []);

    const handleClear = async () => {
        setClearing(true);
        try {
            await cacheManager.clearCache();
            await updateStats();
        } finally {
            setClearing(false);
        }
    };

    const mb = (stats.totalBytes / (1024 * 1024)).toFixed(2);

    return (
        <Flex flexDirection="column" gap="8px">
            <Paragraph>
                Cached media items: <strong>{stats.count}</strong> ({mb} MB)
            </Paragraph>
            <Flex gap="8px">
                <Button
                    variant="dangerSecondary"
                    size="small"
                    disabled={clearing || stats.count === 0}
                    onClick={handleClear}
                >
                    {clearing ? "Clearing..." : "Clear Cache"}
                </Button>
                <Button
                    variant="secondary"
                    size="small"
                    onClick={updateStats}
                >
                    Refresh Stats
                </Button>
            </Flex>
        </Flex>
    );
}

export const settings = definePluginSettings({
    cacheGifs: {
        type: OptionType.BOOLEAN,
        description: "Cache animated GIFs and Tenor embeds",
        default: true,
    },
    cacheEmojis: {
        type: OptionType.BOOLEAN,
        description: "Cache custom server and reaction emojis",
        default: true,
    },
    cacheStickers: {
        type: OptionType.BOOLEAN,
        description: "Cache custom stickers (PNG, APNG, Lottie)",
        default: true,
    },
    cacheAvatars: {
        type: OptionType.BOOLEAN,
        description: "Cache user avatars, banners, and server icons",
        default: true,
    },
    cacheVideos: {
        type: OptionType.BOOLEAN,
        description: "Cache MP4 and WebM video embeds",
        default: true,
    },
    cacheAttachments: {
        type: OptionType.BOOLEAN,
        description: "Cache image attachments sent in chat",
        default: true,
    },
    maxCacheSizeMB: {
        type: OptionType.SLIDER,
        description: "Target maximum cache size (in MB)",
        markers: [500, 1000, 3000, 10000],
        default: 3000,
        stickToMarkers: true,
    },
    cacheControls: {
        type: OptionType.COMPONENT,
        description: "Manage local cached files",
        component: CacheControls,
    },
});
