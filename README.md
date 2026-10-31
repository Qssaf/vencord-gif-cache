# Vencord GIF Cache (`GifCache`)

A custom [Vencord](https://vencord.dev) and [Vesktop](https://github.com/Vencord/Vesktop) userplugin that persistently caches loaded GIFs, animated WebP images, and Tenor MP4 videos to local storage. 

Once media is loaded on your client, it is stored locally and served instantly on repeat views without re-downloading over the internet—ideal for slow, metered, or unstable connections.

---

## Features

- **Persistent Disk Caching**: Stores media files in Chromium's persistent `CacheStorage` API (`vencord-gif-cache-v1`), surviving client restarts and computer reboots.
- **Cross-Account Sharing**: Cached by media URL rather than Discord user ID. Any GIF loaded on one Discord account loads instantly on your other accounts on the same client.
- **Zero-Latency In-Memory Blob Pooling**: Serves local `blob:` URLs directly to Discord's image and video renderers without touching the network.
- **Renderer RAM Safety**: Includes reference-counted blob pooling with LRU eviction and automatic `URL.revokeObjectURL` cleanup to ensure Discord does not leak memory.
- **In-App Management**: Built-in Vencord settings panel to configure cache size limits, toggle video caching, view live storage statistics, and clear the cache anytime.

---

## Installation

### Method 1: In a Local Vencord Build

Clone this repository directly into your Vencord `src/userplugins` folder:

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
   - Adjust maximum cache size (default: 2000 MB).
   - Toggle whether to cache MP4 videos in addition to GIF/WebP formats.
   - View current cached item counts and disk usage.
   - Clear local cached files at any time.

---

## License

This project is licensed under the GNU General Public License v3.0 (GPL-3.0-or-later) to maintain compatibility with Vencord.
