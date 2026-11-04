# Optional DaVinci Resolve finishing

The harness renders and assembles silent video without DaVinci Resolve. Run `pnpm run setup -- resolve --client codex` or `pnpm run setup -- resolve --client claude` only when a Resolve timeline is needed.

The Resolve MCP source is not committed here. Setup downloads the pin in `vendor.json` (a shallow clone of the tagged upstream, commit-verified) into `vendor/davinci-resolve-mcp`, then installs the MCP's Free-edition bridge into Resolve's Scripts location. Restart Resolve, run the bridge from **Workspace > Scripts**, then use `pnpm run resolve -- sync <project>` to create the versioned handoff plan for the active MCP client.
