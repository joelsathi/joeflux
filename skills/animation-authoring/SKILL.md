---
name: animation-authoring
description: Use when authoring or improving JavaScript animation, Three.js scenes, camera choreography, transitions, or reading holds for silent product videos in JoeFlux.
---

Read repository-root `context/animation-guide.md`, the target scene, and its shot contract before editing. For motion direction read [motion craft](references/motion-craft.md); for library selection or custom JavaScript/Three.js read [open-source authoring](references/open-source-authoring.md). Tool licenses and learning sources are in repository-root `context/video-quality-sources.md`.

For kinetic typography, animated diagrams, shape transformations, and product reveals, use `motion-graphics` to establish the graphic treatment before implementing it.

## Author the information flow

Specify the focal object, initial pose, meaningful change, settled pose, reading interval, and outgoing handoff. Say what each motion communicates. Choose easing by its role and tune travel distance and duration together. Stage supporting movement around the principal action; make UI evidence stable when it must be read. Presets are starting points, not the creative brief.

Camera motion and source playback are independent. Speed up unimportant waiting between reading moments; preserve causal action/result frames. Hold a source frame when needed. Protect the complete message's settled time, including late staggered words and UI interpretation; `video-production` provides the reading-time method and cut design.

## Preserve deterministic export

Evaluate all state from the requested frame, including fractional frames for motion blur. Do not drive export with timers, `requestAnimationFrame`, playback state, live network data, accumulated delta time, or unseeded randomness. Sequential and out-of-order requests for the same frame must produce the same state. Preload assets and fonts, pin versions, and use local dependencies.

Choose the simplest suitable open-source route: existing Canvas/SVG/CSS for most product footage, Anime.js for manually sought choreography, Three.js for genuine 3D, PixiJS for heavier 2D, Motion Canvas for a separately rendered explainer. Anime.js, Three.js, React Three Fiber and Motion now have installed adapters: use the `animation-plugins` or `three-video` skill. Other named libraries are not integrated merely because this skill names them. New additions must meet the user’s MIT-only policy.

For custom modules read `context/architecture.md`. Declare project-local `module`, export `renderFrame(frame, context)`, and honor the supplied Canvas contract. List helper files in `dependencies` and assets in `assetDependencies` so cache identity includes them. A Three.js renderer needs its own canvas; composite its result into the supplied 2D canvas or use a separately rendered media asset. Prove the adapter before promising preview/export parity. Preserve Oxygen attribution for derived particle work.

## Review the movement

Render the smallest demanding interval at target fps. Inspect start, peak movement, settle, end, and adjacent cut states; play it at normal speed and intended viewing size. Check acceleration, overshoot, text stability, motion blur, source continuity, and the readable hold. Fix motion before escalating effects or render quality. Report uninspected playback honestly and follow the project's scene-approval rule before assembly.
