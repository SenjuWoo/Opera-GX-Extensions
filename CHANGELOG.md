# Changelog

Per-release, per-component notes ship with each release in `Release/` (latest: [CHANGELOG-2026.11.26.txt](Release/CHANGELOG-2026.11.26.txt)). This file records repository changes between releases.

## v2026.11.26

- NEXUS Research 1.0.4: DOMPurify 3.5.0 (Dependabot #9), marked 18.2.1 (#11) and esbuild 0.28.2 (#10). Bundle rebuilt and synced with `npm run sync:opera`; runtime parity verified. The same seeded markdown, links and hostile HTML render to identical side-panel HTML in 1.0.3 and 1.0.4 (isolated headless Opera GX).
- NEXUS Research 1.0.4 ships as a ZIP only, under its existing pinned key. The private signing keys are not available, so no new `.crx` could be signed; the 1.0.3 `.crx` stays in the release as the newest signed build. No key was regenerated, so no extension ID changed. See [DECISIONS.md](DECISIONS.md).
- The other eight extensions and Companion 1.3.2 are unchanged; their release files are carried over byte for byte.
- README: install note for the ZIP-only NEXUS update and the current signing-key status.

## Repository changes after v2026.10.13 (no extension bytes changed)

- README rebuilt around a cover image, real headless renders of every extension's popup, side panel and settings pages, and a real terminal shot of the source gate. All existing sections kept.
- NEXUS Research source: one type-only cast in `src/panel.ts` so it typechecks with `@types/chrome` 0.3.x. The rebuilt bundle is byte-identical to the shipped one (runtime parity verified).
- TypeScript 7.0.2 (Dependabot #7) and `@types/chrome` 0.3.7 (Dependabot #8) for the NEXUS Research source build; bundle unchanged.
- CI: removed a stale lockfile-rewrite step that pointed at a private npm mirror; both lockfiles already resolve from the public registry.
