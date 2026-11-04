---
sidebar_position: 2
title: Your first video
description: Create a project, add shots, render and assemble a silent MP4.
---

# Your first video

## 1. Create a project

```bash
pnpm run init -- projects/first-video
pnpm run preview -- projects/first-video
```

`init` copies `templates/project` into a new folder with a small starter scene.

## 2. Add your media

Copy screen recordings and images into the project's `assets/` folder, or use **Import** in the Studio. Assets are registered by name in `project.json`:

```json
{
  "assets": {
    "dashboard": "assets/dashboard.mp4",
    "logo": "assets/logo.svg"
  }
}
```

## 3. Build the sequence

- Choose **Add a shot → Browse templates** and pick an opener, a product reveal or a call to action.
- Add a **screen** shot for each recording, then draw focus areas on the stage.
- Reorder shots in the shot strip and edit copy in the inspector.

If you connected an agent, describe the result instead:

> "Build a short product walkthrough: introduce the feature, show the important action, hold on the result, then close with a next step."

## 4. Apply a brand

Pick a brand kit in the **Brand kit** card, choose one of its themes in the inspector, and add its intro and outro. See [Use a kit in a project](../brand-kits/use-in-a-project.md).

## 5. Render and review

```bash
pnpm run validate -- projects/first-video
pnpm run render -- projects/first-video
pnpm run assemble -- projects/first-video
pnpm run review -- projects/first-video
```

| Output | Location |
| --- | --- |
| Per-shot clips | `exports/clips/<scene-id>.mp4` |
| Final video | `exports/final.mp4` |
| Contact sheet | `exports/review/contact-sheet.jpg` |

While iterating, render only the changed shot:

```bash
pnpm run render -- projects/first-video --scene intro
```

Unchanged shots are reused from the render cache. Watch the affected shot and its neighbouring cuts at normal speed before you assemble the final cut.
