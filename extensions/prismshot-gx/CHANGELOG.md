# Changelog

## 1.0.1

- Sanitize slashes in page titles and filename templates so they cannot create unintended subdirectories.
- Reject visible captures when the active tab changes while a capture is being prepared or taken.
- Use the paused video time for visible-capture metadata and clear completed message timeout timers.
- Add optional local debug console records, disabled by default.

## 1.0.0

- Initial Opera GX and Chromium Manifest V3 release
- Hybrid source-frame and visible-player capture engine
- Cross-frame video detection and coordinate mapping
- PNG, WebP, and JPEG encoding
- Native, 2x, 4K, and 8K output modes
- Clipboard, downloads, filename templates, and burst capture
- On-video toolbar, popup dashboard, options page, and local history
- Optional clarity boost, letterbox trimming, and timestamp watermark
