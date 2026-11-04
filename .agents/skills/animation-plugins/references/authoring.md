# Adapter authoring

The source is packages/animation-plugins/src; the generated local browser API is `/animation-plugins/runtime.js`. `pnpm run build:plugins` bundles pinned dependencies and notices; preview/render build it automatically when sources or the lockfile change. `pnpm run build:studio` includes this preparation for desktop packaging. No runtime CDN is used.

Every adapter factory receives `{ canvas, context, output, project, scene }` with a private 2D canvas. It returns `{ render(frame), dispose() }`. `render` may be async and must finish before capture. `dispose` releases resources. The host serializes operations and publishes only current requests. Never capture a WebGL scene before React commits or while loaders are still pending.

## Custom Anime.js scene

Save this plain JavaScript module as scenes/orbit.js:

```js
import { createAnimeScene } from '/animation-plugins/runtime.js';
const factory = createAnimeScene({
  build(timeline) {
    const pose = { x: 0 };
    timeline.add(pose, { x: [0, 1], duration: 1200, ease: 'outQuart' }, 0);
    return pose;
  },
  draw(pose, frame, { canvas, context: ctx, output }) {
    ctx.resetTransform();
    ctx.fillStyle = '#0a1628';
    ctx.fillRect(0, 0, output.width, output.height);
    ctx.fillStyle = '#74e7cd';
    ctx.beginPath();
    ctx.arc(output.width * (.2 + pose.x * .6), output.height * .5, output.height * .08, 0, Math.PI * 2);
    ctx.fill();
  }
});
export function renderFrame(frame, context) {
  return context.renderPlugin(factory);
}
```

Reference it from a normal scene JSON:

```json
{"id":"orbit","durationFrames":120,"module":"scenes/orbit.js"}
```

Add the JSON entry to project.json or use the existing scene tools. The module owns the full frame. Helper files must be bundled into this project module: the current project-module HTTP route serves declared scene entry modules, not arbitrary helper imports. For JSX/TypeScript compile to browser ESM first; importing runtime React from `/animation-plugins/runtime.js` keeps one React instance. Declare generated module and project-local dependencies for cache invalidation. Prefer a single self-contained module for small scenes.

## Add a shared plugin

1. Add a factory to builtins.js and metadata to catalog.js. Export adapter helpers from runtime.js when needed. A plugin id maps to a local factory; URLs and arbitrary script names are never accepted in the scene plugin field.
2. Add library/templates/plugin-ID/template.json with validated text slots, fixed defaults and duration choices. Existing template_list/template_apply and studio UI discover it automatically.
3. Validate any new pluginOptions. Keep plugin scenes exclusive with preset/module/kind. Handle dimensions, teardown and repeated nonmonotonic frames.
4. Add browser coverage and run pnpm run build:plugins. Update THIRD_PARTY_NOTICES.md and website/docs/reference/licenses.md for new dependencies.

Plugins here are in-repository modules and templates, not a public npm registry or a marketplace. People can use them immediately in the harness and share custom scenes through its existing module contract.

## Adapting VengeanceUI

Inspect only the desired component and exact source revision, its imports and LICENSE. Retain the copyright notice with any copied/adapted source. Replace viewport observers, scroll/hover triggers, random-on-mount state and autonomous motion with explicit frame-derived props. Tailwind classes need compiled local CSS if keeping a DOM implementation; Canvas/Three adapters require reauthoring the visual. Do not describe reauthored original visuals as copied VengeanceUI components. The current Motion template is original Canvas artwork, not a vendored VengeanceUI component.
