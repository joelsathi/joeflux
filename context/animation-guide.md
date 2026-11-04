# Animation guide

For creative direction, start with `skills/video-production/SKILL.md` (brief, story, cuts, pacing, template adaptation, and quality review) and `skills/animation-authoring/SKILL.md` (motion craft and open-source JavaScript/Three.js). Curated learning and license sources are in `context/video-quality-sources.md`. The API recipes below describe existing harness behavior, not a complete creative brief or an exhaustive library catalog.

Use `skills/motion-graphics/SKILL.md` for animated typography, diagram choreography, shape transformations, graphic transitions, and product reveals. Its linked recipes include an exact 15-second SaaS treatment with a protected UI-proof hold.

Use one visual idea per scene. Let the most important word, card, or UI detail settle before advancing. At 24 fps, an arrival of roughly 12–24 frames and a hold of 36 frames can be a starting point for very short copy. Budget longer holds from the complete message and UI interpretation; see the production skill's `references/editing-and-pacing.md`. A fixed minimum does not establish readability.

Use particles as quiet depth, not an overlay over important copy. Card rotations should stay below roughly 16 degrees. Pushes, pans, and tilts should identify a detail, then settle. Recordings may be sped up only between reading moments; freeze the source frame or return to normal speed when labels require attention.

The included presets are starting points: `oxygen-particles`, `text-settle`, `floating-cards`, `feature-list`, `recorded-showcase`, and `focus-transition`. The retained Oxygen UI reference and Apache-2.0 license are in `references/oxygen/`; see `THIRD_PARTY_NOTICES.md`. Use original copy, assets, and scene composition.

## Screen recipes

Use `projects/motion-showcase` for the 30-second story and `projects/template-gallery` to inspect six recipes in both themes. `light-blue` is the default palette. Set project/scene `theme: "navy-dark"` for navy, orange accents, and locally loaded Inter.

`screen-handoff` uses `params.outgoingAsset`, `incomingAsset`, `outgoingSeconds`, and `incomingSeconds`. Supply the outgoing recording's last shown source time and the incoming recording's first shown source time. Use cuts around this scene. Its full-screen flat endpoints then match adjacent full-screen recordings. `perspective` defaults to 1800px. `timing.holdFrames` edits the caption hold while retaining room for arrival.

`product-reveal` stages headline, angled screen, caption exit, and continuous full-screen expansion. `problem-to-product` uses `title`, up to three short `items`, `benefit`, `subtitle`, and `asset`. `chapter-opener` uses an accent sweep, title/subtitle hold and optional incoming `asset`. `side-slide` and `accent-mask` are dedicated scene recipes accepting the same two screen asset IDs as handoff. Assembly also supports a `side-slide` overlap; use dedicated scenes for precisely matched boundaries.

Footage timing uses **seconds internally**. Prefer `playback.startSeconds`/`endSeconds`; old `startFrame`, `endFrame` and hold `sourceFrame` are interpreted at `sourceFps` (falling back to output fps). Speed segments use half-open output ranges `[outputStart, outputEnd)` and optionally `endRate` for linear ramps. Legacy holds retain inclusive endpoints. A hold without a source value pauses the current source clock; an explicit `sourceSeconds` or `sourceFrame` is a deliberate seek and resumes from that location after the hold. Use implicit holds to avoid unwanted jumps. Omitted playback advances normally, not a frozen first frame.

`zoom` is a manual source-crop region with `startFrame`, `endFrame`, `entryFrames`, `exitFrames`, `scale`, `focusX`, and `focusY`. Focus is normalized 0–1 and clamped to covered source edges. Entry/exit must fit inside the region; the remaining interval is the reading hold. Optional `focusKeyframes: [{frame, focusX, focusY}, ...]` pans between details at constant zoom. Preview exposes a single region per scene; use separate shots for separate zoom envelopes. This does not infer mouse telemetry from ordinary MP4s.

