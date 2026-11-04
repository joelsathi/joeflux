# Worked treatment: requests into a governed flow

Illustrative planning example, not an implemented preset or a tested render. Use only when the actual product and audience support this story. No measured speed or throughput is implied. Real result footage remains required.

**Brief:** a 15-second silent SaaS insert for IT administrators. 1920×1080, 30fps, 450 frames. Preserve the final four seconds for real product proof. Frame intervals below are half-open; there are no overlapping transitions in this example.

**Visual idea:** keep one request identifiable as the surrounding composition organizes into a route. The destination's shape then becomes a viewport containing authentic footage. Motion connects the ideas instead of clearing the screen between slides.

**Design:** reuse approved brand colors/fonts. One focal accent, neutral structure, quiet background. Distinguish a governance boundary from a success indicator. Use a short “Illustrative flow” label while the diagram is visible; verify the described capabilities even with that label. Copy must be accurate for the real product.

| Frames / seconds | Action and pose | Copy and readable time | Connection |
|---|---|---|---|
| `[0,60)` / 0–2 | Several request tokens already exist in a composed loose arrangement. Reveal a two-word heading during frames 0–18, then rest. | “Scattered requests,” complete for about 1.4s; generic tokens avoid competing tiny labels. | One token owns the accent and remains identifiable. |
| `[60,150)` / 2–5 | Arrange tokens into a left-to-right route. Establish source, governance boundary, and destination. Complete the main reorganization by frame 120. | Heading exits as motion begins. Brief role labels are part of the settled diagram. | Keep individual requests distinct; group rather than silently merge. |
| `[150,240)` / 5–8 | Follow one representative request toward the boundary, pause to orient, then continue along a verified conceptual relationship. | Reveal “One governed flow” by frame 168; hold it through frame 240. This is a schematic sequence, not measured processing time. | Destination remains in the same screen location, preparing the reveal. |
| `[240,330)` / 8–11 | Destination expands into a viewport of a verified result frame. Clear diagram/type, expand to the final crop, and settle by frame 324. | No new headline competing with the product. The shift from schematic to real footage is apparent. | Final six frames retain the clean pose before proof time starts. |
| `[330,450)` / 11–15 | Four uninterrupted seconds of a stable, readable real result. | Let the UI carry the evidence. Any annotation must fit this viewing time and avoid obscuring the result. | Match crop, screen pose, and exact source state into the next shot. |

## Handoff and implementation

Record the actual footage ID, proof timestamp, crop, and next shot's source in-point before authoring. If the result only makes sense after an action, ensure that action appears earlier in the video; a still result cannot establish causality by itself. If no proof is supplied, a labeled placeholder is allowed in the planning animatic, not in a finished proof shot.

Use Canvas/SVG and pure frame functions for tokens, connectors, masks, and typography. Use the existing screen-stage contract for footage. Three.js is optional only if a defined 3D effect earns its integration cost. The treatment introduces no new scene-schema fields.

Design key frames at 18, 120, 180, 270, 330, and 449. Prove the transition interval `[240,345)` in a short render first. Review token identity and the diagram's meaning, then compare the final product pose with the next shot's initial pose. If the final proof is frozen, the next shot begins from that same source timestamp before advancing.

That test interval lasts 3.5 seconds. The current `render_preview` tool caps samples at 3 seconds; use a scene render or overlapping preview samples rather than passing 3.5 seconds to that tool.

Review the full 15 seconds at normal speed and intended viewing size. Confirm all 120 proof frames remain free of camera travel or competing text reveals, and probe actual frame count, fps, dimensions, and silence. A complete treatment is not evidence that these checks passed.
