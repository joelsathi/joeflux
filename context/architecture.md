# Architecture

`project.json` is the source of truth for output settings, assets, and scene order. Each entry references a JSON file in `scenes/`. The loader expands those specifications for preview and rendering while keeping the project manifest easy to scan.

Every scene evaluates by frame number. Built-in presets use `renderFrameToCanvas(canvas, scene, frame, output, assetImage)`. A custom JavaScript scene declares `"module": "scenes/my-scene.js"` and exports `renderFrame(frame, context)`. The context provides `canvas`, its 2D `context`, `output`, `project`, `scene`, `assetImage`, and `renderBuiltin()` when a custom scene wants to layer over a preset. It must derive its result only from scene data, the requested frame, and supplied assets. Avoid timers, `requestAnimationFrame`, network data, and random values that are not seeded.

Screen scenes (`kind: "screen"`) follow the zod schema in `packages/schema`: a `screen` presentation plus a `camera.shots` path evaluated by `motion/src/camera-motion.js`. Legacy `cameraMotion` presets become shot lists via `schema/src/migrate.js`. Camera motion and recorded-footage playback are independent. Shared browser-compatible timing code evaluates translation, X/Y/Z rotation, scale, focus position and continuous source time. Preview and export seek video assets to the same source timestamp before drawing. Canvas uses an affine perspective treatment for recorded screens; the screen-handoff preset adds depth, rotation and caption choreography.

The render cache fingerprints the output settings, scene specification, and referenced asset metadata. A changed scene or image rerenders only that shot. Assembly combines rendered MP4 clips using explicit frame-duration transitions; it never reads or writes audio.

## Tool layer

Every project change goes through `packages/tools`: a registry of named tools, each with a zod input schema (published as JSON Schema) and an agent-facing description. Mutating tools stage file writes in a transaction, validate the resulting project, and write nothing if it's invalid. They then record an undo entry (`.runtime/history.json`, file before/after snapshots) and emit a `change` event. Mutations run one at a time. Undo refuses to overwrite a file edited after the change. `runner.watch()` reports edits made outside the tools as `external` changes.

Transports: HTTP `GET /api/tools`, `POST /api/tools/<name>` and SSE `GET /api/events` in the preview server; `pnpm tool <project> [name] [json]` on the command line. The legacy preview endpoints are thin wrappers over tools. `render_frame` writes a PNG to `.runtime/frames/` so an agent can inspect a frame.

## Agents and MCP

`packages/mcp/src/server.js` is a stdio MCP server over the same tools, with usage instructions and `render_frame` image content. With a project path it edits that project directly. Without one it starts in harness mode and adds `project_open`, which chooses or switches the project; the committed `.mcp.json` uses this mode. `--toolsets=core` (or `JOEFLUX_TOOLSETS`) lists only the named tool groups from `packages/tools/src/groups.js`; `toolset_enable` adds groups and `toolset_call` runs any tool, for clients that ignore `list_changed`. With `JOEFLUX_URL` it proxies to a running studio, so agent edits share the studio's queue, undo history and live events. `pnpm run setup -- mcp <project> --client claude|codex|copilot` registers it with a client.

`packages/agents` runs the user's installed agent CLI headless: Claude Code (`claude -p --output-format stream-json`), Codex (`codex exec --json`) and Copilot CLI (text only). Each CLI uses its own sign-in, so the harness never handles vendor credentials. Adapters normalize output to `session | text | tool_call | tool_result | error | done`. The studio streams these over `POST /api/chat` (SSE), and closing the request cancels the agent. `GET /api/agents` (add `?refresh` to re-check) and `doctor` report which CLIs are installed and signed in. `POST /api/agents/<id>/login` streams the CLI's own sign-in (`claude auth login` for a Claude subscription, `codex login` for ChatGPT). Check each provider's terms before distributing an integration publicly, and keep API-key sign-in as a fallback.

## Studio app

`apps/studio` is the default UI: React with Oxygen UI components, themes and icons. It changes the project only through `/api/tools`, and refreshes on every `/api/events` change, so agent and outside edits show up live. Sliders preview a local patch and commit one tool call when released, so each drag is a single undo step. The stage and shot thumbnails use the shared browser renderer; each thumbnail has its own renderer instance, because a renderer keeps only its latest frame request. `apps/preview` stays as the classic UI (`--classic`) and still hosts `render.html` for export.

## Shared frame pipeline

`packages/renderer/src/browser-scene.js` is the browser application entry shared by the React preview and `render.html`. It prepares immutable images/fonts and commits only the latest requested preview frame. Canvas renders the background/copy; `motion/src/spatial-stage.js` renders independent CSS perspective planes. Custom modules retain their existing Canvas contract and may call the provided `renderBuiltin` to use the full stage. Direct calls to `renderFrameToCanvas` are a flat Canvas fallback, not the spatial export API.

`decoder.js` probes FFmpeg PTS, decodes silent PNG frames once, and atomically commits a timestamp manifest to the selected project's ignored `.runtime/source-frames`. Requests choose the presentation interval containing the requested source time, including VFR gaps, and clamp to source endpoints. Preview and export use the same loopback source-frame service. First use of a large recording takes additional time and disk space to decode the full source; subsequent requests use the cache. Failed/cancelled decodes cannot publish a partial manifest.

Render identity hashes all motion/preset/renderer source, `render.html`, bundled fonts/brand assets, scene settings and declared source content. Custom modules can list extra project-relative `dependencies` and named `assetDependencies`. List imported helper files there; arbitrary dynamic custom-module dependencies cannot be inferred reliably. Runtime caches and existing originals are never edited by the frame evaluator.

## Animation plugins

Scenes may declare `plugin: "animejs" | "threejs" | "react-three" | "motion"`, exclusive with preset/module/kind. `pluginOptions` accepts color and 3D quality. The shared browser renderer uses a local adapter bundle and per-canvas sessions; custom modules can await `context.renderPlugin(factory)`. See `website/docs/motion/animation-plugins.md`. Renderers expose `dispose()` for preview teardown.

## Brand kits

Kits live in `brand-kits/<id>/brand.json` with their logos, fonts, backgrounds, bookends and guidelines. `pnpm run brand -- sync` validates them (`packages/presets/src/brand-kit-sync.js`) and writes `brand-kits/registry.json`, which `packages/presets/src/brand-kits.js` imports for Node, the Studio and the render page. Kit themes become `<kit>-<theme>`, backgrounds `<kit>/<background>`, and a project or scene `brand` adds the mode-matched logo on the spatial stage. Servers serve only files listed in the registry. See `website/docs/architecture/brand-kit-registry.md`.
