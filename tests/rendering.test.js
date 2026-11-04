import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserLaunchOptions, buildVideoArgs, isRenderCurrent } from '../packages/renderer/src/index.js';
import { buildFilterGraph } from '../packages/assembly/src/index.js';

test('creates FFmpeg args that explicitly exclude audio', () => {
  const args = buildVideoArgs({ fps: 24, outputPath: '/tmp/scene.mp4' });
  assert.equal(args.includes('-an'), true);
  assert.deepEqual(args.slice(-2), ['+faststart', '/tmp/scene.mp4']);
});

test('uses the installed Chromium channel instead of requiring a headless-shell download', () => {
  assert.deepEqual(browserLaunchOptions(), { headless: true, channel: 'chromium' });
});

test('reuses a render only when its fingerprint and MP4 both exist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'joeflux-test-'));
  const outputPath = join(directory, 'scene.mp4');
  const cachePath = join(directory, 'scene.json');
  await writeFile(outputPath, 'not a video');
  await writeFile(cachePath, JSON.stringify({ fingerprint: 'same', outputPath }));
  assert.equal(await isRenderCurrent({ cachePath, outputPath, fingerprint: 'same' }), true);
  assert.equal(await isRenderCurrent({ cachePath, outputPath, fingerprint: 'different' }), false);
  assert.equal(existsSync(outputPath), true);
});

test('builds an explicit crossfade filter while preserving a silent output map', () => {
  const graph = buildFilterGraph({
    fps: 24,
    clips: [
      { durationFrames: 48, transition: { type: 'crossfade', frames: 6 } },
      { durationFrames: 72, transition: null },
    ],
  });
  assert.match(graph.filter, /xfade=transition=fade:duration=0\.25:offset=1\.75/);
  assert.deepEqual(graph.args.slice(-4), ['-map', '[video]', '-an', '-shortest']);
});

test('normalizes every crossfade input and output to the project frame timebase', () => {
  const graph = buildFilterGraph({ fps: 24, clips: [
    { durationFrames: 48, transition: { type: 'crossfade', frames: 6 } },
    { durationFrames: 72, transition: { type: 'crossfade', frames: 6 } },
    { durationFrames: 48 },
  ] });
  assert.match(graph.filter, /settb=1\/24,setpts=PTS-STARTPTS/);
  assert.match(graph.filter, /\[mix1\]settb=1\/24\[timed1\]/);
});
