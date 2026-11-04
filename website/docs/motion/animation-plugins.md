---
title: Animation engines
description: The bundled MIT animation engines and when to use each.
---

# Animation engines

Four engines are bundled and pinned. Each is MIT-licensed, runs locally and is driven by an explicit frame, so scrubbing, preview and export always agree.

| Engine | Version | Best for | Template |
| --- | --- | --- | --- |
| [Anime.js](https://github.com/juliangarnier/anime) | 4.5.0 | Staggered words, lists, counters, synchronized beats | `plugin-animejs` |
| [Motion](https://github.com/motiondivision/motion) | 14.0.0 | Interface cards, panels and eased state changes | `plugin-motion` |
| [Three.js](https://github.com/mrdoob/three.js) | 0.186.1 | Real geometry, materials, lights and camera | `plugin-threejs` |
| [React Three Fiber](https://github.com/pmndrs/react-three-fiber) | 9.8.1 | 3D scenes composed from React components | `plugin-react-three` |

[lottie-web](https://github.com/airbnb/lottie-web) 5.13.0 (MIT) plays Bodymovin exports from After Effects; see [After Effects and Lottie](after-effects.md).

## Let the director choose with you

Ask the director for "better animation" on a shot. It reads the `animation-engines` skill, offers two or three concrete options with a recommendation, and applies one only after you pick it.

## Try them

```bash
pnpm run preview -- projects/animation-plugin-gallery
pnpm tool projects/animation-plugin-gallery animation_plugin_list
pnpm tool projects/my-video template_apply '{"template":"plugin-react-three","id":"sculpture","slots":{"title":"A new dimension"}}'
```

Edit `pluginOptions.color` (six-digit hex) and `pluginOptions.quality` (1, or 2 for 3D supersampling) in the inspector or scene JSON.

## Write your own

A custom module (`"module": "scenes/my-scene.js"`) can call `context.renderPlugin(factory)` to get the same lifecycle: per-canvas sessions, serialized renders, stale-request protection and GPU cleanup. Evaluate from `frame / output.fps`; never use timers, `requestAnimationFrame` or unseeded randomness. The `animation-plugins` and `three-video` skills contain complete authoring guides.

## Adding another engine

New bundled engines must be MIT-licensed. `pnpm run build:plugins` rejects any bundled runtime package without an MIT declaration and license text, and `pnpm run licenses:check` rejects unapproved licenses across the repository. Add the engine's notice to `THIRD_PARTY_NOTICES.md` and the [licenses page](../reference/licenses.md).
