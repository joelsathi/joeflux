---
title: Commands
description: Every pnpm script and CLI command.
---

# Commands

Run from the repository root. Arguments follow `--`.

## Projects

| Command | Does |
| --- | --- |
| `pnpm run init -- <folder>` | Create a project from `templates/project`. |
| `pnpm run preview -- <project> [--port 4173] [--classic]` | Open the Studio, or the classic editor with `--classic`. |
| `pnpm run validate -- <project>` | Check output settings, scenes, assets, themes and brand. |
| `pnpm run render -- <project> [--scene <id>] [--force]` | Render changed shots, one shot, or everything. |
| `pnpm run assemble -- <project>` | Join clips into `exports/final.mp4`. |
| `pnpm run review -- <project>` | Make a contact sheet and confirm the output is silent. |
| `pnpm tool <project> [tool] [json]` | List tools or call one. |

## Brand kits

| Command | Does |
| --- | --- |
| `pnpm run brand -- new <id> [--name "Name"]` | Scaffold `brand-kits/<id>`. |
| `pnpm run brand -- list` | Show installed kits and any problems, without writing. |
| `pnpm run brand -- sync` | Validate every kit and write `brand-kits/registry.json`. |

## Agents and integrations

| Command | Does |
| --- | --- |
| `pnpm run doctor` | Report FFmpeg, FFprobe and agent CLIs, and whether each agent is signed in. |
| `pnpm run setup -- mcp <project> --client claude\|codex\|copilot` | Pin the MCP server to one project, or register it with another client. Claude Code needs none of this inside the repo; the committed `.mcp.json` starts it in harness mode. |
| `pnpm run setup -- resolve --client codex\|claude` | Install the optional DaVinci Resolve bridge. For Claude this adds a machine-local `davinci-resolve` entry to `.mcp.json`; do not commit it. |
| `pnpm run resolve -- sync <project>` | Create a Resolve handoff plan. |

## Agent files

| Command | Does |
| --- | --- |
| `pnpm run skills:sync` | Mirror the canonical `skills/` into `.agents/skills` and `.claude/skills`, removing stale files. |
| `pnpm run skills:check` | Fail if the mirrors have drifted. `pnpm test` runs the same check. |

## Development

| Command | Does |
| --- | --- |
| `pnpm test` | Run the full test suite (creates the demo recording if missing). |
| `pnpm run test:fast` | Skip the slow browser, Studio and render suites (about 43 s instead of 3.5 min). |
| `pnpm run test:basic` | Also skip every suite that needs Chromium or FFmpeg; this is what CI runs. |
| `pnpm run build:studio` | Build the production Studio bundle. |
| `pnpm run build:plugins` | Bundle the animation engines and check their licenses. |
| `pnpm run licenses:check` | Check every dependency's license, including the docs site. |
| `pnpm plugin:check <pack>` | Validate a template pack. |
| `pnpm benchmark [--render]` | Run the fixed rendering benchmark. |
| `pnpm run docs:install`, `docs:dev`, `docs:build` | Install, run and build this documentation site. |
| `pnpm run desktop`, `desktop:make`, `desktop:smoke` | Run, package and smoke-test the macOS app. |
