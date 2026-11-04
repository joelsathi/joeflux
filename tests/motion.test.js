import test from 'node:test';
import assert from 'node:assert/strict';
import { getFrameState } from '../packages/motion/src/index.js';

test('keeps a text scene readable during its hold', () => {
  const state = getFrameState({ preset: 'text-settle', durationFrames: 120, params: { title: 'Evidence, ready for review.' } }, 100, { width: 1920, height: 1080, fps: 24 });
  assert.equal(state.titleOpacity, 1);
  assert.equal(state.title, 'Evidence, ready for review.');
});

test('uses a seeded particle field so the same frame is repeatable', () => {
  const scene = { preset: 'oxygen-particles', durationFrames: 120, params: { seed: 42 } };
  const first = getFrameState(scene, 24, { width: 1920, height: 1080, fps: 24 });
  const second = getFrameState(scene, 24, { width: 1920, height: 1080, fps: 24 });
  assert.deepEqual(first.particles.slice(0, 3), second.particles.slice(0, 3));
});

test('maps recorded footage speed separately from camera movement', () => {
  const state = getFrameState({
    preset: 'recorded-showcase',
    durationFrames: 48,
    playback: { startFrame: 0, endFrame: 80, segments: [{ outputStart: 0, outputEnd: 23, rate: 2 }], holds: [] },
    camera: { start: { x: 0, scale: 1 }, end: { x: 100, scale: 1.1 }, easing: 'linear' },
  }, 12, { width: 1920, height: 1080, fps: 24 });
  assert.equal(state.sourceFrame, 24);
  assert.ok(state.camera.x > 20 && state.camera.x < 30);
});

test('keeps scene copy available to the renderer', () => {
  const state = getFrameState({ preset: 'feature-list', durationFrames: 24, params: { subtitle: 'No audio track', items: ['First', 'Second'] } }, 23, { width: 1920, height: 1080, fps: 24 });
  assert.deepEqual(state.items, ['First', 'Second']);
  assert.equal(state.subtitle, 'No audio track');
});