Camera `keyframes: [{frame, x, y, z, rotateX, rotateY, rotateZ, scale, easing}, ...]` are ordered, independent poses. Missing pose values inherit from the previous keyframe. Equal consecutive poses create a camera hold. Coordinates use the 1920px design stage and scale with the output. Preserve 16:9 for the supplied recipes. Use `composition: "full"` on recorded-showcase for a caption-free full-screen shot.

Long titles/subtitles/cards are measured with the actual drawing font. Unfit content raises a scene-specific error; shorten the copy or use another shot instead of shrinking it below the minimum. Do not insert five items into a four-card layout. Fonts and requested images finish decoding before capture.

## Connection styles and Oxygen themes

`connectionStyle: "continuous"` opts `screen-handoff`, `product-reveal`, or `side-slide` into continuous connections. Omit it or select `classic` for the original choreography. The preview's **Connection style** selector is available on these three presets.

- Handoff retreats and rotates together, changes content on one aligned plane, then advances after copy exits. The outgoing source stays opaque beneath the incoming dissolve to avoid a background flash. Both source times remain explicit, frozen anchors. This focused variation leaves out classic supporting cards; the classic recipe retains them.
- Product reveal's continuous variation reframes a fullscreen recording into a smaller angled screen, holds beside the caption, and returns to fullscreen. Its normal playback clock continues throughout. This differs intentionally from the classic title-first reveal.
- Side-slide shares one movement curve for both screen edges and holds briefly at each endpoint. Use roughly two seconds for a transition; the six-second recipes provide longer reading holds.

All ten added Oxygen themes are available at project and scene level: `oxygen-{acrylic-orange,acrylic-purple,wso2,pale-indigo,pale-gray}-{light,dark}` (the `wso2` family is labelled Default). Acrylic and Default bring layered static radial backgrounds; Pale variants are quiet flat palettes. Fonts are local and mode-aware. No animated-gradient or new text-animation library is included in these two steps.

Run `node scripts/create-refinement-review.js` to generate side-by-side review projects for the connection styles and all themes.

## Animated backgrounds and text templates

`scene.background` selects motion independently of the theme: `{ "style": "gradient-drift", "intensity": 0.5, "speed": 1 }`. Styles are `static` (no particles), `gradient-drift` (slow radial movement; soft accent drift on flat palettes), `soft-light` (moving diffuse highlight), and `particles` (seeded dots). Intensity is 0–1; speed is 0.1–2. Omit the field or select **Original background** to retain the accepted gradient and particle appearance. These animations are harness additions, not imported Oxygen animation code.

Choose preset `text-template`, then select **Text animation** in preview. Available templates: `masked-lines`, `word-stagger`, `blur-reveal`, `keyword-highlight`, `title-sequence`, `typing`. They use `params.title`, `subtitle`, and `eyebrow`. Explicit line breaks are preserved; complete text is fitted before revealing to prevent reflow. Titles support up to three measured lines at a minimum 44px design font; overflow raises a scene-specific error. Typing reveals whole Unicode graphemes.

`textAnimation` controls `template`, `entryFrames`, `holdFrames`, `exitFrames` and optional single `highlight` word (last title word by default). Example for a five-second 24fps scene:

```json
"textAnimation": { "template": "word-stagger", "entryFrames": 30, "holdFrames": 65, "exitFrames": 24 }
```

Entrance and exit must each be at least one frame; hold may be zero. Their sum must not exceed `durationFrames - 1`. Unspecified hold fills the available duration; an explicitly shorter sequence leaves a text-free tail. Preview entrance/exit edits reduce the hold if necessary to fit. All templates share a gentle fade-out; title, subtitle and eyebrow are fully settled throughout the hold. Keep at least 36–48 hold frames for normal reading and extend the scene for longer copy.

These are standalone title scenes; existing footage-caption choreography remains unchanged. `projects/background-text-review` demonstrates all six templates across three background styles. Preview with `pnpm run preview -- projects/background-text-review`.

