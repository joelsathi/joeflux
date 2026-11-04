---
title: Compositions
description: Layered, editable components with protected reading holds.
---

# Compositions

A composition shot (`kind: "composition"`) stacks independent components on one timeline. Each component paints its own transparent surface, and the host composites them in order.

| Component | Engine | Inputs |
| --- | --- | --- |
| `harness/title` | Anime.js | Title, subtitle, color, treatment |
| `harness/cta` | Anime.js | Call to action copy and color |
| `harness/shape` | Motion | Original geometry |
| `harness/proof` | Canvas | An image or video asset |
| `harness/terminal` | Canvas | Commands and output transcripts |

```json
{
  "id": "headline",
  "component": "harness/title",
  "version": "1.0.0",
  "inputs": { "title": "A useful change", "subtitle": "One clear result", "color": "#8B7CFF" },
  "layout": { "anchor": "top" },
  "timing": { "startFrame": 0, "entranceFrames": 12, "holdFrames": 100, "exitFrames": 8 },
  "locks": { "copy": false, "layout": false, "motion": false, "beat": false }
}
```

## Timing

Each component has an entrance, a hold and an exit. Titles and CTAs reserve at least two seconds of hold, plus one second for every three words. Retiming a shot keeps that hold and shortens entrance and exit first; a request too short to fit is rejected.

## Layout

Landscape, square and portrait each have tuned layouts. Anchors are `top`, `center`, `bottom`, `left`, `right` and `full`, or set normalized `layout.bounds`. Text wraps by grapheme and refuses to shrink below a readable size.

## Locks

Lock copy, layout, motion or beat on a component. Locks are enforced for every tool, including generic `scene_update`, so an agent cannot accidentally restyle approved work.

## Examples

`projects/neutral-landscape`, `neutral-square` and `neutral-portrait` contain the `product-proof` and `brand-reveal` recipes in all three formats.
