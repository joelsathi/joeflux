# Open-source JavaScript animation for deterministic video

## Select by the shot's needs

| Need | First choice | Integration decision |
|---|---|---|
| Text, masks, flat graphics, cropped UI | Existing Canvas/SVG/CSS pipeline | Preserve working renderer and scene schema |
| Multi-property 2D choreography | Anime.js, or pure frame functions | Disable autoplay; seek the timeline from output time |
| Actual geometry, perspective occlusion, lighting | Three.js | Separate WebGL canvas plus a proven compositing/capture path |
| Numerous sprites and 2D filters | PixiJS | Disable autonomous ticker; set state and render explicitly |
| Explanatory diagrams and code-driven illustration | Motion Canvas | Author/render separately; import the result as media unless an adapter is explicitly built |
| Artist-edited keyframe curves | Theatre.js with an appropriate renderer | Evaluate sequence position explicitly; version the saved state |
| Supplied compatible AE export | lottie-web | Wait for assets; seek frames explicitly; test supported features |

Read repository-root `context/video-quality-sources.md` for license evidence. These options require integration work; do not install all of them or describe them as current harness features.

## Use one export clock

The frame evaluator receives `frame`; derive `seconds = frame / fps`. Fractional frames are valid. Set absolute poses from that time. Preload immutable resources and use a fixed seed for procedural values. Preview and export must share the same evaluation function.

Examples of timestamp control, after initialization:

- Anime.js timeline created with `autoplay: false`: `timeline.seek(seconds * 1000, true)` (milliseconds; mute callbacks). Animate plain state for Canvas work or use a separately proven DOM capture path.
- Three.js: set absolute transforms and shader uniforms, or call `mixer.setTime(seconds)` with known time scale/action state; then render. Avoid accumulated `mixer.update(delta)` during export. Reset/avoid one-shot action state that depends on earlier seeks and test out-of-order requests.
- Theatre.js: assign the sequence position in seconds after the project is ready, then render via the selected backend.
- Lottie: disable autoplay/loop and call `goToAndStop(localFrame, true)` after readiness. Convert output time to the animation's own frame rate; test its in/out range.
- Motion Canvas: use its own scene/render lifecycle; generators cannot simply be pasted into the harness's custom-frame API.

## Minimal harness example

This dependency-free example demonstrates a deterministic reveal, a settled reading interval, and an exit. It is a timing pattern, not a complete visual template. The scene needs `durationFrames` and may provide `params.title`.

```js
export function renderFrame(frame, {canvas, context: ctx, output, scene}) {
  const clamp = x => Math.max(0, Math.min(1, x));
  const smooth = x => x * x * (3 - 2 * x);
  const seconds = frame / output.fps;
  const lastTime = (scene.durationFrames - 1) / output.fps;
  const arrive = smooth(clamp(seconds / 0.5));
  const remain = smooth(clamp((lastTime - seconds) / 0.3));
  const title = scene.params?.title ?? 'See the result';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#101827';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = `600 ${canvas.width / 24}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (ctx.measureText(title).width > canvas.width * 0.8) {
    ctx.restore();
    throw new Error('Shorten the title or author a measured multiline layout');
  }
  ctx.globalAlpha = arrive * remain;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(title, canvas.width / 2,
    canvas.height / 2 + (1 - arrive) * canvas.height * 0.035);
  ctx.restore();
}
```

The font here is illustrative. Production should use the project's loaded, licensed font and brand tokens. Calculate hold adequacy from the actual copy; a long title does not become readable merely because the example has a hold.

## Three.js adapter requirements

The supplied canvas already has a 2D context. Do not request WebGL on that same canvas. Create a separate renderer canvas with explicit export dimensions and pixel ratio, render the requested time, and synchronously composite its canvas into the supplied 2D context, or render a media asset outside the harness. Verify WebGL readback/capture behavior rather than assuming preservation across asynchronous frames. Keep color management and alpha treatment consistent; test transparent edges and text overlays.

Preload models, textures, and shaders before capture; freeze environment and resolution. Use stable camera near/far planes, sensible scene scale, readable lighting, and a controlled renderer version. Dispose resources when replacing a scene. Browser module imports need a supported local served/bundled path; a bare npm import or CDN URL is not automatically supported by custom modules. Declare imported helper files and asset dependencies in the scene's cache inputs.

## Verification that catches real export failures

Request frame 0, midpoint, final frame, then an earlier frame and the midpoint again. Compare repeated states/images within the same renderer environment. Test a fractional frame. Stateful simulations need a deterministic reset/replay or baked cache; a seeded random generator alone does not make random-access rendering deterministic.

Check the scene in preview and a short actual export; inspect both for missing layers, font changes, alpha fringes, color shifts, and stale caches. For transitions, render both endpoints and the assembled boundary. Use the project's installed FFmpeg build for output checks. Browser screenshots alone do not establish encoded-video fidelity.

Primary APIs: [Anime.js seek](https://animejs.com/documentation/timeline/timeline-methods/seek/), [Three.js AnimationMixer](https://threejs.org/docs/pages/AnimationMixer.html), [PixiJS render loop](https://pixijs.com/8.x/guides/concepts/render-loop), [Motion Canvas flow](https://motioncanvas.io/docs/flow/), [Theatre.js core](https://www.theatrejs.com/docs/latest/api/core), [lottie-web](https://github.com/airbnb/lottie-web).