## Camera presets

On `recorded-showcase` or `focus-transition`, select **Camera motion** or set `cameraMotion`. Available presets: `focus-zoom`, `detail-pan`, `orbit`, `tilt-settle`, `return-full`. These hide captions and initially present a fullscreen recording. Choosing **Compose shot** opts the scene into a floating screen presentation. Original manual camera/zoom behavior remains available when `cameraMotion` is omitted. Presets and manual `camera`/`zoom` tracks cannot coexist; applying a preset clears the manual tracks in the draft (Revert restores unsaved changes).

```json
"cameraMotion": {
  "preset": "detail-pan", "scale": 1.8,
  "focusX": 0.45, "focusY": 0.58,
  "endFocusX": 0.82, "endFocusY": 0.58,
  "entryFrames": 29, "exitFrames": 29
}
```

Focus coordinates are normalized source positions. Zoom crops clamp to keep source edges covered. Detail pan enters at the first focus, holds, moves during the middle half of the zoomed interval, holds the destination, then returns to fullscreen. Scale stays fixed during the pan. `entryFrames`/`exitFrames` default to 20% of the scene each; the remainder is the zoomed interval. Detail pan and orbit require at least eight middle frames. Smootherstep gives zero acceleration at the endpoints of each movement.

Orbit uses small X/Y rotations and perspective depth; `strength` is 0.1–1.5. Tilt-and-settle begins angled and reaches a flat screen over entryFrames, then stays there. Return-full begins at the chosen crop, holds until the exit interval and pulls out to the exact full view. The latter does not use an entrance movement. The motion presets return to their unzoomed pose; a studio presentation can still keep its chosen static tilt and size. Footage trims, speed segments and freezes remain unchanged.

Review `projects/camera-review` for the five presets, in the order above. No cursor telemetry or automatic focus detection is inferred from ordinary recordings.

### Compose a shot visually

Choose focus-zoom, detail-pan or return-full, then **Compose shot**. The camera studio opens on the rendered floating-screen shot with a scene timeline and bottom camera dock. Click **Select area** or the shot to edit source framing. The recording pauses on the current source frame. Drag an area, click outside the box to recenter it, move the box, or resize a corner. The rectangle keeps the output aspect ratio and stays within the frame; source zoom is limited to 1–4×. The framing inspector appears while editing and uses the same crop calculation as export.

For detail-pan, switch between **From** and **To** in the dock or click their positions on the timeline. Both use the same zoom; resizing either updates the shared zoom and keeps both focus points in bounds. The timeline also scrubs the source frame used for composing. Focus the box or a corner and use arrow keys for small adjustments (Shift for larger steps). **Preview motion** plays the actual animation in the same studio; **Edit framing** returns to the selection. **Screen** scales the whole card independently of source **Zoom**. X/Y/Z rotate the card, **Backdrop** chooses Paper, Slate, or Theme, and **Pace** adjusts entry and exit frames. Playback follows elapsed time even when individual frames take longer to render. **Done** returns to the ordinary preview. Changes remain a draft until **Save**. **Revert** restores the saved scene and closes composition.

Composition sets `cameraMotion.fit` to `cover` and `cameraMotion.presentation` to `studio`. The stage defaults to Paper and 14° X, −9° Y, −3° Z rotation. Recordings with a different aspect ratio lose some edges to fit. Focus coordinates are relative to this fitted frame. Omitted `fit` (or `contain`) preserves the earlier letterboxed presentation. Composition does not change trims, speed, freeze holds or source files.

## Screen scenes (shot model v2)

New screen shots use `"kind": "screen"` in place of a preset. `screen` describes the recording's presentation. `camera.shots` is the camera path, and `at` is a fraction of the scene, so changing `durationFrames` rescales the whole move. Omit `focus`/`zoom` for the full view. Two consecutive shots with the same framing hold it. Each move eases with `ease` (default `smootherstep`). An optional `pose` adds a 3D offset (translate px, rotate degrees, corner radius).

