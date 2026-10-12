# Extension pack state

Milestone: upstream integrated; final packages and exact-source CI/publication pending, 2026-10-12.

- Starting source: `70ac680`, clean main branch. Nine extension folders audited.
- Current versions: Aegis 1.3.6, GX Overdrive 1.2.3, NebulaGrab 1.3.2, PrismShot 1.0.1, PopShield 1.0.3, Nocturne 1.1.1, OLED Forge 1.0.2, NEXUS Research 1.0.2, Nexus Archive Helper 1.1.2; companion 1.3.1.
- Original files, signing keys and packages backed up under the ignored `_archive/audit-2026-10-12/` tree. No normal Opera profile or stored settings edited.
- Local gate passed: 20 extension suites, source JS syntax checks, NEXUS five behavioral tests, Archive 35 tests, companion 15 tests, signing-identity preservation and payload validation. Feed-update races and relay validation received additional red/green regressions.
- Isolated Opera GX (Chromium 152.0.7977.120) verified native HTTP/HTTPS/IPv4/IPv6 trusted download permissions and three blob downloads without refreshing; all nine extension UI entrypoints loaded.
- Signed candidates passed cryptographic identity/signature checks (tampering rejected); extracted packages passed the same native Opera download test and all nine UI entrypoints. These are local candidates, not yet published.
- Integrated all six upstream commits through `4f5f607`, preserving URL/SSRF/header and relay hardening. DOMPurify remains 3.4.17. Added CI runtime parity checks and safe source sync commands. Final rebuild, exact-SHA CI/security and public download verification remain pending for `v2026.10.12`.
- Companion full distribution also passed its extracted server entrypoint and health API with isolated storage. Plain-text per-extension changelog is in `Release/CHANGELOG-2026.10.12.txt`.
- Optional Archive Helper installed identity differs from the pre-existing source signing key. Its new CRX may install separately; preserve old settings/key until migration. Core eight extension signing identities match the installed IDs.

Continue from this file and `git status`; do not redo completed source research.
