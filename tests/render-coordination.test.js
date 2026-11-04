import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { loadProject } from '../packages/core/src/io.js';
import { renderProject, renderTransitionPreview, sceneFingerprint } from '../packages/renderer/src/render.js';
import { assembleProject } from '../packages/assembly/src/assemble.js';
import { probeSilentVideo } from '../packages/assembly/src/media.js';
import { createProjectTools } from '../packages/tools/src/index.js';
import { createRenderServer } from '../packages/renderer/src/server.js';
import { buildAssemblyPlan } from '../packages/core/src/index.js';

const output = { width: 320, height: 180, fps: 24, audio: false };
const title = (id, theme, durationFrames = 24, extra = {}) => ({ id, preset: 'text-settle', durationFrames, theme, params: { title: id }, ...extra });
async function fixture(t, scenes) {
  const root = await mkdtemp(path.join(tmpdir(), 'render-coordination-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'scenes'));
  for (const scene of scenes) await writeFile(path.join(root, 'scenes', `${scene.id}.json`), JSON.stringify(scene));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ name: 'Render coordination', version: 1, output, assets: {}, scenes: scenes.map(({ id }) => ({ id, file: `scenes/${id}.json` })) }));
  return root;
}
const leftovers = async (root) => (await readdir(path.join(root, 'exports', 'clips')).catch(() => [])).filter((name) => name.includes('.rendering.'));
async function frames(file) {
  const { stdout } = await promisify(execFile)('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: 'buffer', maxBuffer: 1 << 28 });
  const size = output.width * output.height * 3;
  return Array.from({ length: stdout.length / size }, (_, index) => stdout.subarray(index * size, (index + 1) * size));
}
const difference = (a, b) => { let sum = 0; for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]); return sum / a.length; };
const corner = (frame) => [...frame.subarray(0, 3)];

test('independent processes render one scene one at a time and publish a matching clip and cache', async (t) => {
  const root = await fixture(t, [title('title', 'navy-dark')]), module = new URL('../packages/renderer/src/render.js', import.meta.url).href;
  const code = `import {renderProject} from ${JSON.stringify(module)};const span=[];
    await renderProject(process.argv[1],{onlyScene:'title',force:true,onProgress:({frame,frames})=>{if(frame===1)span[0]=Date.now();if(frame===frames)span[1]=Date.now();}});
    console.log(JSON.stringify(span));`;
  const children = Array.from({ length: 2 }, () => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code, root], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', error = ''; child.stdout.on('data', (chunk) => out += chunk); child.stderr.on('data', (chunk) => error += chunk);
    return once(child, 'exit').then(([code]) => { assert.equal(code, 0, error); return JSON.parse(out); });
  });
  const [a, b] = (await Promise.all(children)).sort((x, y) => x[0] - y[0]);
  assert.ok(a[1] <= b[0], `renders overlapped: ${a} and ${b}`);
  const project = await loadProject(root), cache = JSON.parse(await readFile(path.join(root, '.runtime', 'renders', 'title.json'), 'utf8'));
  assert.equal(cache.fingerprint, await sceneFingerprint(project, project.scenes[0]));
  assert.equal((await probeSilentVideo(path.join(root, 'exports', 'clips', 'title.mp4'))).frames, 24);
  assert.deepEqual(await leftovers(root), []);
  const [first, second] = await Promise.all([renderProject(root, { onlyScene: 'title' }), renderProject(root, { onlyScene: 'title' })]);
  assert.deepEqual([first.cached, second.cached], [1, 1], 'a queued render reuses the clip its predecessor published');
});

test('a queued older render-all never overwrites a newer clip of the same shot', async (t) => {
  const root = await fixture(t, [title('a', 'navy-dark', 36), title('b', 'navy-dark', 24)]), file = path.join(root, 'scenes', 'b.json');
  let alone;
  const all = renderProject(root, { onProgress: ({ scene, frame }) => {
    if (scene === 'a' && frame === 1 && !alone) alone = writeFile(file, JSON.stringify(title('b', 'light-blue', 24))).then(() => renderProject(root, { onlyScene: 'b' }));
  } });
  const [everything, single] = await Promise.all([all, (async () => { while (!alone) await delay(5); return alone; })()]);
  assert.equal(single.rendered, 1);
  assert.deepEqual(everything.scenes.map(({ id, cached }) => [id, cached]), [['a', false], ['b', true]], 'render-all reads b inside its lock and reuses the newer clip');
  const project = await loadProject(root), cache = JSON.parse(await readFile(path.join(root, '.runtime', 'renders', 'b.json'), 'utf8'));
  assert.equal(cache.fingerprint, await sceneFingerprint(project, project.scenes[1]));
  assert.ok(corner((await frames(path.join(root, 'exports', 'clips', 'b.mp4')))[0])[0] > 200, 'the clip is the light edit');
});

