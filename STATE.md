# Extension pack state

Milestone: local candidates verified; upstream integration and publication pending, 2026-10-12.

- Starting source: `70ac680`, clean main branch. Nine extension folders audited.
- Current versions: Aegis 1.3.6, GX Overdrive 1.2.3, NebulaGrab 1.3.2, PrismShot 1.0.1, PopShield 1.0.3, Nocturne 1.1.1, OLED Forge 1.0.2, NEXUS Research 1.0.2, Nexus Archive Helper 1.1.2; companion 1.3.1.
- Original files, signing keys and packages backed up under the ignored `_archive/audit-2026-10-12/` tree. No normal Opera profile or stored settings edited.
- Local gate passed: 20 extension suites, source JS syntax checks, NEXUS five behavioral tests, Archive 35 tests, companion 11 tests, signing-identity preservation and payload validation. Feed-update races and relay validation received additional red/green regressions.
- Isolated Opera GX (Chromium 152.0.7977.120) verified native HTTP/HTTPS/IPv4/IPv6 trusted download permissions and three blob downloads without refreshing; all nine extension UI entrypoints loaded.
- Signed candidates passed cryptographic identity/signature checks (tampering rejected); extracted packages passed the same native Opera download test and all nine UI entrypoints. These are local candidates, not yet published.
- Resume finding: canonical origin is `SenjuWoo/Opera-GX-Extensions` (same repository ID as the former account URL). Remote main advanced to `4f5f607` with six commits, including security hardening and DOMPurify 3.4.16. Preserve these while rebasing the local maintenance changes, retain newer DOMPurify 3.4.17, then rebuild, push, verify exact-SHA CI/security status and publish/verify `v2026.10.12`.
- Companion full distribution also passed its extracted server entrypoint and health API with isolated storage. Plain-text per-extension changelog is in `Release/CHANGELOG-2026.10.12.txt`.
- Optional Archive Helper installed identity differs from the pre-existing source signing key. Its new CRX may install separately; preserve old settings/key until migration. Core eight extension signing identities match the installed IDs.

Continue from this file and `git status`; do not redo completed source research.
