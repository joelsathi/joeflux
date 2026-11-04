---
title: Templates
description: Ready-made shots you can add, fill and edit.
---

# Templates

Templates are complete shots with named slots for copy and media, duration presets and typed controls. Applying one is a single undoable change; afterwards the shot is ordinary scene JSON you can keep editing.

| Category | Templates |
| --- | --- |
| Titles | `chapter-opener`, `typing-title`, `word-stagger` |
| Screen | `product-reveal`, `focus-tour` |
| Transitions | `screen-handoff`, `side-slide`, `accent-mask` |
| Story | `problem-to-product` |
| Product evidence | `product-proof` |
| Brand motion | `brand-reveal` |
| Explainers | `terminal-dark`, `terminal-light` |
| Motion graphics | `plugin-animejs`, `plugin-motion` |
| 3D | `plugin-threejs`, `plugin-react-three` |

## In the Studio

**Add a shot → Browse templates**. The preview renders with your assets and brand kit. Pick a duration (short, medium or long), set copy, choose a theme and select **Add shot**.

## From the command line or an agent

```bash
pnpm tool projects/my-video template_list
pnpm tool projects/my-video template_apply '{"template":"product-reveal","id":"reveal","slots":{"asset":"dashboard","title":"See the difference"},"duration":"medium"}'
pnpm tool projects/my-video template_apply '{"template":"brand-reveal","id":"brand"}'
pnpm tool projects/my-video template_set_control '{"id":"brand","control":"treatment","value":"bold"}'
```

`template_list` returns a summary (id, label, category, description, slots, controls, and the pack name and version). Add `"preview": true` for the built scenes the Studio gallery renders, or `"category": "Transitions"` to filter.

## Where templates live

Built-in templates are in `library/templates/<id>/template.json`:

```json
{
  "id": "product-reveal",
  "label": "Product reveal",
  "category": "Screen",
  "description": "An angled product settles beside the message and fills the frame.",
  "scene": { "preset": "product-reveal", "durationFrames": 144, "params": { "title": "{{title}}", "subtitle": "{{subtitle}}", "asset": "{{asset}}" } },
  "slots": [
    { "id": "asset", "type": "asset", "required": true },
    { "id": "title", "type": "text", "maxLength": 64, "default": "See the difference" }
  ],
  "controls": { "durations": { "short": 4, "medium": 6, "long": 8 } }
}
```

To share templates between projects or teams without code, publish a [template pack](template-packs.md).