test('the render server serves its snapshot, not files that change while it renders', async (t) => {
  const root = await fixture(t, [title('title', 'navy-dark')]);
  await mkdir(path.join(root, 'assets'));
  await promisify(execFile)('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=64x36:d=1:r=24', '-an', path.join(root, 'assets', 'clip.mp4')]);
  const manifest = JSON.parse(await readFile(path.join(root, 'project.json'), 'utf8'));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ ...manifest, assets: { clip: 'assets/clip.mp4' } }));
  const snapshot = await loadProject(root), server = await createRenderServer(root, { project: snapshot });
  try {
    await writeFile(path.join(root, 'project.json'), JSON.stringify({ ...manifest, assets: {}, scenes: [...manifest.scenes, { id: 'new', file: 'scenes/new.json' }] }));
    assert.deepEqual((await (await fetch(`${server.origin}/project.json`)).json()).scenes.map(({ id }) => id), ['title']);
    const frame = await fetch(`${server.origin}/api/source-frame?asset=clip&time=0.5`);
    assert.equal(frame.status, 200, 'a half-published manifest on disk does not break frame decoding');
    assert.equal(frame.headers.get('content-type'), 'image/png');
  } finally { await server.close(); }
});

test('a cancelled render leaves no partial clip and releases the scene', async (t) => {
  const root = await fixture(t, [title('title', 'navy-dark', 48)]), controller = new AbortController();
  await assert.rejects(renderProject(root, { onlyScene: 'title', signal: controller.signal, onProgress: ({ frame }) => { if (frame === 3) controller.abort(); } }), { name: 'AbortError' });
  assert.deepEqual(await leftovers(root), []);
  await assert.rejects(readFile(path.join(root, 'exports', 'clips', 'title.mp4')), { code: 'ENOENT' });
  const started = Date.now();
  assert.equal((await renderProject(root, { onlyScene: 'title' })).rendered, 1);
  assert.ok(Date.now() - started < 20000);
});

test('cancelling render_scene through the tool runner stops publication and reports failure', async (t) => {
  const root = await fixture(t, [title('title', 'navy-dark', 12)]), controller = new AbortController();
  const runner = createProjectTools(root), events = [];
  runner.events.on('event', (event) => {
    if (event.type !== 'progress') return;
    events.push(event);
    if (event.frame === 2) controller.abort();
  });
  await assert.rejects(runner.call('render_scene', { id: 'title' }, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(events.at(-1).status, 'failed');
  assert.deepEqual(await leftovers(root), []);
  await assert.rejects(readFile(path.join(root, 'exports/clips/title.mp4')), { code: 'ENOENT' });
  await assert.rejects(readFile(path.join(root, '.runtime/renders/title.json')), { code: 'ENOENT' });
});

test('transition preview matches the assembled boundary frame for frame, beside neighbouring transitions', async (t) => {
  const scenes = [title('intro', 'light-blue', 24, { transition: { type: 'crossfade', frames: 6 } }), title('dark', 'navy-dark', 48, { transition: { type: 'crossfade', frames: 12 } }), title('light', 'light-blue', 36, { transition: { type: 'wipe-left', frames: 12 } }), title('end', 'navy-dark', 30)];
  const root = await fixture(t, scenes);
  const preview = await renderTransitionPreview(root, { sceneId: 'dark', width: 320 });
  assert.equal(preview.url, `/project-assets/.runtime/previews/${path.basename(preview.outputPath)}`);
  // One second either side, less the frames the intro and outro transitions blend.
  assert.deepEqual([preview.transition, preview.overlapFrames, preview.startFrame, preview.frames, preview.next], ['crossfade', 12, 24, 36 + 24 - 12, 'light']);
  assert.deepEqual(Object.keys(preview.sources), ['intro', 'dark', 'light']);
  const media = await probeSilentVideo(preview.outputPath);
  assert.deepEqual([media.frames, media.width, media.audioStreams], [48, 320, 0]);
  assert.deepEqual((await readdir(path.dirname(preview.outputPath))).filter((name) => name !== path.basename(preview.outputPath)), [], 'segments are removed');
  await renderProject(root); const final = await assembleProject(root);
  const start = buildAssemblyPlan(await loadProject(root)).clips[1].startFrame + 48 - (preview.startFrame + preview.overlapFrames);
  const shown = await frames(preview.outputPath), assembled = (await frames(final.outputPath)).slice(start, start + preview.frames);
  const worst = Math.max(...shown.map((frame, index) => difference(frame, assembled[index])));
  assert.ok(worst < 2.5, `preview differs from assembly by ${worst}`);
  const dark = corner(shown[preview.startFrame - 1]), light = corner(shown.at(-1)), middle = corner(shown[preview.startFrame + 6]);
  assert.ok(dark[0] < light[0] && middle[0] > dark[0] && middle[0] < light[0], `${dark} → ${middle} → ${light}`);
  await assert.rejects(renderTransitionPreview(root, { sceneId: 'end' }), /last shot/);
  const tool = await createProjectTools(root).call('transition_preview', { id: 'light', width: 160 });
  assert.deepEqual([tool.transition, tool.frames, tool.width], ['wipe-left', 24 + 30 - 12, 160]);
  const controller = new AbortController(), before = await readdir(path.dirname(preview.outputPath));
  await assert.rejects(renderTransitionPreview(root, { sceneId: 'dark', width: 160, signal: controller.signal, onProgress: ({ frame }) => { if (frame === 2) controller.abort(); } }), { name: 'AbortError' });
  assert.deepEqual(await readdir(path.dirname(preview.outputPath)), before, 'a cancelled preview leaves nothing behind');
  await writeFile(path.join(root, 'scenes', 'end.json'), JSON.stringify(title('end', 'light-blue', 30)));
  await assert.rejects(assembleProject(root), /Shot "end" changed since it was rendered/);
});
