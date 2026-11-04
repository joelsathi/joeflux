# JoeFlux instructions for Claude Code

@AGENTS.md

## Claude Code

- `.mcp.json` registers the `joeflux` server for every project, and `.claude/settings.json` approves it. Call `project_open` before the other `joeflux` tools. Only the core tools are listed; call `toolset_enable` for another group (screen recordings need `screen`).
- Hooks in `.claude/settings.json` run `pnpm run skills:sync` after edits under `skills/` and `pnpm run brand -- sync` after edits under `brand-kits/`. Read their output rather than running the commands again.
- DaVinci Resolve is optional. Load `resolve-finishing` only after the user asks for Resolve work. Its setup adds a machine-local `davinci-resolve` entry to `.mcp.json`; do not commit that entry.
- This repository does not set or override Claude's model choice.
