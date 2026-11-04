---
title: Template packs
description: Share templates as local, data-only packs.
---

# Template packs

A template pack is a folder of JSON that contributes templates built on the trusted renderers and components. Packs never execute code: no JavaScript, tools, network services or new renderers. That makes them safe to share between teams.

## Start from the example

```bash
cp -R fixtures/plugins/proof-pack ~/my-proof-pack
pnpm plugin:check ~/my-proof-pack
```

Edit `plugin.json` (your own `publisher/package` id, an exact version, MIT license) and `templates/proof-reveal.json` (copy defaults, slots and controls).

```json
{
  "manifestVersion": 1,
  "apiVersion": 1,
  "id": "my-team/proof-pack",
  "version": "1.0.0",
  "license": "MIT",
  "dependencies": {},
  "entryPoints": {},
  "capabilities": { "execution": "data", "offline": true },
  "contributes": { "templates": ["templates/proof-reveal.json"] }
}
```

## Check, install and use

```bash
pnpm plugin:check ~/my-proof-pack
pnpm tool projects/my-video plugin_install '{"directory":"/Users/me/my-proof-pack"}'
pnpm tool projects/my-video template_list
pnpm tool projects/my-video template_apply '{"template":"my-team/proof-pack/proof-reveal","id":"proof","duration":"medium"}'
```

`plugin:check` instantiates every template at short, medium and long durations in landscape, square and portrait and validates the result. It changes no files.

Installing stores an immutable snapshot (manifest, templates, version and content digest) in `project.json`, so the project keeps working if the pack folder disappears. Installing, enabling and disabling are undoable. A changed pack is never upgraded silently; existing shots keep their pinned version.

## Rules a pack must follow

- `manifestVersion` and `apiVersion` are `1`, `execution` is `"data"`, `offline` is `true`, and `entryPoints` is an empty object.
- Dependencies use exact versions.
- Templates use the built-in renderers and the `harness/title`, `harness/proof`, `harness/shape`, `harness/cta` and `harness/terminal` components.
- Text slots declare a `maxLength`; asset slots refer to assets in the destination project.
- JSON files are at most 1 MiB. URLs, path traversal and symlinks that leave the pack are rejected.

Use a patch version for fixes, a minor version for new templates or optional inputs, and a major version for removed or renamed templates and inputs.

The SDK entry point is `packages/plugins/index.js`, with TypeScript declarations in `packages/plugins/index.d.ts`.
