# Cuts, pacing, and continuity

## Write a shot contract

Before animating a new sequence, give each shot: duration in seconds and frames; viewer question; visible action/result; source asset and in/out seconds; exact copy; focal region; entrance, readable hold, exit; outgoing cut type and reason; matching incoming state. Use half-open frame ranges `[start,end)` when planning, then translate to the actual scene schema. Planning fields are not new renderer fields.

## Choose a cut for its job

| Device | Use when | Check at the boundary |
|---|---|---|
| Hard cut | A new action, new evidence, or a completed thought | The next focal point is immediately findable; no accidental blank frame |
| Cut on action | One visible action carries between two framings | Match direction, action phase, and source time; do not repeat or skip the important action |
| Match cut | A shape, location, or meaning connects two ideas | Match screen position and scale; make the conceptual link understandable |
| Punch in / cut to detail | A UI control or result is too small | Preserve orientation and enough context to identify the detail |
| Motivated wipe / object handoff | A moving object can reveal the next state | Carry its trajectory across the boundary; use one coherent movement |
| Dissolve | A softer change or passage of time is useful | Avoid overlapping readable text and double UI states |
| Jump cut | Unimportant waiting or repetition must disappear | The viewer still understands what changed and why |

Use hard cuts as a starting point. Motion transitions earn their place when they convey a relationship. Do not add a different effect at every boundary. J/L cuts are audio-overlap techniques and do not apply to this silent harness; visual continuity is handled through action, composition, and eye position.

## Design the viewer's attention

Mark the focal point on the outgoing last useful frame and incoming first useful frame. Keep those points close for a fast continuation. A deliberate move across the screen needs time or a visible cue. Preserve direction, apparent scale, screen chrome, and background unless their change communicates a new beat.

Vary shot purpose and scale: context → detail → consequence. Repeated title-card arrival/hold/departure makes a video feel like slides even with elaborate easing. Replace at least one unnecessary title with an actual product action, an annotated detail, or a continuous transformation. Do not obscure product evidence with decorative transitions.

## Budget reading and action time

Compute available settled time, not just scene duration. Exclude letter reveals, camera travel that impairs reading, and exits. If a stagger finishes late, reading starts after the final essential word settles. Account for simultaneous UI labels and new technical concepts.

A starting estimate for short English demo copy is **words ÷ 3 + 0.5 seconds** of settled reading time. This is a local planning heuristic, not a universal reading standard or automatic acceptance rule. Extend it for unfamiliar terms, localization, dense UI, or actual observed difficulty. Validate at the intended viewing size without pausing. Shorten copy or split the beat before shrinking it.

Example: 28 words need about 9.8 seconds by this estimate. A 12-second scene with a 2-second arrival and 1-second exit has only 9 seconds available, before UI interpretation. Simplify to one claim, allow more time, or split claim and evidence. The old 36-frame minimum is only a floor for very short copy, not approval for 28 words.

Convert seconds to frames using the project's actual fps. At 24 fps, 0.5 seconds is 12 frames; the same duration is 15 frames at 30 fps. Review cadence by alternating useful action and stillness; cutting every fixed number of seconds is not a story strategy.

For overlapping transitions, total output duration is normally `sum(shot frames) - sum(overlap frames)`; confirm the actual assembly semantics. A dedicated transition scene adds duration instead. Reserve handles and reading time on both sides; do not count an overlap twice or hide the payoff inside it.

## Review the cut in motion

Render an interval spanning at least the outgoing hold, transition, and incoming settle. Play at normal speed; then inspect last/first and midpoint frames. Check source-time continuity, screen-edge alignment, flashes, ghost text, focus jumps, and exposure changes. A single selected-scene preview cannot prove an assembled transition works.

Learning: [Frame.io — editing and eye trace](https://blog.frame.io/2022/10/03/7-simple-video-editing-tricks/), [Adobe — match cuts](https://www.adobe.com/in/creativecloud/video/discover/match-cut.html), [Adobe — J/L cuts](https://helpx.adobe.com/in/premiere/desktop/edit-projects/trim-clips/perform-j-cuts-and-l-cuts.html).
