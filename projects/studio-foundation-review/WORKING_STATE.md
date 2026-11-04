# Studio foundation review

Three shots at 960×540 and 24 fps: kinetic title motion with SVG and Lottie artwork, a framed screen with camera focus and a caption, and a continuous screen handoff. They use the Oxygen dark theme, WebGL looks, motion blur and scene transitions. `node scripts/record-studio-review.js` records a short Studio walkthrough to `exports/studio-walkthrough.webm`.

## Current objective

Reference sample. No production work is in progress.

## Last change

None recorded since the project was generated.

## Checks run

None recorded. List each command or review with its result and date, for example: `pnpm run validate -- <project>` passed; scene `opening` played at 1920×1080, 24 fps, at normal speed.

## Open decisions

None.

## Next action

Regenerate and render the project:

```sh
node scripts/create-studio-foundation-review.js
pnpm run render -- projects/studio-foundation-review
pnpm run assemble -- projects/studio-foundation-review
pnpm run review -- projects/studio-foundation-review
```
