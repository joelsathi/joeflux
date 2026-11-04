# Workflows

Start each production session by reading `WORKING_STATE.md`, `project.json`, and only the scene files relevant to the request. Describe the intended timing change before making it.

For new product demos or unclear direction, use `video-production` to recover the brief and create a shot plan before selecting effects. For cuts, pacing, or animation that feel basic, use its editing reference and `animation-authoring`'s motion-craft reference. Keep confirmed user decisions, ask focused missing-information questions, and review a timed rough edit and a representative motion sample before broad polish. Research and open-source tool selection are documented in `context/video-quality-sources.md`.

For graphic sequences, use `motion-graphics` to plan the typography, diagram semantics, persistent objects, and transition into authentic product evidence; then use `animation-authoring` to implement the treatment.

For a parameter change, edit the scene JSON or use the preview, render that one scene, and inspect it before assembly. For a new scene, choose the closest preset, define its frame duration and reading hold, then render and review. Update `WORKING_STATE.md` with the changed scene, validation result, and next review action, under the sections of `templates/project/WORKING_STATE.md`.

Run `pnpm run test:fast` while iterating (it skips the browser, render and desktop suites) and `pnpm test` before handoff. `pnpm run validate -- <project>` catches invalid output settings and scene specifications. `pnpm run review -- <project>` generates a contact sheet and confirms the final MP4 is silent.

Technical validation and contact sheets do not prove pacing or animation quality. Inspect the affected shot and neighboring cuts at normal speed and intended viewing size, using the production skill's quality-review reference. Record exactly what was inspected. If playback cannot be reviewed, identify that limitation and deliver a review draft.

Only use Resolve when a user asks for a Resolve timeline, grading, delivery, or another Resolve-specific task. Its MCP and bridge are opt-in; no Resolve connection should block local animation work.
