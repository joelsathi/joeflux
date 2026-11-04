---
name: resolve-finishing
description: Prepare optional DaVinci Resolve Free timeline handoffs from rendered silent JoeFlux clips. Use only when the user asks for Resolve work.
---

Resolve is optional. Verify the standalone renders first. If the bridge or MCP is not active, report that the local video project was not changed and continue with offline work where useful.

Before first use, run `pnpm run setup -- resolve --client codex` or `pnpm run setup -- resolve --client claude`, restart Resolve, and start the bridge from Workspace > Scripts. Then run `pnpm run resolve -- sync <project>` and read the generated plan.

Use the Resolve MCP to import only unmapped rendered clips, create the versioned timeline in plan order, and keep it silent. After successful MCP actions, record media and timeline IDs in `04_DaVinci_Resolve/sync-state.json`. Do not modify source assets.
