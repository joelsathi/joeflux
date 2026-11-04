import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as renderer from '../packages/renderer/src/render.js';
import { probeSilentVideo } from '../packages/assembly/src/media.js';

const exec = promisify(execFile);
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'harness blur preview '));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'scenes'));
  const scene = { id: 'moving', module: 'scenes/moving.js', durationFrames: 12, playback: { startFrame: 24, segments: [{ outputStart: 0, outputEnd: 12, rate: 2 }] } };
  await writeFile(path.join(root, 'scenes/moving.js'), `
    import { sourceSecondsForFrame } from '/packages/renderer/src/source-frames.js';
    export function renderFrame(frame, { canvas, context, output, scene }) {
      canvas.width = output.width; canvas.height = output.height;
      const source = sourceSecondsForFrame(scene, frame, output.fps);
      context.fillStyle = 'rgb(' + Math.floor(frame * 14) + ',' + Math.floor(source * 60) + ',' + scene.durationFrames * 10 + ')';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
  `);
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ name: 'Blur preview', version: 1, output: { width: 320, height: 180, fps: 24, audio: false }, assets: {}, scenes: [{ id: scene.id, file: 'scenes/moving.json' }] }));
  const save = (motionBlur) => writeFile(path.join(root, 'scenes/moving.json'), JSON.stringify({ ...scene, ...(motionBlur ? { motionBlur } : {}) }));
  await save();
  return { root, save };
}
async function pixels(file) {
  return (await exec('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 })).stdout;
}

test('disabled motion blur produces sharp export frames while retaining its quality settings', async (t) => {
  const { root, save } = await fixture(t);
  const sharp = await renderer.renderProject(root);
  const expected = await pixels(sharp.scenes[0].outputPath);
  await save({ enabled: false, samples: 4, shutter: 1 });
  const disabled = await renderer.renderProject(root);
  assert.deepEqual(await pixels(disabled.scenes[0].outputPath), expected);
  const saved = JSON.parse(await readFile(path.join(root, 'scenes/moving.json'), 'utf8'));
  assert.deepEqual(saved.motionBlur, { enabled: false, samples: 4, shutter: 1 });
  await save({ enabled: true, samples: 4, shutter: 1 });
  const enabled = await renderer.renderProject(root);
  assert.notDeepEqual(await pixels(enabled.scenes[0].outputPath), expected);
});

test('preview is silent, downscaled, bounded and preserves scene and source timing without replacing exports', async (t) => {
  assert.equal(typeof renderer.renderPreview, 'function');
  const { root, save } = await fixture(t);
  await save({ samples: 2, shutter: 1 });
  await mkdir(path.join(root, 'exports/clips'), { recursive: true });
  await mkdir(path.join(root, '.runtime/renders'), { recursive: true });
  const output = path.join(root, 'exports/clips/moving.mp4'), cache = path.join(root, '.runtime/renders/moving.json');
  await writeFile(output, 'existing export'); await writeFile(cache, 'existing cache');
  const progress = [];
  const result = await renderer.renderPreview(root, { sceneId: 'moving', at: .5, seconds: .125, width: 160, onProgress: (event) => progress.push(event) });
  assert.deepEqual({ startFrame: result.startFrame, frames: result.frames, width: result.width, height: result.height, fps: result.fps }, { startFrame: 6, frames: 3, width: 160, height: 90, fps: 24 });
  assert.match(result.url, /^\/project-assets\/\.runtime\/previews\/[^/]+\.mp4$/);
  assert.equal(result.outputPath, path.join(root, result.url.replace('/project-assets/', '')));
  assert.deepEqual(await probeSilentVideo(result.outputPath), { width: 160, height: 90, fps: '24/1', frames: 3, codec: 'h264', audioStreams: 0 });
  const rgb = await pixels(result.outputPath);
  // Frame six samples 5.75 and 6.25; source timing starts at one second and runs at 2x.
  assert.ok(rgb[0] >= 79 && rgb[0] <= 85, `scene time: ${rgb[0]}`);
  assert.ok(rgb[1] >= 86 && rgb[1] <= 93, `source time: ${rgb[1]}`);
  assert.ok(rgb[2] >= 117 && rgb[2] <= 123, `scene duration: ${rgb[2]}`);
  assert.deepEqual(progress.map(({ frame, frames }) => [frame, frames]), [[1, 3], [2, 3], [3, 3]]);
  const end = await renderer.renderPreview(root, { sceneId: 'moving', at: 1, seconds: 1, width: 640 });
  assert.notEqual(end.outputPath, result.outputPath);
  assert.deepEqual([end.startFrame, end.frames, end.width, end.height], [0, 12, 320, 180]);
  assert.equal(await readFile(output, 'utf8'), 'existing export');
  assert.equal(await readFile(cache, 'utf8'), 'existing cache');
});

test('preview rejects invalid ranges, dimensions, unknown scenes and invalid projects before rendering', async (t) => {
  assert.equal(typeof renderer.renderPreview, 'function');
  const { root } = await fixture(t);
  for (const options of [{ at: -1 }, { at: 1.1 }, { at: NaN }, { seconds: 0 }, { seconds: 4 }, { width: 0 }, { width: 160.5 }, { width: 2000 }]) {
    await assert.rejects(renderer.renderPreview(root, { sceneId: 'moving', ...options }), /at|seconds|width/i);
  }
  await assert.rejects(renderer.renderPreview(root, { sceneId: 'missing' }), /No scene/);
  const manifest = JSON.parse(await readFile(path.join(root, 'project.json'), 'utf8'));
  manifest.output.audio = true;
  await writeFile(path.join(root, 'project.json'), JSON.stringify(manifest));
  await assert.rejects(renderer.renderPreview(root, { sceneId: 'moving' }), /audio/i);
});
