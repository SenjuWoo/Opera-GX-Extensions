# Changelog

## 1.3.2

- Restart oversized incomplete fragment caches before requesting a resume range, including fragments without an explicit captured byte range.

## 1.3.1

- Strip captured cookies and authorization from cross-origin Python redirects and nested HLS playlist inspection.
- Reserve filenames across active jobs to prevent simultaneous downloads overwriting one another.
- Ignore browser preview byte ranges for whole-file downloads; validate resumed and chunked response ranges and final sizes.
- Validate captured-fragment ranges and sizes; bound missing-sequence reporting so large sequence gaps cannot exhaust memory.
- Mark invalid fragment jobs failed so they cannot remain queued and block retries indefinitely.
- Preserve content query parameters in resumable cache identities.
- Preserve malformed configuration files instead of replacing pairing tokens and user paths with defaults.
- Add optional rotating debug logging, disabled by default.

## 1.3.0

- Resumable direct, HLS/DASH, captured-fragment, and Smart Fetch downloader.
