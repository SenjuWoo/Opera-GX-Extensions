<p align="center">
  <img src="assets/mark.svg" width="72" height="72" alt="Opera GX Extensions mark">
</p>

<h1 align="center">Opera GX Extensions</h1>

<p align="center"><strong>Local-first Manifest V3 tools for Opera GX.</strong></p>

<p align="center">
  Eight signed extensions, one optional Nexus Mods helper,<br>
  and the one-command packer that builds `.crx` + `.zip` + `SHA256SUMS.txt`.
</p>

<p align="center">
  <a href="https://github.com/SenjuWoo/Opera-GX-Extensions/actions/workflows/ci.yml"><img src="https://github.com/SenjuWoo/Opera-GX-Extensions/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-ff3ea5?labelColor=0d0f11" alt="MIT License"></a>
  <a href="https://github.com/SenjuWoo/Opera-GX-Extensions/releases/tag/v2026.09.02"><img src="https://img.shields.io/badge/release-v2026.09.02-8f9aa6?labelColor=0d0f11" alt="v2026.09.02"></a>
  <img src="https://img.shields.io/badge/manifest-V3-8f9aa6?labelColor=0d0f11" alt="Manifest V3">
</p>

<p align="center">
  <a href="#install">Install</a>
  ·
  <a href="#build">Build</a>
  ·
  <a href="#signing-keys">Signing</a>
  ·
  <a href="#honest-status">Status</a>
</p>

## Why it exists

Opera GX's packer can sign a real `.crx` from a private key you keep offline. These extensions are written to that path: no store listing required, IDs stable across unpacked and packed installs, settings survive version bumps.

They are not a telemetry suite. NEXUS Research and Nexus Archive Helper talk to APIs *you* configure (OpenRouter, Nexus Mods). The rest stay on the machine.

## What you get

| Extension | Version | What it does |
| --- | --- | --- |
| [GX Overdrive](extensions/gx-overdrive) | 1.2.2 | Performance governor: two-engine tab hibernation, long-chat folding for ChatGPT / Claude / Gemini / Perplexity, media throttling, download recovery |
| [Aegis GX Sentinel](extensions/aegis-gx-sentinel) | 1.3.5 | Privacy and threat shield: stealth ad / tracker blocking, phishing and malware defence, leak protection, per-rule block log |
| [NebulaGrab](extensions/nebulagrab) | 1.3.1 | Media detector with resumable downloads, HLS / DASH fragment capture, Smart Fetch |
| [PopShield GX](extensions/popshield-gx) | 1.0.2 | Popup, popunder, click-hijack and interstitial blocker — behavioural, not blocklist-driven |
| [Nocturne Scrollbars GX](extensions/nocturne-scrollbars-gx) | 1.1.0 | Dark modern scrollbars with presets, per-site profiles, adaptive contrast |
| [NEXUS Research](extensions/nexus-research) | 1.0.1 | Deep web research through OpenRouter with page intelligence and citations |
| [OLED Forge GX](extensions/oled-forge-gx) | 1.0.1 | True-black OLED treatment |
| [PrismShot GX](extensions/prismshot-gx) | 1.0.0 | Video frame capture |

Optional, not essential:

| Extension | Version | What it does |
| --- | --- | --- |
| [Nexus Archive Helper](extensions/nexus-archive-helper) | 1.1.1 | Resolves archived, old, hidden-page and deleted Nexus Mods files via the official Nexus API |

## Install

Download the `.crx` for what you want from [`Release/`](Release) and drag it onto `opera://extensions`.

Chrome, Edge and Brave reject any `.crx` without a Web Store publisher signature. On those, use the `.zip`: unpack it, then Developer mode → Load unpacked.

Latest packaged GitHub release: [v2026.09.02](https://github.com/SenjuWoo/Opera-GX-Extensions/releases/tag/v2026.09.02) (Nexus Archive Helper 1.1.1). The `Release/` folder in this tree is the same class of artifact, rebuilt from current manifests.

## Build

```powershell
Build.cmd
```

One command. It validates every manifest, signs a `.crx` and `.zip` per extension into `Release\`, writes `SHA256SUMS.txt`, and reports what your browser is running against what was just built.

It uses Opera's own packer — no OpenSSL, no third-party signing tools. Node.js is used only to derive a public key from a signing key.

To ship an update: raise `version` in that extension's `manifest.json`, run `Build.cmd`, drag the new `.crx` in. Same key plus a higher version is an in-place update, so settings, toolbar position and permissions survive.

## Project map

```text
extensions/     one folder per extension — the single source of truth
Release/        signed .crx + .zip + SHA256SUMS.txt
tools/          build.ps1, pubkey.cjs
tools/keys/     private signing keys — gitignored, never published
sources/        build inputs that are not loadable extensions
_archive/       superseded copies, gitignored
```

`sources/nexus-research-ts` is the TypeScript project behind NEXUS. Its shipped bundle is committed under `extensions/nexus-research`; rebuild it with:

```powershell
cd sources/nexus-research-ts
npm install
npm run build
```

`sources/nexus-archive-helper` is the project behind the optional helper. Rebuild and re-sync:

```powershell
cd sources/nexus-archive-helper
npm ci
npm run sync:opera
```

## Signing keys

Each extension has a private key in `tools/keys/`, which is **gitignored and must stay that way**. The matching public key is pinned in the manifest as `key`, so an extension's ID comes from the key rather than from an install path. That is what lets the same folder be loaded unpacked and shipped as a `.crx` under one identity, and what makes folder renames harmless.

Lost a key? The next build mints a fresh one automatically and tells you it did. The only consequence is that the new `.crx` installs alongside the old copy instead of updating it, so you remove the old card once.

## Honest status

Verified in this tree:

- CI: `node --check` over `extensions/`, `sources/`, `tools/` JS; TypeScript build for `sources/nexus-research-ts`
- Manifest versions in the table above
- `Release/` contains matching `.crx` / `.zip` plus `SHA256SUMS.txt`
- Root [LICENSE](LICENSE) is MIT

Not claimed:

- Chrome Web Store / Edge Add-ons publisher signatures (Chromium stores will refuse these `.crx` files)
- A third-party security audit of Aegis / PopShield
- That NEXUS Research or Archive Helper work without the API keys they ask for

## License

[MIT](LICENSE) for this repository.

Per-folder MIT copies also ship with GX Overdrive, Aegis GX Sentinel, PopShield GX, Nocturne Scrollbars GX, OLED Forge GX, and PrismShot GX. NebulaGrab, NEXUS Research, and Nexus Archive Helper inherit the root MIT file.
