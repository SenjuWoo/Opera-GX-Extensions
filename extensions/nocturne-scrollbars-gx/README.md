# Nocturne Scrollbars GX

A dark-modern scrollbar engine for Opera GX, Google Chrome, Microsoft Edge, Vivaldi, Brave, and other Chromium browsers.

## Highlights

- Manifest V3 architecture
- One generated CSS style node per frame
- Global and per-site profiles
- Exact-domain and `*.example.com` wildcard rules
- Six tuned dark presets plus full custom controls
- Adaptive page-background blending
- Automatic contrast correction
- Gradient, glow, border, geometry, visibility, and motion controls
- All-frame support, including same-origin and permitted child frames
- Optional open Shadow DOM coverage for web components
- Context-menu actions and assignable keyboard commands
- JSON import/export
- No analytics, telemetry, remote code, network requests, accounts, or subscriptions

## Install in Opera GX

1. Extract the ZIP.
2. Open `opera://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the extracted `nocturne-scrollbars-gx` folder.
6. Pin the extension and open its popup.

For local HTML files, enable **Allow access to file URLs** in the extension details page.

## Browser limitations

Chromium prevents extensions from injecting into protected browser pages such as `opera://`, `chrome://`, extension stores, and some built-in PDF/browser viewers. No scrollbar extension can bypass those restrictions through supported extension APIs.

Closed Shadow DOM cannot be styled from an extension. Nocturne's optional deep-coverage mode handles open Shadow DOM only.

## Performance model

The default mode performs no recurring polling and no mutation scanning. It reads settings once, inserts one style element, then reacts only to settings changes. Optional Shadow DOM coverage adds a one-time idle scan and a mutation observer for newly inserted web components.

## Development

Open `opera://extensions`, enable Developer mode, and load this folder unpacked. After editing files, click **Reload** on the extension card.

Run the dependency-free regressions with `node tests/regression.cjs`.

## Diagnostics

Debug logging is off by default. In this extension's service-worker console at `opera://extensions`, run `chrome.storage.local.set({ debugLog: true })`, then refresh a webpage. Version, resolved settings, and application/cleanup events appear in that page's DevTools console (select the Nocturne content-script context); storage/menu errors also appear in the worker console. Set `debugLog: false` to turn debug logging off. Logs stay local in DevTools.
