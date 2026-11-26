# Decisions

## 2026-11-26 - Ship updates as ZIP-only while the signing keys are unavailable

**Context.** `tools/build.ps1` signs each `.crx` with Opera's packer using
`tools/keys/<slug>.pem`. That private key *is* the extension identity: Chromium derives
the extension ID from the public key, and every manifest pins that public key as `key`.
All nine pinned IDs match the IDs of the installed `.crx` copies. The private keys are
not available to the builder. A search of the project's own folders and the usual
backup locations found none. With a pinned `key` and no matching `.pem`, `build.ps1`
stops with "Signing key missing" before packing anything. CI's `signing-identity` job
tests that guard.

Dependabot #9 (DOMPurify 3.5.0), #10 (esbuild 0.28.2) and #11 (marked 18.2.1) change the
shipped NEXUS Research bundle, so they need a version bump and a new package.

**Options considered.**

1. *Generate new keys.* Rejected. A new key means a new extension ID. A `.crx` signed
   with it installs as a second, separate extension. Settings, saved sessions and
   stored API keys stay with the old ID. Removing the old copy deletes them.
2. *Leave the PRs open until the keys turn up.* Rejected. It blocks dependency and
   sanitizer updates indefinitely.
3. *Ship the update as a ZIP under the existing pinned key, and keep the newest signed
   `.crx` published.* Chosen.

**Decision.** Option 3. The bumps go in on `main`, NEXUS Research becomes 1.0.4, and
the release carries `nexus-v1.0.4.zip` plus `nexus-v1.0.3.crx`, still the newest
signed build. The other release files are carried over byte for byte. The `build.ps1`
identity guards, the manifest `key` values and the runtime-sync key check are unchanged.

**Why this is the least harmful route.**

- No extension ID changes, and no installed copy is stranded.
- The ZIP is already the documented install route for Chrome, Edge and Brave. Its
  manifest keeps the pinned `key`, so an unpacked load gets the same ID as the signed
  build.
- Staying on the 1.0.3 `.crx` carries no known vulnerability. The GitHub advisory
  database lists no advisory for dompurify 3.4.17 or marked 15.0.12; the only esbuild
  0.25.12 entry is withdrawn and concerns Deno. The repository had zero open
  Dependabot alerts before the bump. The DOMPurify 3.5.0 security fixes target
  `SAFE_FOR_TEMPLATES`, `IN_PLACE` and DOM-node input. NEXUS calls
  `DOMPurify.sanitize` on a string and uses none of those.
- Rendered output is unchanged. The same seeded markdown, including script, event-handler,
  `javascript:` and `data:` payloads, produced identical side-panel HTML in 1.0.3 and
  1.0.4. That test ran with the real extension in an isolated headless Opera GX 140
  profile.

**Not verified.** Whether loading the 1.0.4 ZIP unpacked over an installed 1.0.3 `.crx`
keeps that copy's stored data. The README tells users to keep a backup copy first
(the side panel can export sessions as JSON but has no import), or to stay on 1.0.3.

**How the ZIP was built.** `tools/package-zip-unsigned.py` mirrors `build.ps1`'s
staging, without signing:

1. Copy `extensions/<folder>` from a checkout made with `core.autocrlf=false`.
2. Remove `.git`, `_metadata`, `tests`, `tools`, `node_modules`, `package.json`,
   `package-lock.json` and `QA_REPORT.md`.
3. Run `node tools/validate-extension.mjs <stage>`.
4. Zip with forward-slash entry names and the fixed 2000-01-01 timestamp.

It refuses an extension without a pinned `key`. Run against release commit
`fcc37016e4407e383462c9bc8d8f328af1146d80`, it reproduces the published
`nexus-v1.0.4.zip` byte for byte (SHA-256 `3A2C5D10…FC4CD2`). Run against the 1.0.3
source, it reproduced every runtime file of the published `nexus-v1.0.3.zip`; only
`CHANGELOG.md` line endings differed.

Do not package ZIPs with Windows PowerShell 5.1. Its `Compress-Archive` writes
backslash entry names, and `Build.cmd` launches `powershell.exe`, which is 5.1. The
published ZIPs before this release came from PowerShell 7.

**Reversal.** If the original `.pem` files turn up, put them in `tools/keys/`, make an
LF checkout (`core.autocrlf=false`), and run `Build.cmd -NoZip`. The builder checks
each key against the pinned manifest key and signs a normal in-place-update `.crx`,
`nexus-v1.0.4.crx` included. `-NoZip` leaves the published ZIPs untouched; otherwise
a 5.1 run would replace them with backslash-named archives. `SHA256SUMS.txt` is
regenerated from the working tree, so the LF checkout keeps text-file hashes equal
to the published bytes. Generating new identities stays a deliberate, per-extension
owner decision with a migration plan. It never happens as a side effect of a build.
