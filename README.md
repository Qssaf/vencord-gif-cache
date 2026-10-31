# GifCache

A [Vencord](https://vencord.dev) userplugin for Discord desktop and [Vesktop](https://github.com/Vencord/Vesktop) that saves GIFs, emojis, stickers, avatars and images to disk, so on a slow connection they only ever download once.

## How it works

- **Saved as real files** in `<Discord or Vesktop data folder>/GifCache/` (for Vesktop on Linux: `~/.config/vesktop/GifCache/`), with an index and a size limit. Least recently used files are removed first.
- **No extra downloads.** Images load normally, then their bytes are read back out of Chromium's HTTP cache and saved. Looping GIF videos, which Discord's proxy serves without CORS headers, are downloaded once by the main process instead of by the browser.
- **Served from disk on the first render after a restart.** The plugin hooks the `src` of every `<img>` and `<video>`, so it covers all of Discord's components without patching any of them. A cached file is shown with no network request at all.
- **Survives Discord's link signing.** Attachment URLs carry expiring `ex`/`is`/`hm` parameters that change while the file stays the same. Those parameters are left out of the cache key.
- **Bounded memory.** Loaded files are kept as `blob:` URLs within a 128 MB budget. Ones still on screen are never revoked.

### What gets cached

| Setting | Covers |
| --- | --- |
| GIFs | Tenor, Giphy and Klipy GIFs, GIF/WebP attachments, looping GIF videos |
| Emojis | Custom emojis |
| Stickers | PNG, APNG and GIF stickers (not Lottie) |
| Profiles | Avatars, server icons, banners, avatar decorations |
| Images | Image attachments and embed images |

Regular videos and files are never cached, and no single file over 25 MB is stored.

## Installation

Requires a [Vencord build from source](https://docs.vencord.dev/installing/custom-plugins/).

```sh
cd Vencord/src/userplugins
git clone https://github.com/Qssaf/vencord-gif-cache gifCache
cd ../..
pnpm build   # then inject or copy dist/ as you normally do
```

Then **fully restart** Discord or Vesktop (quit it from the tray). The plugin has a native part that runs in the main process, which only loads on a full restart. Enable **GifCache** under Settings → Vencord → Plugins. The plugin settings show the cache size, with buttons to open the folder or clear it.

Desktop only: the Vencord browser extension has no native process.

## License

GPL-3.0-or-later
