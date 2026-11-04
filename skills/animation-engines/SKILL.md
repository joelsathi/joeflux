---
name: animation-engines
description: Use when a user asks for animation, 3D, kinetic type, a livelier shot or better motion in JoeFlux. Offers the bundled MIT engines (Anime.js, Motion, Three.js, React Three Fiber, Lottie) as concrete options and asks the user to choose before applying one.
---

Read the project's WORKING_STATE.md first. Every engine here is bundled, pinned and MIT-licensed; frames are evaluated at explicit timestamps, so preview and export match.

## 1. See what is installed

Call `animation_plugin_list` for engine ids, versions, licenses, upstream links and supported formats. Call `template_list` for ready-made shots; pass `category` when the shot type is known. Do not offer an engine that is not listed.

| Engine | Best for | Ready-made shot | Avoid when |
| --- | --- | --- | --- |
| Anime.js | Staggered words, lists, numeric counters, synchronized graphic beats | `plugin-animejs`; `harness/title` and `harness/cta` components | The shot needs real depth or lighting |
| Motion | Interface cards, panels and eased state changes | `plugin-motion`; `harness/shape` component | You need to mount an interactive React DOM component |
| Three.js | A product object with real geometry, materials, lights and camera | `plugin-threejs` (read the `three-video` skill) | Flat copy and UI proof carry the message |
| React Three Fiber | A 3D scene composed from reusable React components | `plugin-react-three` (read `three-video`) | A single static object is enough |
| Lottie (lottie-web) | Designer-made After Effects animation exported with Bodymovin | `artwork_import` + scene `layers` (`type: "lottie"`) | The file uses expressions, 3D layers or effects lottie-web cannot render |
| Built-in camera | Recordings: focus areas, pushes, pans and holds | `focus-tour`, `product-reveal`, `screen-handoff` | The user wants a graphic, not product proof |

## 2. Ask before applying

Pick two or three options that fit the shot and brief. For each, say in one line what the viewer sees, which shot it replaces or follows, its duration, and what stays editable. Recommend one and say why. Then ask the user to choose, for example:

> For the opening I'd suggest one of these:
> 1. **Anime.js word stagger** (recommended): the headline builds word by word, holds for two seconds, then cuts to the product. Copy and accent stay editable.
> 2. **Three.js product sculpture**: a lit abstract object turns into place behind the title. Richer, but less direct.
> 3. **Keep the current title** and spend the time on the product recording instead.
>
> Which would you like?

Wait for the answer. Never apply an engine, swap a template or add a dependency without it. If the user wants to compare, call `variation_generate` or `template_poster` and show the results.

## 3. Apply and check

- Use `template_apply` with the user's copy, then `template_set_control` or `scene_update` (`pluginOptions.color`, `pluginOptions.quality` 1 or 2).
- For Lottie, import with `artwork_import` (embedded images only) and add a layer with normalized `x`, `y`, `width`, `height` and optional `startFrame`, `endFrame`, `speed`.
- Follow the brand kit when `project.brand` is set: use its accent color and keep its logo area clear.
- Call `quality_review`, inspect the three frames yourself, then `render_scene` for that one shot. Report what you inspected; tests and heuristics are not creative approval.

## Licensing guardrail

Only the engines above ship with JoeFlux. Do not install or copy another animation framework because it is popular or free to use. Before suggesting a new one, confirm the exact version is MIT-licensed and tell the user it requires a code change, a license check (`pnpm run build:plugins` and `pnpm run licenses:check`) and a notice in THIRD_PARTY_NOTICES.md. GSAP, Remotion and other source-available or custom-licensed tools are not MIT; offer the closest bundled engine instead. Lottie files, models, textures and fonts carry their own rights; ask where they came from before using them.

For authoring a new adapter, read the `animation-plugins` skill. For 3D craft, read `three-video`. For timing and holds, read `animation-authoring`.
