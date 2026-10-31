# GifCache Plugin for Vencord & Vesktop

Caches loaded GIFs, WebP animations, and Tenor videos locally to Chromium's `CacheStorage` so they load instantly and never re-download over slow internet connections.

## Features
- **Persistent Local Disk Caching**: Stored in `CacheStorage` (`vencord-gif-cache-v1`), surviving client restarts.
- **Zero-Latency In-Memory Blob Pooling**: Serves local `blob:` URLs immediately without hitting the network on repeat views.
- **Renderer RAM Safety**: Limits active in-memory blob URLs and revokes unused object URLs using `URL.revokeObjectURL` to prevent memory leaks.
- **Configurable Settings**: In-app controls for cache limits, video caching toggles, live statistics, and cache clearing.

## Verification & QA
1. **Console Check**:
   ```js
   const cm = Vencord.Plugins.plugins.GifCache.cacheManager;
   console.log(await cm.getStats());
   ```
2. **Clear Cache**:
   ```js
   await Vencord.Plugins.plugins.GifCache.cacheManager.clearCache();
   ```
