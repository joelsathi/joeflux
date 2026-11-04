---
name: animation-plugins
description: Use when creating reusable Anime.js or Motion video scenes, adapting MIT React components such as VengeanceUI for video, or extending JoeFlux animation plugins.
---

Read the target project's WORKING_STATE.md and context/workflows.md. These plugins produce silent scenes at explicit timestamps. For 3D use the three-video skill. For the API and a runnable custom scene, read [adapter authoring](references/authoring.md).

## Choose the mechanism

- Anime.js: staggered objects, numeric timelines and synchronized typography; use createAnimeScene.
- Motion: interpolate absolute-time state and easing for interface/card reveals; use createMotionScene. This adapter does not mount arbitrary Motion React DOM components.
- Three.js / React Three Fiber: real geometry, materials, lights and camera; use three-video.
- VengeanceUI: MIT source components to adapt selectively. It is researched, not an installed renderer or a ready-made video plugin. Do not install its website or imply every interactive component exports deterministically.

Installed engines, versions and upstream links are available through animation_plugin_list. Ready-to-use shots are plugin-animejs, plugin-motion, plugin-threejs and plugin-react-three in template_list/template_apply and the studio template picker. Customize title/subtitle, duration, and pluginOptions.color. quality is 1 or 2 for 3D supersampling; it does not alter timing. The initial templates use their own dark art direction. A dark project theme lends them its background (plugins and the dark terminal read context.theme through backdrop/themeBackdrop) so shots cut cleanly; light themes keep the plugin backdrop, and the theme never recolors their materials.

## Author useful motion

Specify a focal object, initial pose, meaningful change, settled pose, reading interval and exit before selecting an effect. Scale motion to the message. Animate a causal sequence instead of adding perpetual movement. Keep the reading hold stable. A library does not substitute for composition, timing or a visual review.

Use frame / output.fps, preserving fractional frames. Anime timelines must use autoplay:false and seek(milliseconds,true). Define explicit from/to values. Motion interpolation must be evaluated from absolute seconds. Avoid requestAnimationFrame, setInterval, accumulated delta, CSS transitions, hover, scrolling, network data and unseeded randomness in export logic. The preview transport may use a clock; the scene must not.

Use context.renderPlugin(factory) from custom renderFrame modules to get lifecycle management, per-canvas isolation and stale-request protection. Await asynchronous asset loading in the factory. Pure React components must receive frame/seconds as props; asset Suspense must be resolved before capture.

## MIT-only additions

The user requires MIT-only new animation libraries and bundled dependencies. Verify the exact package version's upstream license and the license of any copied component; keep notices. Do not treat free-to-use, source-available, dual-license, paid commercial terms or a GitHub URL as equivalent to MIT. pnpm run build:plugins checks all bundled runtime package license declarations and gathers license texts. Inspect those texts too. New dependency versions must remain pinned.

Check models, textures, HDRIs, fonts and demo assets independently. A library's MIT license does not license everything shown on its website. Prefer original geometry and user-supplied assets. Existing harness assets keep their existing licenses; this feature does not relicense the whole application.

## Verification

Run pnpm run build:plugins, project validation, plugin browser tests and relevant regression tests. Render at frame 0, entrance peak, settled pose and end; compare a repeated frame after backward and fractional seeks. Check offline export and preview parity, rapid scrubbing and independent thumbnails. Render the smallest affected clip, inspect frames and play it at intended size/fps. Technical tests do not prove pacing; report unreviewed playback. Preserve the project approval rule before full assembly.
