# NebulaGrab 1.3.2 for Opera GX

NebulaGrab detects direct media, images, audio, HLS, DASH, blobs, and segmented CDN delivery in Opera GX and other Chromium browsers.

For optional diagnostics, open this extension's service-worker console from `opera://extensions` and run `chrome.storage.local.get('settings').then(({settings}) => chrome.storage.local.set({settings: {...settings, debugLog: true}}))`. Repeat with `false` to disable. Version, effective capture flags, job starts and failures appear in that console; pairing tokens and captured request headers are omitted. Debug logging is off by default.

Regression checks: `node extensions/nebulagrab/tests/regression.mjs` from the pack folder.

## Fragment-aware capture

Version 1.3.0 no longer treats every `seg-*`, `.ts`, or `.m4s` request as a separate video. It groups numbered fragments into one **SEG** stream family, captures exact request headers and byte ranges, associates initialization fragments, and prefers a related manifest when available.

Selecting a SEG row sends the family to the companion for disk-cached recovery. Smart Fetch can also use all captured fragment families when ordinary page and manifest extraction fail.

## Install unpacked

1. Extract the extension archive.
2. Open `opera://extensions`.
3. Enable Developer mode.
4. Select **Load unpacked**.
5. Choose the folder containing `manifest.json`.
6. Pin NebulaGrab.

The companion is strongly recommended for resumable direct files and required for HLS, DASH, Smart Fetch, and raw fragment assembly.

NebulaGrab handles media the current session is authorized to access. It does not bypass DRM, encryption keys, paywalls, account controls, or region restrictions.
