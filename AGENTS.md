# JoeFlux agent instructions

Read `context/workflows.md` and the selected project's `WORKING_STATE.md` before changing a scene. Update `WORKING_STATE.md` using the sections in `templates/project/WORKING_STATE.md` when you finish.

This is a silent-video studio: do not add audio tracks, audio controls, narration, music, or audio-processing dependencies. Keep source assets unchanged. Render the smallest affected scene first, review its contact sheet or frame output, then assemble the project only when the scene is approved.

Use the project-scoped skill that fits the task. The canonical skills are in `skills/`; `.agents/skills/` and `.claude/skills/` are generated copies. Edit `skills/`, then run `pnpm run skills:sync`. Resolve is optional: load `resolve-finishing` only when the user asks to work in DaVinci Resolve, and do not run its setup commands for ordinary rendering.

The skills name `joeflux` tools such as `template_apply` and `quality_review`. They come from the `joeflux` MCP server. When the server starts without a project, call `project_open` before the other tools. For Codex, register the server with `pnpm run setup -- mcp <project> --client codex`. Without MCP, run the same tools with `pnpm run tool -- <project> <name> '<json>'`.

Brands come from `brand-kits/<id>/`. After adding or editing a kit, run `pnpm run brand -- sync`. For animation requests, use the `animation-engines` skill and let the user choose an engine before applying one.

Run `pnpm run test:fast` while iterating and `pnpm test` before handoff.
