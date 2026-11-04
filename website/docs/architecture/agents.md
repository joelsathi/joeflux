---
title: Agents and MCP
description: How agent CLIs are run, isolated and connected to the project.
---

# Agents and MCP

## Adapters

`packages/agents` runs the CLI you choose in headless mode and turns its output into a common event stream: `session`, `text`, `tool_call`, `tool_result`, `error` and `done`. The Studio streams those events over `POST /api/chat`. Closing the request cancels the agent.

| CLI | Invocation |
| --- | --- |
| Claude Code | `claude -p … --output-format stream-json --mcp-config <run config> --strict-mcp-config --allowedTools mcp__joeflux__* --append-system-prompt …` |
| Codex | `codex exec --json -c mcp_servers.joeflux.*=…` with the system prompt prepended |
| Copilot CLI | `copilot -p … --allow-tool joeflux --additional-mcp-config …` |

Sessions are resumed with the CLI's own resume flag, so follow-up messages continue the same conversation instead of starting over.

## The MCP server

Each run starts `packages/mcp/src/server.js` as a stdio server. When the Studio is open, the server proxies to it using a per-run token written to a private file (mode `0600`), so agent edits share the Studio's queue, undo history and live events. The token never appears in command-line arguments.

Tool results are compact JSON. `render_frame`, `quality_review` and `variation_generate` attach PNG frames so the agent can look at its work.

## Credentials

The harness never stores or forwards provider credentials in CLI mode; each CLI uses its own sign-in. In the desktop app, inherited API keys are removed from the agent's environment unless you explicitly choose API-key mode for that agent.

## Instructions the agent receives

- A short appended system prompt: start with `project_get` and `brief_get`, preserve settled decisions, use typed edits, review frames, and read `brand_kit_get` and skills when relevant.
- The MCP server's instructions: how screen shots, camera tools, merge patches, undo and review fit together.
- Tool descriptions and schemas.

Everything else, such as skills, brand guidelines, knowledge references and frames, is fetched only when needed. See [Token efficiency](token-efficiency.mdx).
