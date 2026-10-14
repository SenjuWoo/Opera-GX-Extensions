# Changelog

## 1.0.3 - 2026-10-13

- Discard screenshots when their tab or URL changes before or during capture.
- Mark stopped or failed partial answers as incomplete; report an empty reply as a failure.
- Stop remaining tab extraction after cancellation and avoid querying extra tabs when none are selected.
- Finish on the SSE completion marker and release stream readers on success and failure.
- Deduplicate page links in one pass and stop at the extraction budget.

## 1.0.2 - 2026-10-12

- Block duplicate submissions during page extraction and allow Stop to cancel before an API request starts.
- Send the current user request once, without an empty assistant turn.
- Handle streaming CRLF split across chunks and a final event without a trailing blank line.
- Remember the originating page in Opera's tab fallback; avoid capturing the research tab as a screenshot.
- Apply context-menu requests to an already open research tab and protect active sessions from deletion.
- Stop rendered answers from loading remote images or media.
- Update DOMPurify to 3.4.17 and add regression tests and opt-in console diagnostics.
