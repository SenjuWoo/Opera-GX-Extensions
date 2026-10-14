# Changelog

## 1.0.3 — 2026-10-13

- Read OKLCH, Lab, Display P3 and other browser-supported CSS colors with a bounded native color cache.
- Repair layered transparency, deep-wrapper backdrops and text on mid-gray surfaces.
- Preserve image captions, editable regions, masked icons, colored links and gradient-painted letters; lift unreadable neutral gradients without flattening their stops.
- Track live text, class, inline style and theme changes; invalidate removed stylesheets without observing our own changes recursively.
- Reject stale settings reads, release detached nodes and drain queues without repeatedly shifting large arrays.
- Restore original page paint for printing and disabling, with native Opera readability regressions.

## 1.0.2 — 2026-10-12

- Stop scanning immediately when global or site settings disable the engine.
- Cancel pending idle work and reset queued-node tracking so reloads cannot skip unfinished nodes.
- Restore temporarily detached elements and prevent disabled panel guards from rearming on interaction.
- Classify original page colors during the delayed scan instead of classifying OLED Forge's converted output.
- Add lifecycle regressions and opt-in local `debugLog` console diagnostics.

## 1.0.1

- Existing adaptive OLED renderer, surface/prose detection, and packaged manifest tests.
