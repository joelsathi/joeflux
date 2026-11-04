---
title: Scenes and shots
description: Scene types, timing, camera, text and transitions.
---

# Scenes and shots

Each shot is a JSON file evaluated at an explicit frame number. The same evaluation drives the stage, thumbnails and the exporter.

## Scene types

| Type | Declared with | Use it for |
| --- | --- | --- |
| **Screen** | `"kind": "screen"` | A recording presented on the stage with a camera path. |
| **Preset** | `"preset": "<name>"` | Built-in recipes: `text-template`, `text-settle`, `chapter-opener`, `product-reveal`, `screen-handoff`, `side-slide`, `accent-mask`, `problem-to-product`, `recorded-showcase`, `focus-transition`, `floating-cards`, `feature-list`, `oxygen-particles`. |
| **Composition** | `"kind": "composition"` | Layered, editable components: title, proof media, shape, CTA and terminal. See [Compositions](../motion/compositions.md). |
| **Plugin** | `"plugin": "animejs" \| "motion" \| "threejs" \| "react-three"` | Animation-engine scenes. See [Animation engines](../motion/animation-plugins.md). |
| **Custom module** | `"module": "scenes/my-scene.js"` | Your own frame-driven JavaScript. |

## A screen shot

```json
{
  "id": "tour",
  "kind": "screen",
  "durationFrames": 144,
  "screen": {
    "asset": "dashboard",
    "presentation": "studio",
    "backdrop": "theme",
    "fit": "contain",
    "frame": "browser-dark",
    "frameTitle": "console.example.com",
    "shadow": "floating",
    "lighting": { "style": "glow", "intensity": 0.6 }
  },
  "camera": {
    "shots": [
      { "at": 0 },
      { "at": 0.3, "focus": [0.32, 0.36], "zoom": 1.7 },
      { "at": 0.7, "focus": [0.32, 0.36], "zoom": 1.7 },
      { "at": 1 }
    ],
    "ease": "gentle"
  },
  "caption": { "text": "Every service in one view" }
}
```

`at` is a fraction of the shot, so changing `durationFrames` keeps the same rhythm. Consecutive identical shots are holds. `camera.ease` accepts `gentle`, `snappy` and `spring`; `camera.flow` keeps the camera moving through areas; `camera.drift` (0–1) adds a slow orbit.

## Source timing

Playback is independent of the camera. Trim, skip waits and hold a result without touching the recording:

```json
"playback": {
  "startSeconds": 1.2,
  "endSeconds": 9.5,
  "segments": [{ "outputStart": 48, "outputEnd": 72, "rate": 3 }],
  "holds": [{ "outputStart": 100, "outputEnd": 148 }]
}
```

The Studio's **Source moments** controls write these fields. Decoded frames are cached once per recording under `.runtime/source-frames`.

## Text

`text-template` scenes animate a title and subtitle with one of: `masked-lines`, `word-stagger`, `blur-reveal`, `keyword-highlight`, `title-sequence`, `typing`, `line-wipe`, `scale-pop`, `character-cascade`, `number-roll`, `underline-sweep`, `caption-over-screen`.

```json
"textAnimation": { "template": "word-stagger", "entryFrames": 18, "holdFrames": 44, "exitFrames": 9 }
```

Copy is measured with the real font. Text that cannot fit, or a hold too short to read, is rejected with a message telling you to shorten the copy or lengthen the shot.

## Backgrounds

`background.style` is `static`, `gradient-drift`, `soft-light` or `particles`. `background.image` selects a brand kit background such as `example/aurora`.

## Transitions

Set `transition` on a shot to control the cut into the next one: `cut`, `crossfade`, `side-slide`, `wipe-left`, `wipe-right`, `circle-reveal`, `dip-black` or `zoom-in`, with a frame count.

```json
"transition": { "type": "crossfade", "frames": 12 }
```

## Artwork layers

Up to 12 SVG or Lottie layers can sit over any shot, positioned in normalized stage coordinates. See [After Effects and Lottie](../motion/after-effects.md).

## Motion blur

`"motionBlur": { "samples": 8, "shutter": 0.5 }` renders sub-frames and averages them at export. Preview stays sharp and fast.
