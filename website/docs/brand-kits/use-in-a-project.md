---
title: Use a kit in a project
description: Apply a brand kit's logo, themes, backgrounds and bookends.
---

# Use a kit in a project

## In the Studio

The **Brand kit** card at the top of the Director panel appears whenever a kit is installed.

![Brand kit card](/img/screens/brand-kit-card.png)

1. Choose the kit in **Kit**. The logo overlay appears on every shot, using the on-dark or on-light logo to match each shot's theme.
2. Choose **Intro** and **Outro** to add the kit's clips as the first and last shots. Choose **None** to remove them.
3. Select a shot and open **Look**. Pick a kit theme in the theme grid, or a kit background in the Background gallery; each background brings a matching text theme.

## From the CLI or an agent

```bash
pnpm tool projects/my-video brand_kit_list
pnpm tool projects/my-video project_update '{"brand":"acme","theme":"acme-dark"}'
pnpm tool projects/my-video brand_bookend_apply '{"role":"intro","bookend":"intro"}'
pnpm tool projects/my-video background_apply '{"id":"title","background":"acme/hero"}'
```

Or ask the director: "Use the Acme kit, add its intro and outro, and put the title on the hero background." It reads the kit's guidelines first.

## In JSON

```json
{ "brand": "acme", "theme": "acme-dark" }
```

| Setting | Effect |
| --- | --- |
| `project.brand: "acme"` | Logo overlay on every shot. |
| `scene.brand: "none"` | Hides the logo on one shot, for example a full-screen recording whose own UI shows the product name. |
| `theme: "acme-dark"` | A kit theme; ids are `<kit>-<theme>`. |
| `background.image: "acme/hero"` | A kit background; its paired theme is `background-acme-hero`. |

Bookends are copied into the project's `assets/` when added, so the project still renders if the kit later changes.

## Switching brands

Change `brand` and the themes to another kit's ids, then re-render. The render cache includes the installed kits, so affected shots render again automatically.
