---
title: CLI and MCP
description: Drive projects from the terminal or any MCP client.
---

# CLI and MCP

## Call any tool

```bash
pnpm tool projects/my-video                         # list tools
pnpm tool projects/my-video project_get
pnpm tool projects/my-video scene_update '{"id":"tour","patch":{"durationFrames":168}}'
pnpm tool projects/my-video history_undo
```

Every tool is listed in the [tools reference](../reference/tools.md). Mutations are validated, transactional and undoable, and a running Studio shows them live.

## Connect an MCP client

Claude Code needs no setup inside the harness: the committed `.mcp.json` starts the server in harness mode, and the agent calls `project_open` to choose a project. To pin one project, or to register another client, run:

```bash
pnpm run setup -- mcp projects/my-video --client claude
pnpm run setup -- mcp projects/my-video --client codex
pnpm run setup -- mcp projects/my-video --client copilot
```

This registers `packages/mcp/src/server.js` as a stdio MCP server for the project. Run it directly with:

```bash
node packages/mcp/src/server.js projects/my-video
```

| Mode | How | Effect |
| --- | --- | --- |
| Direct | Pass a project path | Edits the project folder; its own undo history |
| Harness | Pass no project and no `JOEFLUX_URL` | Adds `project_open`; the agent opens or switches projects under the harness root |
| Grouped | Add `--toolsets=core` (or `JOEFLUX_TOOLSETS`) to any mode | Lists `core` plus the named groups; `toolset_enable` adds more and `toolset_call` reaches any tool |
| Studio proxy | Set `JOEFLUX_URL` and `JOEFLUX_TOKEN` (or `JOEFLUX_TOKEN_FILE`) | Shares the running Studio's queue, undo history and live events |

`render_frame`, `quality_review` and `variation_generate` return PNG images alongside their JSON, so the agent can see the frames it is judging.

## Scripts

| Script | Purpose |
| --- | --- |
| `scripts/create-motion-showcase.js` | Rebuilds the motion showcase sample. |
| `scripts/render-neutral-composition-specimens.mjs` | Renders the neutral composition specimens. |
| `scripts/render-terminal-specimens.mjs` | Renders the terminal template specimens. |
| `scripts/capture-docs-screenshots.mjs` | Regenerates the screenshots on this site. |
| `scripts/measure-agent-context.mjs` | Regenerates the [token budget](../architecture/token-efficiency.mdx) figures. |
| `scripts/generate-docs-reference.mjs` | Regenerates the tools and themes reference pages. |
| `scripts/check-licenses.mjs` | Checks every dependency's license (`pnpm run licenses:check`). |
