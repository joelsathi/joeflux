---
title: Render and review
description: Export clips, assemble the film and review it.
---

# Render and review

## Commands

```bash
pnpm run validate -- projects/my-video
pnpm run render -- projects/my-video              # every changed shot
pnpm run render -- projects/my-video --scene tour # one shot
pnpm run render -- projects/my-video --force      # ignore the cache
pnpm run assemble -- projects/my-video
pnpm run review -- projects/my-video
```

| Step | Output |
| --- | --- |
| `render` | `exports/clips/<scene>.mp4`, one silent H.264 clip per shot. |
| `assemble` | `exports/final.mp4`, joined with each shot's transition. |
| `review` | `exports/review/contact-sheet.jpg`, and a check that the final file has no audio stream. |

## The render cache

A shot's fingerprint covers the output settings, the scene JSON, every referenced asset, the renderer and preset code, bundled fonts and the installed brand kits. Change one shot and only that shot re-renders. Change a brand kit and every shot that could use it re-renders.

## Review loop

1. Render the smallest affected shot first.
2. Use `quality_review` (or **Explore three looks**) to inspect entrance, hold and exit frames.
3. Preview the transition into the next shot.
4. Watch the shot and its neighbours at normal speed and intended size.
5. Assemble, then check the contact sheet.

Validation, tests and contact sheets confirm the file is technically correct. They do not prove pacing or readability; that takes watching.
