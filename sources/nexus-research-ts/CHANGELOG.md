# Changelog

## 1.0.2 - 2026-10-12

- Block duplicate submissions during page extraction and allow Stop to cancel before an API request starts.
- Send the current user request once, without an empty assistant turn.
- Handle streaming CRLF split across chunks and a final event without a trailing blank line.
- Remember the originating page in Opera's tab fallback; avoid capturing the research tab as a screenshot.
- Apply context-menu requests to an already open research tab and protect active sessions from deletion.
- Stop rendered answers from loading remote images or media.
- Update DOMPurify to 3.4.17 and add regression tests and opt-in console diagnostics.
