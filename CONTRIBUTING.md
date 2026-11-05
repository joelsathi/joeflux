# Contributing

JoeFlux creates deterministic silent videos from editable project data. Preserve source media, authored decisions, dependency locks and undo history. Production instructions for agents are in [AGENTS.md](AGENTS.md) and [context/workflows.md](context/workflows.md).

## Setup and checks

Use Node 22.13 or newer and the pnpm version pinned in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test
pnpm run build:plugins
pnpm run build:studio
pnpm run licenses:check
pnpm plugin:check fixtures/plugins/proof-pack
pnpm run docs:build
```

Use `pnpm run test:fast` while iterating; it skips the slow browser, Studio and render suites. Run `pnpm test` before handoff; CI runs only `pnpm run test:basic`, which also skips every suite that needs Chromium or FFmpeg. After editing `skills/`, run `pnpm run skills:sync` to refresh the `.agents/skills` and `.claude/skills` mirrors (`pnpm run skills:check` fails on drift).

## Changes to code

- Studio and rendering changes need browser tests that render real frames. Check fractional frames, repeated and backward seeks, cancellation and disposal.
- Project edits go through tools, stay transactional and remain undoable.
- Keep output silent and keep reading holds protected.
- New bundled animation or rendering dependencies must be MIT-licensed, pinned, and listed in `THIRD_PARTY_NOTICES.md` and `website/docs/reference/licenses.md`. `pnpm run licenses:check` must pass.

## Templates, packs and brand kits

- Template packs are data-only; see `website/docs/motion/template-packs.md`.
- Brand kits are folders under `brand-kits/`; run `pnpm run brand -- sync` and commit the updated registry with the kit.
- Record the source and license of every font, logo, footage clip, Lottie file and model you add.

## Documentation

The docs live in `website/docs`. Regenerate generated content when it changes:

```sh
node scripts/generate-docs-reference.mjs     # tools and themes pages
node scripts/measure-agent-context.mjs       # token budget figures
node scripts/capture-docs-screenshots.mjs    # Studio screenshots
```

## Pull requests

Describe the problem and the resulting behavior, the tests and builds you ran, and for motion or layout work the smallest specimen you rendered and the frames you inspected. Passing tests show the output is technically correct, not that the motion reads well.
