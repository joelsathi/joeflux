# Adapting After Effects references with open-source tools

Treat a template as a design to analyze and an asset with its own permission record. Free download, source visibility, and an open-source player are three different things.

## Choose the route from the supplied material

| Available material | Route | Limitation |
|---|---|---|
| Licensed Lottie JSON plus its images/fonts | Test with lottie-web, using a fixed frame seek | Check the renderer's support table; expressions, effects, masks, and 3D may differ |
| Licensed prerendered clip or image sequence | Import as media after checking alpha, fps, color, and resolution | Baked pixels are not editable layers; text replacements require source or reconstruction |
| AEP/AET/MOGRT source only | Request an already-produced compatible export, or build an original equivalent | These are not native harness/Three.js scene formats; do not claim automatic conversion |
| Preview/reference only, or uncertain asset rights | Describe high-level motion and composition; create original art and code | Do not extract protected graphics, logos, footage, fonts, or sell a copied template |

Adobe's MOGRT workflow is designed around After Effects and Premiere. Bodymovin can export supported AE content, but performing that export requires After Effects; it is not an open-source-only authoring step. Under the user's open-source-only constraint, prefer supplied compatible exports or original reconstruction. If the user later explicitly chooses an Adobe workflow, explain that this changes the tooling constraint.

## Break down the reference

Record 3–6 useful timecodes: before movement, anticipation, peak speed, reveal, settled pose, and exit. Describe:

- Layer order and focal hierarchy; which parts are essential to the idea.
- Geometry, masks, transform origins, camera versus object movement, and apparent depth.
- Timing proportions, stagger offsets, acceleration/deceleration, and pauses.
- Typography, line breaks, contrast, and the period when the message is fully readable.
- How the ending prepares the next shot.

Translate into a small motion specification with replaceable copy/assets/colors, timing controls, and deterministic frame evaluation. Rebuild the most difficult 2–4 seconds first. Compare the intended hierarchy and motion, not only a thumbnail. State any visual compromise.

| AE concept | Open-source implementation approach |
|---|---|
| Position/scale/opacity keyframes | Pure frame functions or a manually sought Anime.js timeline |
| Shape reveal / track matte | Canvas clipping, SVG mask, or a tested PixiJS mask |
| Text animator | Measured final layout plus masked lines or staggered word groups |
| Parent/null | Shared transform group with explicit transform origin |
| Real camera, lights, 3D geometry | Three.js scene evaluated at an absolute timestamp |
| Glow/blur/particles | Targeted shader/filter or seeded particles; benchmark and preserve legibility |
| Complex unsupported effect | Original simpler treatment or licensed prerender supplied by the user |

Lottie is a compatibility route, not a promise of full AE fidelity. Test actual supplied files on the chosen renderer at start, middle, end, and around masks/text/effects. Use `goToAndStop(frame, true)` after loading; align local frames with the animation's frame rate and in/out range. Never let autoplay race the capture clock.

Record provenance for each reused item: source URL/path, author, version or hash, license/permission, permitted modifications/distribution, bundled assets, attribution destination, and changes. Unknown permission blocks reuse of that item, not original work on the rest of the video. Software license verification does not grant rights to example animations or marketplace assets.

Sources: [Adobe MOGRT workflow](https://www.adobe.com/learn/after-effects/web/create-motion-graphics), [lottie-web usage](https://github.com/airbnb/lottie-web), [renderer feature matrix](https://github.com/airbnb/lottie-web/wiki/Features). Read repository-root `context/video-quality-sources.md` for tool licenses.
