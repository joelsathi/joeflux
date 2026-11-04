---
name: three-video
description: Use when authoring Three.js or React Three Fiber video scenes in JoeFlux, including object reveals, materials, lighting, camera choreography and deterministic 3D exports.
---

Read the project's WORKING_STATE.md and context/workflows.md. For the shared plugin contract and MIT-only dependency policy, use the `animation-plugins` skill and its adapter-authoring reference. Start with plugin-threejs or plugin-react-three through template_apply; the independent examples are projects/animation-plugin-gallery.

## Select an adapter

Use createThreeScene({setup, update, overlay}) for imperative Three.js. setup receives THREE, renderer and the normal scene context; return {scene,camera,...yourObjects,dispose?}. update(world,seconds,frame,context) must set every animated transform from absolute time. overlay(frame,context) optionally draws titles on the resulting 2D frame. Dispose custom render targets, controls or non-scene resources through world.dispose.

Use createReactThreeScene({component,overlay}) for declarative geometry. The component receives {frame,seconds,canvas,context,output,project,scene}. Use the React export from /animation-plugins/runtime.js with React.createElement or compile JSX against it. Do not bundle a second React. The adapter sets frameloop:'never', waits for a layout-effect commit and explicitly advances the requested timestamp. Preload models/textures before returning the factory; do not let unresolved Suspense commit an empty frame. Do not use elapsed-time accumulation in useFrame.

For custom scenes export renderFrame(frame,context) and return context.renderPlugin(factory). This supplies a private buffer and cleanup. Do not allocate a new renderer for every frame or call getContext('webgl') on the harness's existing 2D canvas.

## Make the 3D serve the shot

Define the silhouette, focal object, camera lens, foreground/background separation and final readable pose. Choose a camera distance that fits both the initial and final pose, with room for titles. Three.js rotations are radians. Keep product evidence legible; a camera orbit is useful only when the changed angle communicates something.

Use a broad key, weaker fill and restrained rim. Tune material roughness and metalness together with the light, not as isolated sliders. The adapter uses explicit output dimensions, sRGB and ACES filmic tone mapping. Use original procedural geometry first. Loading a model, HDRI or texture requires independent provenance and license review under the user's MIT-only additions policy; Drei is a candidate helper, not preinstalled and not permission to download its environment presets.

Use pluginOptions.quality:1 while iterating and 2 for supersampling demanding edges. A 2x buffer has four times as many pixels. Keep meshes/light counts bounded and verify WebGL support on the target renderer. GPU differences can affect pixels between machines; deterministic tests establish repeatability in the tested runtime, not universal bit identity.

## Verify before delivery

Compare frame 0 → middle → end → middle, including fractional frames used by motion blur. Verify that two canvases do not share mutable scene state. Check scale/crop at the target aspect ratio. Render a short interval at target resolution/fps; inspect edges, clipping, specular highlights, color, typography, settled holds and the incoming/outgoing cut. Test plugin-to-preset switching and disposal. Prove the MP4 has the expected frame count and no audio. A contact sheet is a composition check; normal-speed playback is still needed for movement quality.
