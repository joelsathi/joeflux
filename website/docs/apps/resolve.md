---
title: DaVinci Resolve
description: Optional handoff of rendered clips to a Resolve timeline.
---

# DaVinci Resolve

JoeFlux renders and assembles without Resolve. Use this integration only when you want to grade or deliver in DaVinci Resolve.

```bash
pnpm run setup -- resolve --client claude   # or --client codex
pnpm run doctor -- resolve
pnpm run resolve -- sync projects/my-video
```

Setup downloads the pinned [davinci-resolve-mcp](https://github.com/samuelgursky/davinci-resolve-mcp) (MIT), verifies it and installs its bridge into Resolve's Scripts folder. Restart Resolve, run the bridge from **Workspace → Scripts**, then `resolve sync` creates a versioned handoff plan of rendered clips for the connected MCP client. The `resolve-finishing` skill guides the agent through the timeline.

With `--client claude`, setup adds a `davinci-resolve` entry to the repository's committed `.mcp.json`. That entry holds machine-local paths, so do not commit it.
