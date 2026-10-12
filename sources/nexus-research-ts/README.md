# NEXUS Research

NEXUS Research is an Opera GX and Chromium Manifest V3 side-panel extension for deep web investigation through the OpenRouter API.

## Core capabilities

- Live OpenRouter model catalog with tool-capable models and stable `~...-latest` aliases
- Streaming Chat Completions with robust SSE parsing, cancellation, usage, and cost display
- OpenRouter `openrouter:web_search` and `openrouter:web_fetch` server tools
- Optional `openrouter:fusion` multi-model deliberation in **Abyss** mode
- On-demand current-page extraction: selected text, article text, metadata, headings, links, tables, code blocks, and JSON-LD
- Optional visible-tab screenshot input for vision-capable models
- Multi-tab context after the user grants optional all-site access
- Prompt-injection-resistant research system instructions
- Source annotations, extracted URL citations, Markdown rendering, copy, and export
- Local research session archive with JSON export
- Per-request provider privacy controls: data-collection denial, ZDR enforcement, exact-parameter requirement, and provider fallbacks
- Context-menu actions for selected text, pages, and links

## Install in Opera GX

1. Extract `NEXUS-Research-OperaGX-Chrome-MV3.zip`.
2. Open `opera://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the extracted `NEXUS-Research` folder.
6. Pin NEXUS, then click its toolbar icon. Opera GX opens a research tab; Chrome and Edge use their native side panel.
7. Open NEXUS settings and enter an OpenRouter API key.

The same unpacked folder works in Chrome, Edge, Brave, and other current Chromium browsers with the Side Panel API.

## Build from source

```bash
npm install
npm test
npm run package
```

Build outputs:

- `dist/` ready for **Load unpacked**
- `release/NEXUS-Research-OperaGX-Chrome-MV3.zip` share-ready extension archive

Inside this monorepo, run `npm run sync:opera` to test, typecheck, build and safely update `extensions/nexus-research`. CI runs `npm run verify:runtime` after building to reject stale committed bundles. Source sync preserves the pinned signing key and owner documentation.

## Permission model

NEXUS does not inject a permanent content script. It extracts a page only after an explicit extension interaction. The base permissions cover the active page, side panel, local storage, downloads, and context menus. `<all_urls>` is optional and requested only for multi-tab extraction.

Protected browser pages, inaccessible frames, authentication barriers, DRM internals, passwords, cookies, and content not exposed by the page or OpenRouter tools are not accessible.

The Opera research tab remembers the page it was opened from for text extraction. Screenshots require a visible web page in the native side panel; the Opera research tab is never sent as a screenshot. Responses render text and links without loading remote images or media.

## Debug log

Open the research tab's DevTools console to view failures. For startup, resolved settings, and request lifecycle logs, run `chrome.storage.local.get('nexus_settings').then(({ nexus_settings = {} }) => chrome.storage.local.set({ nexus_settings: { ...nexus_settings, debug: true } }))` there, then reload the research tab. Set `debug: false` to return to quiet mode. API keys and prompt contents are never logged.

## API key storage

By default the OpenRouter key is stored in `chrome.storage.session`, which is cleared when the browser session ends. Enabling **Persist key on this browser** moves it to `chrome.storage.local`. Browser extension storage is not a hardware-backed secret vault; use a scoped OpenRouter key with an appropriate budget.

## Research modes

- **Quick:** low-latency search and compact synthesis
- **Deep:** broader search, more page fetching, cross-checking, and larger browser context
- **Abyss:** maximum search breadth plus optional OpenRouter Fusion deliberation; this can be substantially more expensive

## Notes

OpenRouter server tools are beta features and may change. Models vary in tool use, vision support, reasoning controls, context length, price, and provider availability. NEXUS loads the current model catalog dynamically and exposes model slugs directly so routing is never frozen to an outdated hardcoded list.
