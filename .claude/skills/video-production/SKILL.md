---
name: video-production
description: Use when planning, refining, editing, rendering, or reviewing silent product demos and SaaS explainers in JoeFlux, especially when the story, cuts, pacing, or motion feel generic.
---

Make the viewer understand a useful change in the product. Every shot earns its duration; every movement directs attention or explains a relationship.

Read the target project's `WORKING_STATE.md`, `project.json`, relevant scenes, and repository-root `context/workflows.md`. Preserve existing choices and source assets. This harness is silent: keep `output.audio` false. Use free, open-source production software; distinguish a library's license from asset/template permissions. Tool and learning sources are in repository-root `context/video-quality-sources.md`.

## Choose the needed work

- New video or unclear message: read [brief and story](references/brief-and-story.md). Ask the highest-value missing question, build a compact brief, and propose a causal sequence with visible proof. An existing brief avoids another interview.
- Basic cuts, slide-like pacing, or a sequence edit: read [editing and pacing](references/editing-and-pacing.md). Produce a shot contract and explain the cut into and out of each changed shot.
- After Effects reference or template: read [template adaptation](references/template-adaptation.md). Choose compatible licensed media, Lottie, or an original reconstruction. Do not promise native AEP/MOGRT playback in this harness.
- Kinetic typography, diagrams, shape transformations, or a product reveal: use `motion-graphics` to design the visual system and choreography.
- Animation implementation: use `animation-authoring`; read repository-root `context/architecture.md` before a custom module.
- Review or delivery: read [quality review](references/quality-review.md). Assess motion at normal speed and both sides of the cuts, as well as still frames.

For Studio work, establish the communication purpose before styling recommendations and retain the user's existing selections.

## Make decisions reviewable

For a new sequence, save a short brief and shot table in the project's documents area (or `direction.md`). Use [the production worksheet](assets/production-worksheet.md) as a starting format. Show a timed rough cut before expensive polish and prove the most demanding motion in a small sample. For a narrow revision, update only the affected shot and its boundaries. Honor existing approvals and explicit delegation; do not repeatedly request the same choices.

Render the smallest affected scene, inspect it, and obtain the scene/assembly review required by the project. Commands from the harness root: `pnpm run validate -- <project>`, `pnpm run render -- <project> --scene <id>`, `pnpm run assemble -- <project>`, `pnpm run review -- <project>`. Follow required project checks.

Update `WORKING_STATE.md` with changed shots, export path, actual checks, timecoded findings, unresolved decisions, and the next action. A valid schema or attractive contact sheet alone is not a quality verdict. If playback cannot be inspected, deliver as a review draft and state that limitation.
