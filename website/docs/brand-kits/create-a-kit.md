---
title: Create a brand kit
description: Scaffold, fill and validate a brand kit.
---

# Create a brand kit

## 1. Scaffold the folder

```bash
pnpm run brand -- new acme --name "Acme"
```

```text
brand-kits/acme/
├── brand.json
├── guidelines.md
├── logos/
├── fonts/
├── backgrounds/
└── bookends/
```

You can also copy an existing folder, or link one kept elsewhere: `ln -s ~/brands/acme brand-kits/acme`. The folder name must match the kit `id`.

## 2. Add your files

| Folder | Accepted files | Tips |
| --- | --- | --- |
| `logos/` | `.svg`, `.png`, `.webp`, `.jpg` | Supply one logo for dark backgrounds and one for light. SVG stays sharp at every size. |
| `fonts/` | `.woff2`, `.woff`, `.ttf`, `.otf` | Check the font license allows embedding in video. Variable fonts can declare a weight range such as `"100 900"`. |
| `backgrounds/` | `.svg`, `.png`, `.webp`, `.jpg` | Use 1920×1080 or larger. Leave a calm area for text and note it as `safeArea`. |
| `bookends/` | `.mp4` | H.264 at the size and frame rate of your projects. Audio is ignored. |

## 3. Describe them in brand.json

```json
{
  "id": "acme",
  "name": "Acme",
  "logos": { "onDark": "logos/acme-white.svg", "onLight": "logos/acme-ink.svg" },
  "logoPlacement": { "corner": "top-left", "width": 240, "margin": [96, 64] },
  "fonts": [
    { "family": "Acme Sans", "file": "fonts/AcmeSans-Variable.woff2", "weight": "100 900" }
  ],
  "themes": [
    { "id": "dark", "mode": "dark", "background": "#0E1530", "backgroundEnd": "#1B2550", "text": "#FFFFFF", "muted": "#C3CAE8", "accent": "#FF5A36", "font": "\"Acme Sans\", system-ui, sans-serif" },
    { "id": "light", "mode": "light", "background": "#FFFFFF", "text": "#111633", "accent": "#E0401C", "font": "\"Acme Sans\", system-ui, sans-serif" }
  ],
  "backgrounds": [
    { "id": "hero", "label": "Hero gradient", "file": "backgrounds/hero.webp", "mode": "dark", "colors": ["#0E1530", "#1B2550"], "text": "#FFFFFF", "accent": "#FF5A36", "safeArea": [0.1, 0.12, 0.8, 0.76] }
  ],
  "bookends": [
    { "id": "intro", "role": "intro", "label": "Logo intro", "file": "bookends/intro.mp4", "seconds": 3 },
    { "id": "outro", "role": "outro", "label": "End card", "file": "bookends/outro.mp4", "seconds": 4 }
  ],
  "guidelines": "guidelines.md"
}
```

Only `id` and `name` are required. Everything else is optional and has sensible defaults; see the [reference](reference.mdx).

## 4. Write guidelines for the director

`guidelines.md` is plain Markdown. The director reads it once per session with `brand_kit_get`, so keep it short and concrete:

```markdown
# Acme brand guidelines

- Voice: short, confident sentences in sentence case.
- Logo: on-dark logo over dark themes. Never stretch, recolor or animate it.
- Color: orange is for calls to action only.
- Motion: calm entrances, two-second minimum holds, no bouncing.
```

## 5. Sync

```bash
pnpm run brand -- sync
```

Sync checks every kit and writes `brand-kits/registry.json`. It reports every problem at once, for example:

```text
Brand kits have 2 problems.
acme: missing file logos/acme-white.svg
acme: themes.0.accent use a six-digit hex color
```

Restart a running Studio after syncing so it picks up the new registry. `pnpm run brand -- list` shows what is installed without writing anything.

## Keeping kits private

Kits are ordinary folders, so you decide whether they are committed. To keep client brands out of a shared repository, add them to `.gitignore` (for example `brand-kits/acme/`) or link them in from a private location. The registry records names, paths and colors, not file contents.
