# Extension pack state

Milestone: maintenance release published and downloaded bytes verified, 2026-10-13.

- Starting source: `70ac680`, clean main branch. Nine extension folders audited.
- Current versions: Aegis 1.3.6, GX Overdrive 1.2.3, NebulaGrab 1.3.2, PrismShot 1.0.1, PopShield 1.0.3, Nocturne 1.1.1, OLED Forge 1.0.2, NEXUS Research 1.0.2, Nexus Archive Helper 1.1.2; companion 1.3.1.
- Original files, signing keys and packages backed up under the ignored `_archive/audit-2026-10-12/` tree. No normal Opera profile or stored settings edited.
- Local gate passed: 20 extension suites, source JS syntax checks, NEXUS five behavioral tests, Archive 35 tests, companion 15 tests, signing-identity preservation and payload validation. Feed-update races and relay validation received additional red/green regressions.
- Isolated Opera GX (Chromium 152.0.7977.120) verified native HTTP/HTTPS/IPv4/IPv6 trusted download permissions and three blob downloads without refreshing; all nine extension UI entrypoints loaded.
- Signed packages passed cryptographic identity/signature checks (tampering rejected); extracted packages passed the same native Opera download test and all nine UI entrypoints. All 181 packaged files match source. The post-CI rebuild matched the committed release bytes exactly.
- Integrated all six upstream commits through `4f5f607`, preserving URL/SSRF/header and relay hardening. DOMPurify remains 3.4.17. Added CI runtime parity checks and safe source sync commands; both dependency audits returned zero vulnerabilities.
- Release source/tag: `89ada21a6d37eb8919605186f580392d01d1ac33`, [v2026.10.12](https://github.com/SenjuWoo/Opera-GX-Extensions/releases/tag/v2026.10.12). [CI](https://github.com/SenjuWoo/Opera-GX-Extensions/actions/runs/38320465294) and [CodeQL](https://github.com/SenjuWoo/Opera-GX-Extensions/actions/runs/38320464957) passed on that exact SHA. Tag, Latest status and rendered public pages verified.
- All 22 published assets were downloaded without authentication into a fresh local folder; nonempty sizes and SHA-256 matched the local build and the complete checksum inventory. Open Dependabot, code-scanning and secret-scanning alerts were zero; GitHub code quality returned unavailable (404) and was left off.
- Companion full distribution also passed its extracted server entrypoint and health API with isolated storage. Plain-text per-extension changelog is in `Release/CHANGELOG-2026.10.12.txt`.
- Optional Archive Helper installed identity differs from the pre-existing source signing key. Its new CRX may install separately; preserve old settings/key until migration. Core eight extension signing identities match the installed IDs.

Normal-profile installation, live OpenRouter/Nexus requests, site-specific media extraction and long-duration browsing were not performed. Extension debug toggles/log consoles are documented per README; companion logs use `%LOCALAPPDATA%/NebulaGrab/Logs/companion.log` when enabled.

Maintenance is complete. Continue from this file and `git status`; do not redo completed source research. Local verification evidence remains under the ignored audit tree.
