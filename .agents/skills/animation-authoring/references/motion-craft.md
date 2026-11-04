# Motion that improves a product story

Start with the stable composition. If the still frame has no hierarchy or the important UI is too small, moving it will not repair it.

## Choreograph attention

1. Identify the object that carries the meaning: a control, request, connection, or result.
2. Establish where it is before moving it. Anticipation may be a brief highlight or small preparatory motion; many precise UI actions need no physical bounce.
3. Perform one main action. Let related details follow after the viewer can locate the primary subject.
4. Settle into a readable pose. Background motion becomes subordinate or still.
5. Exit or transform in a way that prepares the next focal point.

| Visual task | Motion decision | Common weak version |
|---|---|---|
| Reveal a heading | Mask a stable text layout, then hold | Every letter flies independently and the message forms late |
| Explain a workflow | Carry an object through meaningful states | Fade between unrelated bullet slides |
| Show a UI result | Move toward it, settle, then mark the result | Orbit continuously while labels change |
| Compare before/after | Preserve framing and change the important state | Change camera, palette, scale, and content at once |
| Transition screens | Match a shared edge, object, or direction | Arbitrary spin or zoom without continuity |
| Add atmosphere | Low-salience depth outside reading areas | Particles compete with copy and controls |

## Timing and spacing

Duration controls how long a move takes; spacing/easing controls how it accelerates. Describe both. A fast entrance followed by a quiet hold can feel more deliberate than constant motion. Distance matters: an ease that works for a 20px label reveal may feel abrupt on a full-screen pan.

Starting ranges for testing, not rules: short label entrance 0.3–0.6s, grouped item offset 0.06–0.12s, screen reframing 0.6–1.2s, simple exit 0.2–0.4s. Use the project's fps. Longer cinematic moves are appropriate when they carry information; no arbitrary maximum overrides the brief. Calculate reading holds separately.

- Ease-out often suits an arriving object; ease-in suits departure; ease-in-out suits a move between two rests.
- Match velocity at a continuous handoff. Easing every intermediate point to zero creates stop-start motion. A genuine reading pose should stop.
- Overshoot communicates elasticity. Keep it selective; an enterprise UI does not need to bounce on every move.
- Stagger by semantic groups, not uniformly across everything. The viewer should understand the order.
- Secondary action supports the main event. Suppress it during dense proof or copy.
- Motion blur may soften fast travel. It must not compromise the settled result, captions, or output-frame timing.

Measure the full reveal budget: for N items at offset d, the last item begins `(N-1)*d` after the first. Its entrance finishes later still. Begin the complete-message hold there, not at the first item's arrival.

## Camera and 3D

Use depth to explain arrangement, relationships, or an intentional reveal. For actual software evidence, return to a front-facing or otherwise readable view. Perspective should not turn labels into texture. Keep a clear foreground/background distinction and enough negative space for copy.

Choose either camera movement or object movement as the main action; combining them needs a clear reason. Match screen plane, crop, scale, and apparent position to the next shot. Do not add 3D just to replace a simple flat slide with a more complicated slide.

## Diagnose “basic” with evidence

- **Slide-like:** replace repetitive entrances with a continuous change or an action/result pair.
- **Mechanical:** vary timing according to weight and information; inspect acceleration and settle rather than selecting a new effect.
- **Busy:** remove a competing movement and compare both versions at equal duration.
- **Floaty:** add clear rest poses, grounded lighting where relevant, and a motivated trajectory.
- **Abrupt:** inspect the velocity and focal point at the cut; extend a useful settle, not empty padding.

Learning: [School of Motion — anticipation](https://schoolofmotion.com/blog/understanding-the-principles-of-anticipation), [Adobe — speed graphs](https://helpx.adobe.com/after-effects/desktop/animate-in-after-effects/speed-between-keyframes/speed.html). These product-motion recipes are local recommendations, to be judged in playback.
