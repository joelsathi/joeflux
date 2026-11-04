---
name: motion-graphics
description: Use when designing or refining kinetic typography, animated diagrams, shape transformations, product reveals, or graphic transitions for silent SaaS explainers and product demos in JoeFlux.
---

# Motion graphics

Design a visual explanation that unfolds over time. Typography, shapes, connections, and camera movement should express the same idea and lead naturally into product evidence.

Use `video-production` for the brief, story, cuts, and review; use `animation-authoring` for deterministic JavaScript and Three.js implementation. This skill supplies graphic design and choreography. Preserve the project's silent output and source assets. Use free, open-source production tools and separately permitted assets.

## Establish the motion treatment

Read the existing brief, brand direction, shot plan, and relevant scenes. Identify the viewer's question, the change to explain, the evidence to show, and the next shot. Ask the highest-value missing question; reuse answers and delegated creative choices. For a new visual direction, propose a small number of distinct treatments with a recommendation, not a menu of effects.

Read [designing the visual system](references/visual-system.md) for style frames, hierarchy, typography, and diagram semantics. Before expensive animation, define a starting frame, a meaningful transformation, and a resolved frame. Name the object that carries attention between them. For a narrow revision, preserve the accepted design system and change only the failing treatment.

## Choose a technique for its meaning

Read the relevant parts of [motion recipes](references/motion-recipes.md):

- Kinetic typography: animate emphasis and phrase structure while keeping the complete message readable.
- Diagram choreography: establish topology, trace one meaningful event, then show the result.
- Shape transformation: preserve object identity and explain what changed.
- Product reveal: prepare a readable screen and settle into authentic UI proof.
- Graphic transition: connect the outgoing object, position, or action to the next shot.

Use [the 15-second worked treatment](references/saas-flow-treatment.md) when a continuous diagram-to-product sequence would help. It is an editable planning example, not a rendered template or a prescribed story.

## Make it executable

Hand off: purpose; exact copy; style tokens; layer order; key poses; frame intervals at actual fps; paths and transform origins; easing/velocity intent; complete-message holds; source asset/time; and outgoing match. Distinguish schematic animation from demonstrated product behavior. Packet speed, counters, graph connections, and success symbols can create claims even without words.

Prefer existing Canvas/SVG for flat graphics; manually sought Anime.js for complex property timing; Three.js when real geometry, occlusion, or lighting earns its cost. Motion Canvas is an alternative authoring workflow, not a drop-in scene module. Consult repository-root `context/video-quality-sources.md`. Use the production skill's template-adaptation reference for AE/Lottie material.

## Review the graphic and its motion

Inspect key poses and normal-speed playback at intended size. Check type-mask edges, stable layout, node/edge meaning, token identity, morph correspondence, occlusion, aliasing, and the handoff to real footage. Confirm reading holds survive late reveals and transitions. Render the smallest difficult interval first and follow project approval before assembly. Record which checks actually ran; a treatment or contact sheet is not a verified finished video.
