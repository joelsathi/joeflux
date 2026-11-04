import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { renderFilmPreview, filmPreviewState } from '../packages/renderer/src/film-preview.js';
import { probeSilentVideo } from '../packages/assembly/src/media.js';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'film-preview-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'scenes')); await mkdir(path.join(root, 'exports'));
  await writeFile(path.join(root, 'exports/final.mp4'), 'approved export stays here');
  const scenes = [{ id: 'dark', theme: 'navy-dark', transition: { type: 'crossfade', frames: 4 } }, { id: 'light', theme: 'light-blue' }].map(scene => ({ ...scene, preset: 'text-settle', durationFrames: 12, params: { title: '' } }));
  for (const scene of scenes) await writeFile(path.join(root, `scenes/${scene.id}.json`), JSON.stringify(scene));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ version: 1, name: 'Film review', output: { width: 320, height: 180, fps: 24, audio: false }, assets: {}, scenes: scenes.map(({ id }) => ({ id, file: `scenes/${id}.json` })) }));
  return root;
}
test('film review uses actual overlap frames, full shot offsets and silent low-resolution output without final export writes', async t => {
  const root = await fixture(t), progress = [];
  const result = await renderFilmPreview(root, { width: 160, onProgress: detail => progress.push(detail) });
  assert.deepEqual(result.startOffsets, { dark: 0, light: 8 });
  assert.equal(result.totalFrames, 20); assert.equal(result.frames, 20);
  assert.equal(result.stale, false);
  assert.deepEqual(Object.keys(result.sources), ['dark', 'light']);
  const media = await probeSilentVideo(result.outputPath);
  assert.deepEqual([media.frames, media.width, media.height, media.audioStreams], [20, 160, 90, 0]);
  assert.equal(await readFile(path.join(root, 'exports/final.mp4'), 'utf8'), 'approved export stays here');
  assert.deepEqual(await readdir(path.join(root, 'exports')), ['final.mp4']);
  assert.deepEqual(await readdir(path.join(root, '.runtime/previews')), [path.basename(result.outputPath)]);
  assert.equal(progress.at(-1).phase, 'joining');
  const { stdout } = await promisify(execFile)('ffmpeg', ['-v', 'error', '-i', result.outputPath, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: 'buffer', maxBuffer: 1 << 24 });
  const corner = frame => stdout[frame * 160 * 90 * 3];
  assert.ok(corner(0) < corner(19));
  assert.ok(corner(10) > corner(7) && corner(10) < corner(19), 'assembly crossfade blends the middle boundary frame');
});
test('film cancellation clears partial review media and can be retried', async t => {
  const root = await fixture(t), controller = new AbortController();
  await assert.rejects(renderFilmPreview(root, { width: 160, signal: controller.signal, onProgress: ({ frame }) => { if (frame === 2) controller.abort(); } }), { name: 'AbortError' });
  assert.deepEqual(await readdir(path.join(root, '.runtime/previews')), []);
  assert.equal((await renderFilmPreview(root, { width: 160 })).totalFrames, 20);
});
test('film snapshot is marked stale when shots change during render and dependency fingerprint detects later changes', async t => {
  const root = await fixture(t); let edit;
  const result = await renderFilmPreview(root, { width: 160, onProgress: ({ frame }) => {
    if (frame !== 1 || edit) return;
    edit = readFile(path.join(root, 'scenes/light.json'), 'utf8').then(text => writeFile(path.join(root, 'scenes/light.json'), JSON.stringify({ ...JSON.parse(text), theme: 'navy-dark' })));
  } });
  await edit;
  assert.equal(result.stale, true);
  assert.notEqual((await filmPreviewState(root)).fingerprint, result.fingerprint);
});
test('film rendering uses edited source moments and holds the selected result without changing the recording', async t => {
  const root = await fixture(t); await mkdir(path.join(root, 'assets'));
  const source = path.join(root, 'assets/source.mp4');
  await promisify(execFile)('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:r=30:d=1', '-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=30:d=1', '-f', 'lavfi', '-i', 'color=c=lime:s=320x180:r=30:d=1', '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]', '-map', '[v]', '-an', '-c:v', 'libx264', source]);
  const original = await readFile(source);
  const scene = { id: 'dark', kind: 'screen', durationFrames: 24, screen: { asset: 'clip' }, camera: { shots: [{ at: 0 }] }, playback: { sourceFps: 30, moments: [{ type: 'play', startSeconds: 0, endSeconds: .5 }, { type: 'play', startSeconds: 2, endSeconds: 2.25 }, { type: 'hold', sourceSeconds: 2.25, frames: 6 }] } };
  await writeFile(path.join(root, 'scenes/dark.json'), JSON.stringify(scene));
  const manifest = JSON.parse(await readFile(path.join(root, 'project.json'), 'utf8'));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ ...manifest, assets: { clip: 'assets/source.mp4' }, scenes: [manifest.scenes[0]] }));
  const result = await renderFilmPreview(root, { width: 160 });
  assert.equal(result.totalFrames, 24);
  const { stdout } = await promisify(execFile)('ffmpeg', ['-v', 'error', '-i', result.outputPath, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: 'buffer', maxBuffer: 1 << 24 });
  const pixel = frame => [...stdout.subarray(frame * 160 * 90 * 3 + (45 * 160 + 80) * 3, frame * 160 * 90 * 3 + (45 * 160 + 80) * 3 + 3)];
  assert.ok(pixel(0)[2] > 200 && pixel(0)[0] < 20, `source starts blue: ${pixel(0)}`);
  assert.ok(pixel(12)[1] > 200 && pixel(12)[0] < 20, `waiting red section was skipped: ${pixel(12)}`);
  assert.deepEqual(pixel(18), pixel(23), 'selected green result remains held');
  assert.deepEqual(await readFile(source), original);
});

test('film dependency fingerprint ignores brief, review, knowledge and guide metadata', async t => {
  const root = await fixture(t), file = path.join(root, 'project.json'), project = JSON.parse(await readFile(file, 'utf8'));
  const before = (await filmPreviewState(root)).fingerprint;
  await writeFile(file, JSON.stringify({ ...project, brief: { audience: 'Developers' }, reviews: [{ id: 'r1' }], knowledge: { references: [] }, guide: { step: 'review' } }));
  assert.equal((await filmPreviewState(root)).fingerprint, before);
  await writeFile(file, JSON.stringify({ ...project, theme: 'navy-dark' }));
  assert.notEqual((await filmPreviewState(root)).fingerprint, before);
});
