/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Qssaf
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Flex } from "@components/Flex";
import { Paragraph } from "@components/Paragraph";
import { OptionType } from "@utils/types";
import { useEffect, useState } from "@webpack/common";

import { clearCache, Native, setLimit } from "./cache";

function CacheControls() {
    const [stats, setStats] = useState<{ count: number; bytes: number; } | null>(null);
    const [busy, setBusy] = useState(false);

    const refresh = () => Native?.stats().then(setStats);
    useEffect(() => void refresh(), []);

    if (!Native) return <Paragraph>Fully restart Discord (quit from the tray) to finish installing GifCache.</Paragraph>;

    const clear = async () => {
        setBusy(true);
        try {
            await clearCache();
            await refresh();
        } finally {
            setBusy(false);
        }
    };

    return (
        <Flex flexDirection="column" gap="8px">
            <Paragraph>
                {stats ? <>Cached: <strong>{stats.count}</strong> files, <strong>{(stats.bytes / 1024 / 1024).toFixed(1)} MB</strong></> : "Loading…"}
            </Paragraph>
            <Flex gap="8px">
                <Button variant="secondary" size="small" onClick={refresh}>Refresh</Button>
                <Button variant="secondary" size="small" onClick={() => Native?.openFolder()}>Open Folder</Button>
                <Button variant="dangerSecondary" size="small" disabled={busy || !stats?.count} onClick={clear}>
                    {busy ? "Clearing…" : "Clear Cache"}
                </Button>
            </Flex>
        </Flex>
    );
}

// Keys match the categories in urls.ts
export const settings = definePluginSettings({
    gifs: {
        type: OptionType.BOOLEAN,
        description: "Cache GIFs: Tenor, Giphy and Klipy GIFs, GIF attachments and looping GIF videos",
        default: true,
    },
    emojis: {
        type: OptionType.BOOLEAN,
        description: "Cache custom emojis",
        default: true,
    },
    stickers: {
        type: OptionType.BOOLEAN,
        description: "Cache stickers (PNG, APNG and GIF; Lottie stickers are not cached)",
        default: true,
    },
    profiles: {
        type: OptionType.BOOLEAN,
        description: "Cache avatars, server icons, banners and avatar decorations",
        default: true,
    },
    images: {
        type: OptionType.BOOLEAN,
        description: "Cache image attachments and embed images. Regular videos and files are never cached",
        default: true,
    },
    maxSizeMB: {
        type: OptionType.SLIDER,
        description: "Maximum cache size on disk (MB). Least recently used files are removed first",
        markers: [250, 500, 1000, 2000, 5000, 10000],
        default: 2000,
        stickToMarkers: true,
        onChange: (value: number) => void setLimit(value),
    },
    controls: {
        type: OptionType.COMPONENT,
        description: "",
        component: CacheControls,
    },
});
