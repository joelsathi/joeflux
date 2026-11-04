# Video quality: curated skills and documentation

Priority: product demos and SaaS explainers, with stronger cuts, pacing, and animation. Links below are learning sources and tool candidates; inclusion does not mean a dependency is installed or an integration has been tested. Local production recipes are synthesis, not copied course material or universal industry standards.

## Start here: craft

| Resource | What to study | Apply it here |
|---|---|---|
| [Pixar in a Box: storytelling](https://www.khanacademy.org/computing/pixar/storytelling) | Story structure and visual language | Build a causal progression around an audience problem |
| [Adobe: storyboarding](https://www.adobe.com/creativecloud/video/discover/storyboarding.html) | Plan images and shot order before production | Draft a storyboard and timed rough cut |
| [Frame.io: seven editing techniques](https://blog.frame.io/2022/10/03/7-simple-video-editing-tricks/) | Eye trace and practical continuity | Compare the viewer's focal point across each cut |
| [Frame.io: editing corporate material](https://blog.frame.io/2018/12/03/remain-sane-cutting-mundane/) | Find tension and a central proposition | Replace a feature list with one useful workflow |
| [Adobe: match cuts](https://www.adobe.com/in/creativecloud/video/discover/match-cut.html) | Connect shots through a visual relationship | Carry a shape, position, or action into the next shot |
| [School of Motion: anticipation](https://schoolofmotion.com/blog/understanding-the-principles-of-anticipation) | Prepare attention before movement | Add anticipation only where it improves communication |
| [Adobe: speed and Graph Editor](https://helpx.adobe.com/after-effects/desktop/animate-in-after-effects/speed-between-keyframes/speed.html) | Value versus velocity, interpolation, influence | Specify acceleration, arrival, and settle rather than “smooth” |
| [Adobe: Motion Graphics templates](https://www.adobe.com/learn/after-effects/web/create-motion-graphics) | Editable properties and template structure | Analyze which parts should become reusable parameters |
| [School of Motion: typography decisions](https://schoolofmotion.com/blog/tiny-typography-decisions-motion-graphics) | Typographic hierarchy and readable compositions | Design the complete phrase before choosing its reveal |
| [School of Motion: contrast and type](https://schoolofmotion.com/blog/4-simple-tips-to-design-with-contrast-and-type) | Use contrast to organize attention | Reserve a clear focal accent and distinguish text roles |
| [Adobe: shape paths and masks](https://helpx.adobe.com/uk/after-effects/desktop/animate-in-after-effects/animate-shape-paths-and-masks/animating-shape-paths-masks.html) | Path correspondence and shape animation concepts | Plan morphs and masks before rebuilding them in JavaScript |

These publicly readable lessons do not require adopting Adobe software. Linked paid courses or example assets are not included or presumed free to redistribute. Audio-based J/L cuts are documented by [Adobe](https://helpx.adobe.com/in/premiere/desktop/edit-projects/trim-clips/perform-j-cuts-and-l-cuts.html), but excluded from this silent workflow.

## External skills worth knowing

[VideoZero/skills](https://github.com/VideoZero/skills) provides three relevant candidates under its [Apache-2.0 license](https://raw.githubusercontent.com/VideoZero/skills/main/LICENSE):

| Skill inspected | Assessment for this project |
|---|---|
| [animation-basics](https://github.com/VideoZero/skills/blob/main/animation-basics/SKILL.md) | Useful principles and timing vocabulary. Treat its duration limits and opacity recommendations as stylistic guidance; product reading time must follow content. |
| [motion-canvas](https://github.com/VideoZero/skills/blob/main/motion-canvas/SKILL.md) | Useful framework-specific reference for signals, scene hierarchy, and generators. Its generator API is not the harness's `renderFrame` contract. |
| [motion-canvas-agent](https://github.com/VideoZero/skills/blob/main/motion-canvas-agent/SKILL.md) | Specific editor-control integration. Do not assume its HTTP endpoints exist in this harness or install it as a general video-directing skill. |

Decision: strengthen our existing production and animation skills with original guidance, and retain these as optional references for a Motion Canvas project. No third-party skill code was vendored or executed in this upgrade. Before future installation, inspect the chosen revision, references, scripts, endpoint assumptions, license and notices; pin the reviewed revision. The README's installation command is not itself a compatibility or quality test.

## Free, open-source tooling shortlist

License observations refer to the linked repositories as reviewed on the date above. Pin the actual package version and preserve required notices before use. Assets, models, fonts, plugins, and hosted services have separate terms.

| Tool | License source | Best use and boundary | Primary documentation |
|---|---|---|---|
| Three.js | [MIT](https://github.com/mrdoob/three.js/blob/dev/LICENSE) | Real geometry, occlusion, lights and camera depth; unnecessary for many flat UI shots | [AnimationMixer](https://threejs.org/docs/pages/AnimationMixer.html), [manual rendering](https://threejs.org/manual/pages/rendering-on-demand.html) |
| Anime.js | [MIT](https://github.com/juliangarnier/anime/blob/master/LICENSE.md) | Seekable 2D/property choreography; requires deliberate capture integration | [Timeline seek](https://animejs.com/documentation/timeline/timeline-methods/seek/) |
| Motion Canvas | [MIT](https://raw.githubusercontent.com/motion-canvas/motion-canvas/main/LICENSE) | Diagrams and explanatory animation; separate generator-based authoring/rendering workflow | [Animation flow](https://motioncanvas.io/docs/flow/) |
| PixiJS | [MIT](https://raw.githubusercontent.com/pixijs/pixijs/dev/LICENSE) | Larger 2D sprite, mask and filter workloads | [Render loop](https://pixijs.com/8.x/guides/concepts/render-loop) |
| Theatre.js | [Apache-2.0 and bundled notices](https://raw.githubusercontent.com/theatre-js/theatre/main/LICENSE) | Optional visual keyframe authoring; still needs a renderer and export integration | [Core API](https://www.theatrejs.com/docs/latest/api/core) |
| lottie-web | [MIT](https://raw.githubusercontent.com/airbnb/lottie-web/master/LICENSE.md) | Playback of compatible supplied Lottie exports, not native AEP conversion | [Usage](https://github.com/airbnb/lottie-web), [feature matrix](https://github.com/airbnb/lottie-web/wiki/Features) |
| FFmpeg | [LGPL/GPL depending on build](https://ffmpeg.org/legal.html) | Encoding, probing, and assembly; record the actual distributed build and its licenses | [Filters](https://ffmpeg.org/ffmpeg-filters.html) |

Default: preserve the current deterministic Canvas/SVG/CSS and FFmpeg pipeline. Add a library only when a specific shot needs it, and prove capture/seek behavior in a small sample. This document is a selection guide, not a claim that all these libraries are integrated.

## Excluded from the strict open-source default

- **GSAP:** its [standard no-charge license](https://gsap.com/community/standard-license/) contains use restrictions, including certain competing visual animation builders. Free commercial use is not the same as an unrestricted open-source license. Choose Anime.js or pure functions for this requirement.
- **Remotion:** its [custom license](https://raw.githubusercontent.com/remotion-dev/remotion/main/LICENSE.md) has eligibility and use restrictions. Do not describe it as universally free open-source tooling or choose it by default for this request.
- **After Effects and DaVinci Resolve:** not part of the requested open-source production path. Existing Resolve integration remains a separate explicit workflow; no setup is needed for this upgrade.

## Where the guidance lives

Canonical instructions are `skills/video-production/SKILL.md`, `skills/motion-graphics/SKILL.md`, and `skills/animation-authoring/SKILL.md`. Read their linked references only as needed. The dedicated motion-graphics skill includes visual-system guidance, five motion recipes, and a 15-second SaaS treatment. `skills/video-production/assets/production-worksheet.md` supplies a reusable brief, shot plan, and review record. Run `pnpm run skills:sync` after canonical edits to update the project copies used by Codex and Claude, and `pnpm run skills:check` (also part of `pnpm test`) to confirm they match before claiming deployment. Existing packaged desktop builds need their normal rebuild to include updated resources.
