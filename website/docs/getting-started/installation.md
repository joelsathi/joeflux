---
sidebar_position: 1
title: Installation
description: Install the toolchain and open a sample project.
---

# Installation

## Requirements

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 22.13 or newer | Node 24 is tested. |
| pnpm | 10.12.4 | Pinned in `package.json`. Enable it with `corepack enable`. |
| FFmpeg and FFprobe | Any recent build | Must be on your `PATH` for rendering and review. |
| Chromium | Installed by Playwright | Used for frame rendering. |

An AI agent CLI is optional: [Claude Code](https://code.claude.com), Codex or GitHub Copilot CLI.

## Install

```bash
git clone <your-fork-url> joeflux
cd joeflux
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm run doctor
```

`doctor` reports which media tools and agent CLIs it can find, and whether each agent is signed in.

## Open a sample

```bash
pnpm run preview -- projects/motion-showcase
```

Open the URL printed in the terminal. It contains the session key for this Studio run, so use the complete link when you open another tab.

| Sample | Shows |
| --- | --- |
| `projects/motion-showcase` | A 30-second product story with reveals, handoffs and focused recordings. |
| `projects/template-gallery` | Light and dark openers, reveals, problem-to-product scenes and transitions. |
| `projects/studio-foundation-review` | Kinetic text, artwork layers, framed screens, camera focus and looks. |
| `projects/terminal-templates` | Command-and-output walkthroughs with typing and scrolling. |
| `projects/animation-plugin-gallery` | Anime.js, Three.js, React Three Fiber and Motion scenes. |
| `projects/neutral-landscape`, `-square`, `-portrait` | Product-proof and brand-reveal compositions in three aspect ratios. |

## Run the documentation locally

The documentation site lives in `website/` and has its own dependencies:

```bash
pnpm run docs:install
pnpm run docs:dev
```

The site opens at `http://localhost:3000`. Build a static copy with `pnpm run docs:build`; the output is written to `website/build/`.
