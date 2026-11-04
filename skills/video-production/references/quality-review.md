# Quality review: evidence before polish claims

Review the smallest affected shot and both neighboring boundaries first. Then watch the assembled sequence at normal speed and intended viewing size. Contact sheets help composition review; they cannot establish pacing or smoothness. If the available tools cannot play video for inspection, record that gap and request human playback review rather than claiming it occurred.

## Review passes

1. **Comprehension:** Can a first-time viewer state the problem, action, result, and next step? Does each claim have visible evidence? Remove shots that repeat a claim without adding understanding.
2. **Editing:** Does each cut happen after the useful information lands? Check eye position, action continuity, source timestamps, overlap duration, repeated frames, and last/first-frame flashes. Play transitions with neighboring context.
3. **Motion:** Check arrival, peak movement, settle, and departure. Look for uniform easing everywhere, unnecessary bounces, velocity discontinuities, floating UI during reading, and competing secondary animation.
4. **Design:** At intended size, inspect hierarchy, readable copy/UI, line wrapping, contrast, frame-edge clearance, brand consistency, and cropping. Hold design frames long enough to judge them; do not use motion blur to hide weak composition.
5. **Delivery:** Confirm dimensions, fps, expected frame count/duration, decodable output, complete assets/fonts, and no audio stream. Verify aspect-ratio variants separately. Keep edit sources and provenance with the deliverable.

## Record findings, not adjectives

Use `timecode/frames | observed problem | viewer consequence | proposed change | retest evidence`.

Example: `00:08.4–00:09.1 | new label enters while camera pans away | viewer misses the result | settle the camera before revealing label; add a reading hold | replay updated 7–11s interval`.

Score each dimension 0–3: story/proof, cut continuity, pacing/readability, motion, composition, and delivery. **0** = absent/broken, **1** = distracting/unclear, **2** = clear with minor refinements, **3** = intentional and polished. This is a local review rubric, not a measured industry standard. Uninspected dimensions are **unverified**, not zero or a pass. Do not average away unreadable proof, incorrect claims, missing assets, broken cuts, or failed output checks.

Fix comprehension and pacing before adding effects. Choose the most consequential findings, revise a short interval, and recheck it. Compare alternatives at equal duration, copy, and display size so “more movement” cannot masquerade as improvement.

Use status labels explicitly:

- **Technical checks passed:** validation/probing succeeded; says nothing by itself about artistic quality.
- **Visual review complete:** identify inspected frames and playback intervals and remaining findings.
- **Review draft:** an artifact exists but named checks or user decisions remain open.
- **Approved for assembly/delivery:** record the actual user approval or standing authorization required by the project.

Finish by reporting the artifact path, what changed, what was inspected, and any remaining limitation. Do not claim all-new videos will be good merely because the instructions are stronger.
