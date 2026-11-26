# Changelog

Per-release, per-component notes ship with each release in `Release/` (latest: [CHANGELOG-2026.10.13.txt](Release/CHANGELOG-2026.10.13.txt)). This file records repository changes between releases.

## Unreleased (repository only; no extension bytes changed)

- README rebuilt around a cover image, real headless renders of every extension's popup, side panel and settings pages, and a real terminal shot of the source gate. All existing sections kept.
- NEXUS Research source: one type-only cast in `src/panel.ts` so it typechecks with `@types/chrome` 0.3.x. The rebuilt bundle is byte-identical to the shipped one (runtime parity verified).
- TypeScript 7.0.2 (Dependabot #7) and `@types/chrome` 0.3.7 (Dependabot #8) for the NEXUS Research source build; bundle unchanged.
- CI: removed a stale lockfile-rewrite step that pointed at a private npm mirror; both lockfiles already resolve from the public registry.