```json
{ "id": "tour", "kind": "screen", "durationFrames": 144,
  "screen": { "asset": "screen", "presentation": "studio", "backdrop": "paper", "fit": "cover", "tilt": [14, -9, -3] },
  "camera": { "shots": [ { "at": 0 }, { "at": 0.2, "focus": [0.25, 0.3], "zoom": 2 }, { "at": 0.45, "focus": [0.75, 0.3], "zoom": 2 }, { "at": 0.8, "focus": [0.75, 0.3], "zoom": 2 }, { "at": 1 } ] } }
```

The schema is `packages/schema/src/scene.js`. Legacy `cameraMotion` scenes still load: `toV2` converts them at render time into equivalent shot lists.

### Framing areas

In the studio, press **F** (or the crosshair next to the timeline) to frame areas on a screen shot. The stage shows the recording flat and unzoomed. Drag to add an area, drag an area to move it (it snaps to the thirds and the centre), drag a corner to resize it, and use arrow keys or Delete when an area is focused. Each area is a camera stop. Adding, removing, reordering, moving and resizing areas preserve the remaining point times, poses and easing. Each contiguous visit has its own identity, including repeated visits to the same coordinates. Reordering swaps framing between existing time slots. Use **Reset pacing** explicitly to replace custom point timing and poses with evenly paced holds and full-view endpoints. Adding needs room after the last area; a path ending at the last frame can be reset first. Each area offers **Hold** with a duration in seconds or **Pass through**, which removes its hold and enables flow. Holds cannot extend beyond the next point; areas containing custom pose animation must be edited as points or explicitly reset. Agents get the same pacing through the `camera_frame_areas` tool. `camera.move` records which ready-made move produced the shots, so the studio can show and re-apply its intensity; editing shots directly clears it.

## Camera quality

**Easing.** `camera.ease` (and per-shot `ease`) also accepts `gentle` (soft sine), `snappy` (quick quartic) and `spring` (a damped spring released from rest: overshoots about 4.4%, settled by the end of the move). A spring overshoot on zoom never uncovers the recording: zoom stays at 1 or more and the pan stays inside the source.

**Flow.** `camera.flow: true` keeps the camera moving through shots it passes on the way. Shots split into runs at holds (identical consecutive shots) and cuts (equal `at`). Inside a run of two or more moves, every channel follows a monotone cubic Hermite curve (Fritsch–Butland tangents). A tangent is zero where a channel reverses or pauses, and at run ends. So the velocity is continuous and the camera never overshoots an area. Holds stay exact. A single move between holds keeps its easing, so paced area paths (arrive, then hold) look the same with or without flow. Easing only shapes those single moves. Flow is visible on paths that move directly from area to area. Use the per-area **Pass through** control to remove a reading hold and enable flow in one edit; leave other areas on Hold where labels need reading time. `camera_frame_areas` also accepts `hold: 0` to pass through (positive hold values are relative travel-time units, default 1.5). Omit `flow` for the original per-segment easing, which is byte-identical to before.

**Drift.** `camera.drift` (0–1) layers a slow orbit over any path. With t = frame/last and env = sin(πt): `rotateY += 6·d·sin(2πt)·env`, `rotateX += 2.5·d·env`, `z −= 120·d·env`. It is exactly zero on the first and last frame, so cuts stay clean.

Agents: `camera_style {id, ease?, flow?, drift?}` changes these without touching the shots. `flow: false` and `drift: 0` remove the key, and legacy recording scenes convert on first use. Studio: Camera tab → **Motion** (Easing, Drift, Flow through areas).

