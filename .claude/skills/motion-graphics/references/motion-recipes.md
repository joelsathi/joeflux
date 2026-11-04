# Motion-graphics recipes

These are design patterns to adapt to the brief. Durations are test starting points, not standards. Use `animation-authoring` for implementation and `video-production` for settled reading time and boundary review.

## 1. Kinetic typography with a persistent anchor

**Use:** a short contrast, a chapter idea, or a claim that guides the following visual.

Compose the complete phrase. Reveal it by line or semantic word group over roughly 0.3–0.6s; let one key word remain in a stable location. Change the surrounding graphic while that word anchors the eye, then move or replace it only when the viewer's question changes. Emphasis can be weight, a controlled color change, or an underline; it does not always need a scale pulse.

For N staggered items, the last arrival completes at `first start + (N−1) × stagger + entrance duration`. Ten words with a 0.1s stagger and 0.5s entrance take 1.4s to finish. A three-second scene leaves at most 1.6s to read the complete phrase. Shorten or regroup the text, or extend the shot; faster effects do not create more settled time.

**Implementation:** fixed text layout with Canvas clipping/SVG masks; animate mask/offset state through absolute frame functions or manually sought Anime.js. Avoid layout reflow as words become visible. Do not shrink the entire message to preserve a preferred animation.

**Review:** final word arrival, mask edges, baseline stability, reading order, complete-message hold, and exit overlap.

## 2. Node diagram with one traced event

**Use:** a workflow, a request path, a dependency, or a before/after relationship that is difficult to see in a screen recording.

Lay out the topology before adding motion. Place stages in a consistent direction, label actual roles, and minimize line crossings. Establish nodes, then connectors, then a representative token. Reveal edges in the explanation's order; use arrowheads or other directional cues only when direction is real.

Keep the focal token recognizable by shape and accent through its path. Distinguish a processing pause from uninterrupted travel. Let a genuinely important decision node hold; do not ease to zero at every invisible waypoint. Reveal the result only after the causal event. Use grouping boundaries when several items remain distinct. Split tokens only if the explained process actually branches.

**Implementation:** vector paths and path-length reveals, plus a token evaluated at a distance along the path. Linear interpolation of a Bézier parameter does not guarantee constant screen-space speed; use an arc-length lookup when consistent travel speed matters. Use smooth direction/velocity across connected segments. Motion Canvas is suitable for separately authored diagrams; Canvas/SVG is usually enough in this harness.

**Review:** trace one token without pausing. Check connector direction, labels, crossings, pauses, endpoint alignment, and whether speed/count/status implies unsupported claims.

## 3. Continuous shape transformation

**Use:** state change, reorganization, or a meaningful relationship between the outgoing and incoming composition.

Name what persists: identity, center, color, outline, or content. Preserve at least the properties needed to track the object. Change one important relationship at a time. A card can expand into a viewport; a set of objects can move into a group. Turning many records into one record can imply merging and needs a real semantic reason.

Plan start, midpoint, and destination silhouettes. If vector point correspondence is poor, use a controlled mask, shared edge, or shape-match cut instead of a twisting morph. Preserve path winding and pair compatible point structures for an actual path morph. If the scene changes representation, signal the change rather than implying two unlike things are identical.

**Implementation:** transforms and clips before complex vertex morphing. Keep transform origins explicit. Author one global transition progress so outgoing and incoming edges cannot drift apart through separate clocks.

**Review:** recognizable identity, self-intersections, silhouette at midpoint, occlusion, scale continuity, and the final match into the next shot.

## 4. Product reveal that lands on proof

**Use:** move from a concept or benefit into a real product action/result.

Choose the exact source frame first. Plan the final readable crop and camera pose, then work backward. Introduce a frame edge or silhouette, establish the screen, and expand/reframe into the evidence. Keep perspective modest enough to understand what is appearing; settle front-facing when UI labels matter. Finish the camera move before the promised proof hold begins.

A light sweep can identify an edge or material, but should end before the UI demands reading. Ground a floating screen with restrained lighting/shadow when appropriate. Match screen chrome, scale, and crop to adjacent footage. Reserve actual proof time instead of spending the whole shot on the reveal.

**Implementation:** existing screen/perspective presets for a flat recording. Three.js only when real geometry, light interaction, or occlusion is necessary; use a separate render canvas and test the adapter. Animate using the harness frame clock. Do not rebuild the actual product UI as invented graphic art when captured evidence is needed.

**Review:** edge aliasing, perspective readability, font/detail resolution, reflection/glare interference, source-time continuity, final pose, and uninterrupted proof duration.

## 5. Object-led transition and matched cut

**Use:** two neighboring shots share an object, shape, or action that can guide attention.

Mark the outgoing focal position, direction, speed, and scale. Choose a shared edge or object to carry into the incoming composition. A mask/wipe should uncover the next idea from that movement. If an animated connection adds no meaning, use a matched hard cut.

For a continuous move, match position and velocity at the seam. For a reading boundary, match the settled pose and leave enough time to orient. Decide whether the transition is an overlap or a dedicated scene; calculate duration accordingly. Keep the last outgoing source state and first incoming state explicit.

**Implementation:** one shared progress curve for coupled elements. For screen handoffs, use the documented outgoing/incoming source times in `context/animation-guide.md`. Render the assembled boundary; individual shot previews cannot establish the composite behavior.

**Review:** no flash, duplicate text, discontinuous screen edge, exposure jump, accidental camera reset, or hidden result. Inspect the normal-speed interval and exact frames on both sides.

Technical background: [Adobe — shape paths and masks](https://helpx.adobe.com/uk/after-effects/desktop/animate-in-after-effects/animate-shape-paths-and-masks/animating-shape-paths-masks.html). Techniques above are expressed for the open-source pipeline; this reference does not require Adobe software.
