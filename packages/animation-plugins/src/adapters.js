import { createTimeline } from 'animejs';
import * as THREE from 'three';
import React, { useLayoutEffect } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import { interpolate, cubicBezier } from 'motion';
export { THREE, React, createTimeline, interpolate, cubicBezier };

export function frameTime(frame, output) {
  if (!Number.isFinite(frame) || !Number.isFinite(output.fps) || output.fps <= 0) throw new Error('Plugins need a finite frame and positive fps.');
  return Math.max(0, frame) / output.fps;
}
// Each instance belongs to ONE canvas/scene. No wall-clock animation is started.
export function createAnimeScene({ build, draw }) {
  return async context => {
    const timeline = createTimeline({ autoplay: false });
    const state = await build(timeline, context);
    return { render(frame) { timeline.seek(frameTime(frame, context.output) * 1000, true); return draw(state, frame, context); }, dispose() { timeline.revert(); } };
  };
}
export function createMotionScene({ draw }) {
  return async context => ({ render: frame => draw({ seconds: frameTime(frame, context.output), interpolate, cubicBezier }, frame, context), dispose() {} });
}
function makeRenderer(context) {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(context.scene.pluginOptions?.quality ?? 1);
  renderer.setSize(context.output.width, context.output.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  return renderer;
}
function composite(renderer, { canvas, context: ctx, output }) {
  if (renderer.getContext().isContextLost()) throw new Error('WebGL context lost; reload the preview or retry export.');
  if (canvas.width !== output.width) canvas.width = output.width;
  if (canvas.height !== output.height) canvas.height = output.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(renderer.domElement, 0, 0, output.width, output.height);
}
function disposeScene(scene) {
  const disposed = new Set();
  const dispose = item => { if (item && !disposed.has(item)) { disposed.add(item); item.dispose?.(); } };
  scene.traverse(object => {
    dispose(object.geometry);
    for (const material of [object.material].flat().filter(Boolean)) {
      for (const value of Object.values(material)) if (value?.isTexture) dispose(value);
      dispose(material);
    }
  });
}
export function createThreeScene({ setup, update, overlay }) {
  return async context => {
    const renderer = makeRenderer(context);
    let world;
    try { world = await setup({ ...context, THREE, renderer }); }
    catch (error) { renderer.dispose(); renderer.forceContextLoss(); throw error; }
    return {
      async render(frame) {
        await update(world, frameTime(frame, context.output), frame, context);
        renderer.render(world.scene, world.camera);
        composite(renderer, context);
        await overlay?.(frame, context);
      },
      dispose() { world.dispose?.(); disposeScene(world.scene); renderer.dispose(); renderer.forceContextLoss(); },
    };
  };
}
// Commit acknowledgement prevents capture of the previous React frame.
function Commit({ children, ready, token }) {
  useLayoutEffect(() => { ready(); }, [token, ready]);
  return children;
}
extend(THREE);
export function createReactThreeScene({ component, overlay }) {
  return async context => {
    const renderer = makeRenderer(context), root = createRoot(renderer.domElement);
    let state;
    await root.configure({ gl: renderer, frameloop: 'never', dpr: context.scene.pluginOptions?.quality ?? 1,
      size: { width: context.output.width, height: context.output.height, top: 0, left: 0 },
      camera: { position: [0, 0, 7], fov: 38 }, onCreated: value => { state = value; } });
    let token = 0;
    return {
      async render(frame) {
        const seconds = frameTime(frame, context.output);
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('React 3D scene did not commit within 10 seconds. Preload assets before rendering.')), 10000);
          root.render(React.createElement(Commit, { token: ++token, ready: () => { clearTimeout(timeout); resolve(); } },
            React.createElement(component, { frame, seconds, ...context })));
        });
        state.advance(seconds, false);
        composite(renderer, context);
        await overlay?.(frame, context);
      },
      dispose() { root.unmount(); renderer.dispose(); renderer.forceContextLoss(); },
    };
  };
}
