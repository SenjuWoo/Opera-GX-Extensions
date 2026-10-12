# Changelog

## 1.0.2 — 2026-10-12

- Stop scanning immediately when global or site settings disable the engine.
- Cancel pending idle work and reset queued-node tracking so reloads cannot skip unfinished nodes.
- Restore temporarily detached elements and prevent disabled panel guards from rearming on interaction.
- Classify original page colors during the delayed scan instead of classifying OLED Forge's converted output.
- Add lifecycle regressions and opt-in local `debugLog` console diagnostics.

## 1.0.1

- Existing adaptive OLED renderer, surface/prose detection, and packaged manifest tests.
