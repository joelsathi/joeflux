---
title: Licenses
description: The license policy and every bundled third-party component.
---

# Licenses

JoeFlux's own code, documentation, sample artwork and example brand kit are MIT-licensed. Third-party components keep their licenses; the full attributions are in `THIRD_PARTY_NOTICES.md` at the repository root.

## Policy

- **Animation and rendering frameworks must be MIT.** `pnpm run build:plugins` fails if any bundled runtime package lacks an MIT declaration and license text.
- **Every dependency must use an approved open-source license.** `pnpm run licenses:check` checks the app and this site. Permissive licenses pass; anything else must be a named exception with a reason.
- **Media is checked separately from code.** Fonts, logos, footage, Lottie files and models need their own rights.

## Animation and rendering (MIT)

| Component | Version | Copyright |
| --- | --- | --- |
| Anime.js | 4.5.0 | Julian Garnier |
| Motion | 14.0.0 | Motion B.V. |
| Three.js | 0.186.1 | three.js authors |
| React Three Fiber | 9.8.1 | Poimandres |
| lottie-web | 5.13.0 | Bodymovin |

## Application and tooling

| Component | License | Copyright |
| --- | --- | --- |
| React, React DOM | MIT | Meta Platforms, Inc. and affiliates |
| Vite, @vitejs/plugin-react | MIT | VoidZero Inc. and Vite contributors |
| esbuild | MIT | Evan Wallace |
| Zod | MIT | Colin McDonnell |
| Model Context Protocol SDK | MIT | Anthropic, PBC |
| connect | MIT | Sencha Inc. and contributors |
| Electron, Electron Forge | MIT | Electron contributors; Samuel Attard |
| Oxygen UI and icons | Apache-2.0 | WSO2 LLC |
| Playwright | Apache-2.0 | Microsoft Corporation |
| Docusaurus, Mermaid (this site) | MIT | Facebook, Inc. and its affiliates; Knut Sveidqvist |

## Accepted exceptions

These are open source but not permissive, and each is used in a way its license allows:

| Package | License | Why it is accepted |
| --- | --- | --- |
| `ffmpeg-static` | GPL-3.0-or-later | Prebuilt FFmpeg, run as a separate process. Keep its license and build source when redistributing. |
| `@ffprobe-installer/*` | LGPL-2.1 | Prebuilt FFprobe, run as a separate process. |
| Inter, `@fontsource-variable/inter` | OFL-1.1 | The font license permits bundling with software. |
| `caniuse-lite` | CC-BY-4.0 | Browser data read by build tools; not shipped in renders. |
| `elkjs` | EPL-2.0 | Unmodified diagram layout engine for this site only. |

## Animation frameworks that are not bundled

Some popular tools are not open source under MIT, so they are not part of JoeFlux: GSAP is under its own no-charge license, and Remotion uses a custom license that requires a company license for some teams. The director's `animation-engines` skill offers the closest bundled engine instead.
