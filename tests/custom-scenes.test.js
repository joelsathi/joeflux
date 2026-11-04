import test from 'node:test';
import assert from 'node:assert/strict';
import { renderModuleFrame, sceneModuleUrl } from '../packages/motion/src/custom.js';

test('loads a project custom scene through the shared frame-renderer contract', async () => {
  const scene = { module: 'scenes/custom title.js' };
  const calls = [];
  const result = await renderModuleFrame(scene, 7, { output: { fps: 24 } }, async (url) => {
    calls.push(url);
    return { renderFrame: (frame, context) => ({ frame, fps: context.output.fps }) };
  }, '/project-modules');
  assert.deepEqual(calls, ['/project-modules/scenes/custom%20title.js']);
  assert.deepEqual(result, { frame: 7, fps: 24 });
});

test('does not form a module URL for preset scenes', () => {
  assert.equal(sceneModuleUrl({ preset: 'text-settle' }), null);
});
