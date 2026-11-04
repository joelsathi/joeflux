# Third-party notices

JoeFlux's original code, documentation, sample artwork and example brand kit are released under the [MIT License](LICENSE). The components below keep their own licenses and copyright notices. The MIT grant does not relicense them.

## License policy

- Animation and rendering frameworks bundled into scenes must be MIT-licensed. `pnpm run build:plugins` stops if a bundled runtime package is not MIT or has no license text, and writes `packages/animation-plugins/dist/THIRD_PARTY_LICENSES.txt`.
- Every installed package must use an approved open-source license. `pnpm run licenses:check` checks the application and the documentation site. Non-permissive packages are allowed only as named exceptions, each with a stated reason, in `scripts/check-licenses.mjs`.
- Fonts, footage, logos, Lottie files, models and textures are checked separately from code. A framework's license does not cover media shown on its website.

## Animation and rendering frameworks (bundled, MIT)

| Component | Version | License | Copyright | Used for | Source |
| --- | --- | --- | --- | --- | --- |
| Anime.js | 4.5.0 | MIT | © 2025 Julian Garnier | Paused, frame-sought timelines | https://github.com/juliangarnier/anime |
| Motion | 14.0.0 | MIT | © 2024 Motion B.V. | Absolute-time interpolation and easing | https://github.com/motiondivision/motion |
| Three.js | 0.186.1 | MIT | © 2010–2026 three.js authors | WebGL scenes, materials, lights and camera | https://github.com/mrdoob/three.js |
| React Three Fiber | 9.8.1 | MIT | © 2019–2025 Poimandres | React renderer for Three.js scenes | https://github.com/pmndrs/react-three-fiber |
| lottie-web | 5.13.0 | MIT | © 2015 Bodymovin | Frame-accurate playback of Bodymovin (After Effects) exports | https://github.com/airbnb/lottie-web |

The React Three Fiber npm package omits its license file; the upstream text is kept in `packages/animation-plugins/licenses/react-three-fiber-LICENSE.txt`. The lottie-web player and its license are vendored unmodified in `packages/motion/vendor/lottie-web/`.

## Application and tooling dependencies

| Component | Version | License | Copyright | Used for | Source |
| --- | --- | --- | --- | --- | --- |
| React, React DOM | 19.2.3 | MIT | © Meta Platforms, Inc. and affiliates | Studio and preview UI | https://github.com/facebook/react |
| Vite | 7.3 | MIT | © 2019–present VoidZero Inc. and Vite contributors | Studio dev server and build | https://github.com/vitejs/vite |
| @vitejs/plugin-react | 5.1 | MIT | © 2019–present Yuxi (Evan) You and Vite contributors | React support for Vite | https://github.com/vitejs/vite-plugin-react |
| esbuild | 0.25.12 | MIT | © 2020 Evan Wallace | Animation plugin bundle | https://github.com/evanw/esbuild |
| Zod | 4.6.5 | MIT | © 2025 Colin McDonnell | Tool and manifest schemas | https://github.com/colinhacks/zod |
| Model Context Protocol SDK | 1.30.1 | MIT | © 2024 Anthropic, PBC | MCP server for agent tools | https://github.com/modelcontextprotocol/typescript-sdk |
| connect | 3.7.0 | MIT | © 2010 Sencha Inc. and contributors | Production studio server | https://github.com/senchalabs/connect |
| Electron | 44.5.1 | MIT | © Electron contributors | Optional macOS desktop app | https://github.com/electron/electron |
| Electron Forge | 8.0.1 | MIT | © 2016 Samuel Attard | Desktop packaging | https://github.com/electron/forge |
| Oxygen UI, Oxygen UI icons | 0.14.0 | Apache-2.0 | © WSO2 LLC | Studio components, theme and icons | https://github.com/wso2/oxygen-ui |
| Playwright | 1.63 | Apache-2.0 | © Microsoft Corporation | Headless Chromium for frame rendering and tests | https://github.com/microsoft/playwright |

Electron and Playwright distribute Chromium, which carries its own notices. Desktop builds keep them under `Contents/Resources/runtime/licenses`.

## Media binaries

| Component | Version | License | Used for | Source |
| --- | --- | --- | --- | --- |
| FFmpeg via `ffmpeg-static` | 5.3.0 (FFmpeg 6.0) | GPL-3.0-or-later | Encoding and assembly, run as a separate process | https://github.com/eugeneware/ffmpeg-static |
| FFprobe via `@ffprobe-installer/ffprobe` | 2.1.2 (FFprobe 4.4.1) | LGPL-2.1 | Media probing, run as a separate process | https://github.com/SavageCore/node-ffprobe-installer |

The CLI prefers the FFmpeg and FFprobe on your `PATH`. When you redistribute these binaries, keep their licenses and the corresponding source and build information. `desktop:prepare` audits the bundled build configuration and rejects builds that cannot be redistributed.

## Fonts

Inter v4.1, © Rasmus Andersson and contributors, SIL Open Font License 1.1. The unmodified font and license are in `packages/presets/assets/InterVariable.woff2` and `Inter-LICENSE.txt`. Oxygen UI also depends on `@fontsource-variable/inter` under the same license.

## Adapted and referenced source

- `references/oxygen/Oxygen-ParticleBackground.tsx` is the Oxygen UI 0.10.1 ParticleBackground component, © WSO2 LLC, Apache-2.0. `packages/motion/src/index.js` contains an original, deterministic Canvas adaptation of its look.
- `references/oxygen/themes/` holds unmodified Oxygen UI theme definitions from https://github.com/wso2/oxygen-ui, at the upstream revision recorded in `references/oxygen/themes/manifest.json`. © 2025–2026 WSO2 LLC, Apache-2.0. `packages/presets/src/oxygen-themes.js` adapts them to Canvas tokens.
- The complete Apache License 2.0 text for these files is in `references/oxygen/LICENSE`.

## Agent skills

`vendor/mattpocock-skills/` contains the unmodified `grill-me` and `grilling` skill text from https://github.com/mattpocock/skills, © 2026 Matt Pocock, MIT. The upstream revision and links are in `vendor/mattpocock-skills/NOTICE.md`, with the license beside it. It is used only when you start a deep brief interview.

## Optional integrations

The DaVinci Resolve MCP server (samuelgursky/davinci-resolve-mcp, MIT) is not included. `pnpm run setup -- resolve` downloads the tag pinned in `integrations/resolve/vendor.json`, verifies it and keeps its license files.

## Documentation site

`website/` is built with Docusaurus (MIT, © Facebook, Inc. and its affiliates) and Mermaid (MIT, © 2014–2022 Knut Sveidqvist). Its tooling also installs packages under other open-source licenses, including elkjs (EPL-2.0, used unmodified for diagram layout) and caniuse-lite (CC-BY-4.0, browser data). None of these ship with the studio or with rendered videos.

## Original material

The look-up table `packages/motion/vendor/looks/studio-cinematic.cube`, the knowledge notes in `library/knowledge/seed.js`, the sample artwork in `projects/` and the example brand kit in `brand-kits/example/` are original to this project and MIT-licensed. Brand kits you add keep their owners' rights; placing a kit in `brand-kits/` does not license it.
