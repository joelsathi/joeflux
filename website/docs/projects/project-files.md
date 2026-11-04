---
title: Project files
description: The folder layout and project.json manifest.
---

# Project files

A project is an ordinary folder. Everything the Studio, the CLI and agents edit is plain JSON you can read, diff and commit.

```text
my-video/
├── project.json        # output settings, theme, brand, assets and scene order
├── WORKING_STATE.md    # your current decisions and review notes
├── assets/             # original recordings, images, SVG and Lottie files
├── scenes/             # one JSON file per shot, plus optional custom modules
├── exports/            # rendered clips, final.mp4 and review images (generated)
└── .runtime/           # undo history, frame cache and decoded sources (generated)
```

## project.json

```json
{
  "version": 1,
  "name": "Launch walkthrough",
  "theme": "example-dark",
  "brand": "example",
  "output": { "width": 1920, "height": 1080, "fps": 24, "codec": "h264", "colorSpace": "bt709", "audio": false },
  "assets": {
    "dashboard": "assets/dashboard.mp4",
    "logo-mark": "assets/logo-mark.svg"
  },
  "scenes": [
    { "id": "brand-intro", "file": "scenes/brand-intro.json" },
    { "id": "tour", "file": "scenes/tour.json" },
    { "id": "brand-outro", "file": "scenes/brand-outro.json" }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `output` | Frame size, frame rate and codec for every shot. `audio` must be `false`. |
| `theme` | Default theme for shots that don't set their own. See [Themes](../reference/themes.mdx). |
| `brand` | Brand kit id, or `"none"`. Adds the kit's logo overlay. See [Brand kits](../brand-kits/overview.mdx). |
| `assets` | Name → file. Scenes refer to assets by name, so you can replace a file without editing scenes. |
| `scenes` | Shot order. Each entry points to a scene file. |
| `brief`, `style`, `reviews` | Written by the Studio and director: the saved brief, remembered looks and timecoded review findings. |

## What is safe to edit by hand

Everything in `project.json` and `scenes/`. The Studio watches the folder and shows outside edits live. Run `pnpm run validate -- <project>` after a manual edit; invalid projects are refused by the tools rather than half-saved.

Never edit files in `.runtime/` or `exports/`; they are regenerated. Source files in `assets/` are only ever read.

## WORKING_STATE.md

A short log for you and your agent with five sections: Current objective, Last change, Checks run, Open decisions and Next action. Agents read it before changing a scene.
