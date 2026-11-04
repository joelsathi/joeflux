---
title: Desktop app
description: The optional macOS app that bundles the Studio and its runtime.
---

# Desktop app

The macOS app packages the Studio with its own Node runtime, Playwright Chromium, FFmpeg and FFprobe, so it needs no separate toolchain. It opens a project folder, saves edits directly into it and writes exports to its `exports/` folder.

## Build

```bash
pnpm install --frozen-lockfile
pnpm run desktop:make
pnpm run desktop:smoke
```

`desktop:make` builds the Studio, prepares the runtime, packages the app with Electron Forge and creates a ZIP and DMG under `out/make/`. `desktop:prepare` audits the bundled FFmpeg build and refuses one that cannot be redistributed, so supply a redistributable FFmpeg build before packaging. Builds target the Mac's own architecture.

For development:

```bash
pnpm run desktop:prepare
pnpm run desktop
```

## Connect the director

Setup offers **Install Claude Code** or **Install Codex** and runs the official installer in Terminal after you confirm. **Sign in with Claude** or **Sign in with ChatGPT** runs the CLI's own sign-in. You can instead use an API key, billed separately; keys are kept for the session unless you choose **Remember securely on this Mac**, which stores them in the macOS Keychain. The app never switches from account usage to an API key on its own.

## Signing

Unsigned builds are for local use. For distribution, set `JOEFLUX_SIGN_IDENTITY` and `JOEFLUX_NOTARY_PROFILE` before `desktop:make` to sign and notarize with your Developer ID.