**Motion blur (export only).** `"motionBlur": { "samples": 8, "shutter": 0.5 }` works on any scene. Samples are whole numbers 2–16 (default 8), and shutter is 0.1–1 of a frame (default 0.5). The exporter renders `samples` sub-frames per frame at `frame + ((s + 0.5)/S − 0.5)·shutter`, clamped to the scene. FFmpeg averages each group (input rate fps·S, `tmix` + `select`, output `-r fps`). The clip keeps exactly `durationFrames` frames at the project fps. Preview and `render_frame` stay sharp. Rendering takes about `samples`× longer. Studio: Look tab → **Export quality** exposes Draft/Balanced/High presets (4/8/16 samples), samples and shutter controls. `motionBlur.enabled: false` disables the effect without deleting its quality settings. **Preview 1 second** renders a downscaled silent export sample using the saved scene and source timing; it never replaces final clips or their caches. `render_preview {id, at?, seconds?, width?}` offers the same sample to agents (0.1–3 seconds, width 160–1280, downscale only); output lives in `.runtime/previews/`.

(architecture.md, Shared frame pipeline) Motion blur is export-only: `render.js` captures S sub-frames per output frame (scenes evaluate fractional frames), and `buildVideoArgs({ fps, outputPath, blurSamples })` averages them in FFmpeg. Without `motionBlur` the capture loop and encoder arguments are unchanged.

### Screen presentation

Screen scenes take optional presentation fields. Leave any of them out to use the defaults.

- `padding` (0–0.3, default 0.13) and `offset` ([x, y], each −0.5–0.5): floating (`presentation: "studio"`) screens only. They set the gap to each frame edge and shift the screen by a fraction of the frame (positive = right/down).
- `radius` (0–64 design px): floating default 22; fullscreen follows the camera pose radius.
- `shadow`: `none | soft | deep | floating`. `soft` is the original floating shadow and the floating default.
- `frame`: `none | browser-light | browser-dark | window`. Adds a 40px title bar with three coloured dots. Browser frames show `frameTitle` in an address pill; `window` shows it as a centred title. Below the bar the recording keeps its aspect (`fit: "contain"`) or is cropped to fill (`cover`).
- `lighting`: `{ "style": "spotlight" | "glow" | "floor", "intensity": 0.6 }`. Drawn on the backdrop canvas at the screen's position. Spotlight darkens the edges and lights behind the screen; glow is a halo in the theme accent colour; floor adds a floor gradient, a soft reflection and a contact shadow.

```json
"screen": { "asset": "screen", "presentation": "studio", "backdrop": "paper", "fit": "cover", "padding": 0.1, "offset": [0.05, 0], "radius": 18, "shadow": "deep", "frame": "browser-light", "frameTitle": "app.example.com", "lighting": { "style": "floor", "intensity": 0.7 } }
```

Consistency: `screen_match {id}` copies one shot's look (every screen field except `asset`) to every other screen shot as one undo step. Legacy camera-motion scenes and simple caption-free recordings convert, and inline scenes are supported. Scenes with captions, manual camera/zoom tracks, custom compositions or modules cannot be converted safely and remain untouched with specific reasons. Single-scene screen/camera tools enforce the same conversion guard; use Classic preview for those authored legacy scenes. `screen_match_preview {id, ids?}` returns eligibility without writing, and optional `screen_match {id, ids:[...]}` targets only selected shots. `validate` now also returns `warnings` for adjacent screen shots whose size or frame differ, or padding when both are floating.

Studio: the Screen tab has Framing (padding, position X/Y, Center), Surface (corner radius, shadow, frame picker with an Address or Window title field), Lighting (style, intensity) and **Apply to all shots**, which opens an eligibility/selection dialog before applying one undoable change. Framing mode (F) shows the bare recording without chrome.

Architecture note: when a frame is set, `motion/src/spatial-stage.js` wraps the media canvas (`canvas[data-asset]`) in a `[data-frame]` element that carries the 3D pose, corners and shadow. Chrome is built in code because the render server serves only `packages/*/src`, so there is no `library/frames` yet. Lighting lives in `motion/src/lighting.js` and is called from `renderFrameToCanvas`.
