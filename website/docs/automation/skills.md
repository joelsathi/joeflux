---
title: Agent skills
description: The production guidance the director loads on demand.
---

# Agent skills

Skills are short Markdown playbooks in `skills/`. Each starts with a one-line description of when to use it, followed by instructions and links to longer references. Claude Code reads them from `.claude/skills/` and Codex from `.agents/skills/`; both folders mirror `skills/`. Any MCP client can read them with `skill_list` and `skill_get`.

| Skill | Use it when |
| --- | --- |
| `video-production` | Planning, editing, pacing or reviewing a product demo or explainer. |
| `motion-graphics` | Designing kinetic type, animated diagrams, product reveals or graphic transitions. |
| `animation-authoring` | Writing JavaScript or Three.js animation, camera choreography or reading holds. |
| `animation-engines` | The user asks for better animation; offers the bundled engines and asks the user to choose. |
| `animation-plugins` | Authoring reusable Anime.js or Motion scenes, or extending the engine adapters. |
| `three-video` | Building Three.js or React Three Fiber scenes. |
| `resolve-finishing` | Preparing a DaVinci Resolve handoff, only when asked. |

## How skills stay cheap

The director first sees only the skill list (about 400 tokens). It loads one skill when a task needs it, and a reference file only when the skill points to it. See [Token efficiency](../architecture/token-efficiency.mdx).

## Writing a skill

1. Create `skills/<name>/SKILL.md` with `name` and `description` front matter. Write the description as "Use when…".
2. Keep the body short and actionable. Move long material into `skills/<name>/references/*.md` and link to it.
3. Copy the folder into `.claude/skills/` and `.agents/skills/`.
