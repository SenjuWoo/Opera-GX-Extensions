# Changelog

## 1.1.2 — 2026-10-13

- Ignore stale asynchronous settings reads so an older refresh cannot re-enable scrollbars after a newer disable.
- Scan newly added subtrees in coalesced idle batches instead of walking the full document on every mutation burst.
- Include newly inserted shadow hosts themselves, skip detached queued nodes, and invalidate old idle batches across disable/re-enable.
- Blend adaptive tracks against the body background first, falling back to the root backdrop when transparent.

## 1.1.1 — 2026-10-12

- Restore detailed scrollbar styling in Chromium by keeping the competing standard properties at `auto`; retain a standard-only fallback.
- Remove styles from nested and detached shadow roots when disabled, and observe additions inside existing open shadow roots.
- Avoid repeated fallback-style mutations and unnecessary sync reads once local settings exist.
- Add dependency-free regressions and opt-in local `debugLog` console diagnostics.

## 1.1.0

Changed
- Appearance settings moved from `chrome.storage.sync` to `chrome.storage.local`.
  Sync caps writes at 120 per minute and 1800 per hour, which a few minutes of
  slider work in the Studio blows straight through; past the cap writes simply
  fail. Local has no such limit, so the save debounce dropped from 700 ms back to
  250 ms and edits apply nearly instantly.
- An existing sync profile is migrated on first read, so nothing is lost on
  update.

Added
- "Send profile to sync" and "Load profile from sync" buttons in Data & Privacy.
  Cross-machine sync is now a deliberate action instead of a side effect of
  moving a slider, and an oversized profile reports the 8 KB per-item limit
  instead of failing silently.
- Storage diagnostics now measure the whole area rather than a single key.

## 1.0.1

Fixed
- Deep Shadow DOM coverage kept running after Nocturne was disabled globally or
  on a site: `stopDeepCoverage()` never cleared its own enable flag, so an
  already-queued idle scan re-attached the stylesheet to every open shadow root.
- Deep coverage scanned every added node synchronously, one
  `querySelectorAll('*')` per mutation record. Mutations are now coalesced into a
  single idle scan per burst, which is what made busy SPAs stutter with the
  feature on.
- A rejected `chrome.storage.sync` write (throttled or oversized) left Nocturne
  Studio stuck on "Syncing…" forever with no error; failures are now reported and
  the save debounce was raised to 700 ms to stay under the sync write quota.

Added
- Default keyboard shortcuts for the two commands (`Alt+Shift+N` toggle site,
  `Alt+Shift+P` cycle preset). They previously shipped unbound, so neither
  command could fire until the user assigned keys by hand.

## 1.0.0 — Next-Gen Edition

- Initial release.
- Added the low-overhead all-frame scrollbar engine.
- Added six dark-modern presets and full geometry/chromatic controls.
- Added adaptive track blending and automatic contrast correction.
- Added global and exact/wildcard per-site profiles.
- Added optional open Shadow DOM coverage.
- Added popup quick controls, Nocturne Studio, context-menu actions, keyboard commands, and JSON import/export.
- Added reduced-motion, forced-colors, and coarse-pointer handling.
- Added local-only privacy architecture with no telemetry or network code.
