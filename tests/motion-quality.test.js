import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutText, layoutScene } from '../packages/motion/src/layout.js';
import { resolveTheme } from '../packages/presets/src/themes.js';
import { evaluateCamera, evaluateSourceTime, mapSourceFrame } from '../packages/motion/src/timing.js';
import { evaluateZoom } from '../packages/motion/src/zoom.js';

const output = { width: 1920, height: 1080, fps: 24 };
const measure = (text) => ({ width: text.length * 40 });

test('lays a long title into a bounded two-line safe region', () => {
  const layout = layoutText('A product story with enough detail to require a readable second line.', {
    maxWidth: 920, maxLines: 2, fontSize: 76, minFontSize: 32, lineHeight: 88, measure,
  });
  assert.ok(layout.lines.length <= 2);
  assert.ok(layout.bounds.width <= 920);
  assert.ok(layout.fontSize >= 32);
});

test('keeps product media and copy regions separate', () => {
  const layout = layoutScene({ preset: 'recorded-showcase', params: { title: 'Readable product story' } }, output);
  assert.ok(layout.copyRect.x + layout.copyRect.width + layout.gap <= layout.mediaRect.x);
  assert.equal(layout.safeRect.x, 96);
});

test('preserves the light-blue theme by default and exposes navy dark tokens', () => {
  assert.equal(resolveTheme().id, 'light-blue');
  assert.equal(resolveTheme('navy-dark').background, '#18263D');
  assert.equal(resolveTheme('navy-dark').accent, '#F14E23');
});

test('uses the same easeOut camera evaluation everywhere', () => {
  assert.equal(evaluateCamera({ start: { x: 0 }, end: { x: 100 }, easing: 'easeOut' }, 12, 48).x.toFixed(3), '58.704');
});

test('continues source time across speed segments and a freeze hold', () => {
  const playback = {
    startFrame: 0, endFrame: 300,
    segments: [{ outputStart: 0, outputEnd: 64, rate: 1.5 }, { outputStart: 65, outputEnd: 96, rate: 1 }],
    holds: [{ outputStart: 97, outputEnd: 132 }],
  };
  assert.equal(mapSourceFrame(playback, 64, 24), 96);
  assert.equal(mapSourceFrame(playback, 65, 24), 97);
  assert.equal(mapSourceFrame(playback, 132, 24), 129);
  assert.equal(mapSourceFrame(playback, 133, 24), 129);
  assert.equal(mapSourceFrame(playback, 134, 24), 130);
  assert.equal(evaluateSourceTime(playback, 64, 24), 4);
});

test('holds a focus zoom and clamps it to keep the source covered', () => {
  const zoom = evaluateZoom({ startFrame: 0, endFrame: 72, entryFrames: 12, exitFrames: 12, scale: 1.8, focusX: 1, focusY: 0 }, 36, 120);
  assert.equal(zoom.scale, 1.8);
  assert.ok(zoom.x <= 0 && zoom.y >= 0);
});

test('recognizes a local video asset as a seekable recording', async () => {
  const { isVideoAsset, sourceSecondsForFrame } = await import('../packages/renderer/src/source-frames.js');
  assert.equal(isVideoAsset('assets/product demo.mp4'), true);
  assert.equal(isVideoAsset('assets/screen.svg'), false);
  assert.equal(sourceSecondsForFrame({ playback: { startFrame: 0, endFrame: 300 }, durationFrames: 120 }, 48, 24), 2);
});

test('accepts the reusable screen handoff and dark scene theme', async () => {
  const { validateProject } = await import('../packages/core/src/index.js');
  const result = validateProject({ output: { ...output, audio: false }, theme: 'light-blue', scenes: [{ id: 'handoff', preset: 'screen-handoff', theme: 'navy-dark', durationFrames: 144 }] });
  assert.equal(result.valid, true);
});
