# Changelog

## 1.3.3

- Honor automatic-scanning and network-capture settings in open pages; stop observers and pending scans when disabled while keeping manual Scan available.
- Recognize audio-prefixed HLS manifests and ISO segment MIME types before generic audio/video detection.
- Accept media URLs containing a literal malformed percent escape without breaking detection.
- Order session writes and navigation clears so an old in-flight save cannot resurrect the previous page's media.

## 1.3.2

- Keep concurrent session hydration from losing media or restoring a cleared tab; restore items before download/analyze actions after worker suspension.
- Restrict companion pairing to loopback origins and reject redirects that could leak the pairing token.
- Keep captured Cookie/Authorization values out of newly persisted segment state.
- Stop collecting and clear transient request credentials when network capture is disabled; reject invalid page-supplied media kinds.
- Preserve content query parameters in cache identities, while allowing signed-link token/expiry renewal.
- Report failed blob downloads and persist manifest analysis updates.
- Stop waiting for a cloned fetch stream to finish before reporting a sniffed manifest; skip binary media sniffing.
- Add optional local debug console records, disabled by default.

## 1.3.1

Fixed
- Settings arrived from a message and were written through completely unchecked.
  `helperUrl` is the one that matters: the companion token is sent to it as a
  request header, so an unvalidated value is a way to hand that token to an
  arbitrary host. It is now parsed, restricted to http/https, and reduced to its
  origin. Numeric settings are clamped, booleans coerced, the download folder
  sanitised, and the container/browser fields pattern-checked.
- The cached settings object was never invalidated when storage changed outside
  the SAVE_SETTINGS path, so the worker could keep serving a stale copy.

Changed
- The `onBeforeRequest` and `onHeadersReceived` listeners fire for every request
  on every tab. Both now reject the two cheap cases synchronously before awaiting
  anything, so a page pulling 400 assets with capture disabled no longer queues
  400 microtasks and a settings read each.
