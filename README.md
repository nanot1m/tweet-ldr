# Tweet LDR

Tweet LDR is a lightweight Chrome extension for saving useful media from X/Twitter posts. It adds compact controls directly into each tweet so you can download videos when possible or export a polished tweet screenshot.

[![Chrome Extension](https://img.shields.io/badge/Chrome-Manifest%20V3-1a73e8?style=for-the-badge&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![GitHub Pages](https://img.shields.io/badge/Landing%20Page-GitHub%20Pages-24292f?style=for-the-badge&logo=github&logoColor=white)](https://nanot1m.github.io/tweet-ldr/)

## Features

- Adds video and screenshot buttons to tweets on `x.com` and `twitter.com`.
- Downloads direct MP4 URLs when X exposes them.
- Watches X API responses for real `video.twimg.com` MP4 variants and validates them before saving.
- Falls back to Tweeload for public tweets when no valid MP4 variant is available.
- Records the playing video stream only as a final fallback.
- Saves styled tweet screenshots as transparent PNGs with rounded corners and a soft shadow.
- Hides extension UI and suppresses hover/focus artifacts during screenshot capture.

## Install Locally

1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this repository folder.
6. Open or refresh `https://x.com`.

Downloads are saved under a `tweet-ldr/` folder in Chrome's downloads directory when Chrome's downloads API is used.

## How It Works

Tweet LDR uses a Manifest V3 content script to inject controls into tweet action bars. For video downloads, it tries fast options first:

1. Use a direct video URL if the tweet's video element exposes one.
2. Capture MP4 variants from X API responses and validate the downloaded blob.
3. Open Tweeload with the tweet URL for public posts.
4. Record the browser's playing video stream as a last resort.

For screenshots, it captures the visible tab, crops to the tweet bounds, and renders the result onto a transparent canvas with rounded clipping and shadow.

## Notes

- Blob video sources such as `blob:https://x.com/...` are not real downloadable files. They require an extracted MP4 variant, an external downloader, or real-time recording.
- Tweeload does not support private/protected tweets.
- Chrome's `MediaRecorder` MP4 support depends on browser version and codecs. The extension prefers MP4 and falls back to WebM for recordings.
- Screenshot capture only includes the visible viewport. Scroll long tweets fully into view before saving.

## Project Structure

```text
manifest.json          Chrome extension manifest
src/content.js         X/Twitter content script and screenshot/video logic
src/page-hook.js       Main-world hook for X API response media URLs
src/background.js      Downloads, tab capture, and tab-opening bridge
src/tweeload.js        Tweeload form autofill helper
src/styles.css         Injected tweet controls and capture cleanup styles
docs/                  GitHub Pages landing page
```

## Legal

Only download media you have the right to save. Prefer retweeting or linking to original posts when sharing other people's work.
