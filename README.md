# Vencord Media & GIF Cache (`GifCache`)

A custom [Vencord](https://vencord.dev) and [Vesktop](https://github.com/Vencord/Vesktop) userplugin that persistently caches GIFs, custom emojis, stickers, avatars, server banners, and Tenor/MP4 videos directly to local disk.

Once any media is loaded on your client, it is saved locally to Chromium's `CacheStorage` and served instantly from memory blob URLs on subsequent views—saving massive amounts of bandwidth on slow, metered, or unstable connections.

---

## What Gets Cached?

- **GIFs & Tenor Embeds**: Tenor MP4 videos, Giphy animations, WebP animations.
- **Custom Emojis**: Server emojis and reaction emojis from `cdn.discordapp.com/emojis/`.
- **Stickers**: Custom PNG, APNG, and Lottie stickers.
- **Avatars & Banners**: User avatars, profile banners, server icons, and guild banners.
- **Chat Attachments**: Images and media uploaded directly to channels.

---

## Features

- **Persistent Disk Caching**: Stores files in Chromium's persistent `CacheStorage` API (`vencord-gif-cache-v1`), surviving client restarts and PC reboots.
- **Cross-Account Sharing**: Cached by media URL rather than Discord user ID. Any emoji, avatar, or GIF loaded on one account loads instantly on your other accounts on the same client.
- **Zero-Latency In-Memory Blob Pooling**: Serves local `blob:` URLs directly to Discord's image and video renderers without touching the network.
- **Renderer RAM Safety**: Includes reference-counted blob pooling with LRU eviction and automatic `URL.revokeObjectURL` cleanup to ensure Discord never leaks memory.
- **Granular Settings**: Toggle caching individually for GIFs, Emojis, Stickers, Avatars, Videos, and Attachments, adjust max disk cache size, view live storage statistics, and clear the cache anytime.

---

## Installation

### In a Local Vencord Build

Clone this repository into your Vencord `src/userplugins` folder:

```bash
cd Vencord/src/userplugins
git clone https://github.com/Qssaf/vencord-gif-cache.git gifCache
```

Rebuild Vencord:

```bash
pnpm build
```

Then reload or restart Discord / Vesktop.

---

## Configuration

In Discord / Vesktop:
1. Open **User Settings** -> **Plugins**.
2. Search for **GifCache** and ensure it is enabled.
3. Open the plugin settings gear to:
   - Toggle individual media categories (GIFs, Emojis, Stickers, Avatars, Videos, Attachments).
   - Adjust maximum cache size (default: 3000 MB).
   - View live cached item count and disk usage in megabytes.
   - Clear local cached files at any time.

---

## License

This project is licensed under the GNU General Public License v3.0 (GPL-3.0-or-later) to maintain compatibility with Vencord.
