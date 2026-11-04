# Design the visual system before animating it

## Translate taste into decisions

Turn a reference into observable choices: generous or dense spacing, flat or dimensional forms, restrained or elastic motion, sharp or soft edges, quiet or energetic cadence. Ask which moment matters. A request for “premium” needs a concrete interpretation, such as precise alignment, limited materials, controlled highlights, and confident holds.

Useful product-video directions include an **editorial diagram** (clear type and relationships), a **spatial product stage** (controlled depth around real UI), or a **graphic transformation** (one object changes state through the explanation). Recommend one from the communication task; combine them only with a planned transition. The user should choose a feeling or purpose, not have to supply implementation terminology.

## Style-frame contract

For a new direction, design representative start, transformation, and resolved compositions. These can be simple vector/canvas frames; illustrative raster art is optional. Check:

| Decision | Specify | Why it matters in motion |
|---|---|---|
| Frame and grid | Target aspect, alignment lines, margins, layout anchors | Stable anchors prevent arbitrary drifting between beats |
| Hierarchy | Primary object, message, supporting labels, atmosphere | Only one event should demand first attention |
| Type | Licensed family, roles, weights, exact lines and spacing | Measure final layout before revealing it |
| Shape language | Node/card silhouettes, corner rules, stroke weights | Repeated forms make identity trackable |
| Color meaning | Background, neutral structure, focal accent, true status | An accent should have a job; green/checkmarks can imply success |
| Connector grammar | Direction, arrowheads, grouping boundaries, branches | A pretty connector is still a claim about a relationship |
| Depth/material | Layer order, shadow, perspective, highlight behavior | Occlusion and lighting should clarify organization |
| Motion grammar | Entrance role, travel curve, stagger group, rest pose | Similar objects should feel part of one system |

Use the established brand tokens where present. Test type and fine lines against actual moving footage, not just an empty background. Recompose other aspect ratios instead of blindly cropping the main subject or shrinking all labels. Inspect at intended viewing size; a readable 1920px screenshot may fail in a small embedded player.

## Typography as design

Write and fit the final phrase first. Break lines by meaning; keep labels near the objects they identify. Prefer a coherent type family and a few clearly distinct roles. Place text where its entrance and settled form both have room.

Choose the animation unit deliberately: line for a coherent statement, word for a contrast or emphasis, character for a meaningful construction such as typing a command. Preserve shaped glyphs and grapheme clusters; individual-character splits can break scripts, ligatures, or emoji. Lock final line breaks and measure loaded fonts before capture. A key word can remain as an anchor while the surrounding graphic changes.

A mask should reveal the intended letters without clipping ascenders, descenders, or shadows in the settled pose. Check both stroke width and edge contrast during scaling. Text should not need a glow to be distinguishable from the background.

Learning: [School of Motion — typography decisions](https://schoolofmotion.com/blog/tiny-typography-decisions-motion-graphics), [contrast and type](https://schoolofmotion.com/blog/4-simple-tips-to-design-with-contrast-and-type). The project-specific contracts above are original synthesis.

## Graphic semantics and truthfulness

- If a diagram is conceptual, identify it as illustrative and use only confirmed relationships. An illustrative label does not excuse false capabilities.
- Preserve the distinction between **grouping** requests and **merging** them. Enclosing several tokens in one boundary groups them; collapsing them into a single token may imply deduplication or data loss.
- Encode send/receive direction explicitly. If a line only means association, avoid a moving packet that implies execution.
- Packet frequency and transit duration can imply throughput and latency. Use a representative event without quantitative claims unless measurements support them.
- A lock, checkmark, or green state can imply security or success. Use it only for a supported claim; a neutral structural gateway can explain a boundary without asserting that every request passes.
- When a schematic becomes a product screen, make the representational change visible. Do not morph invented labels into a fake UI and present it as captured evidence.

During review, ask what someone could infer from the visuals with the captions hidden. Correct unintended claims as carefully as inaccurate copy.
