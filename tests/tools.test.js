import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createProjectTools, ToolError } from '../packages/tools/src/index.js';
import { startPreview } from '../packages/preview-server/src/index.js';

const legacy = { id: 'legacy', preset: 'recorded-showcase', durationFrames: 48, params: { asset: 'screen' }, cameraMotion: { preset: 'focus-zoom', scale: 2 } };
const title = { id: 'title', preset: 'text-settle', durationFrames: 24, params: { title: 'Hello' } };
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'harness tools '));
  await mkdir(path.join(root, 'scenes')); await mkdir(path.join(root, 'assets'));
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=24:d=1', '-an', '-c:v', 'libx264', path.join(root, 'assets', 'clip.mp4')]);
  await writeFile(path.join(root, 'scenes', 'legacy.json'), JSON.stringify(legacy));
  await writeFile(path.join(root, 'scenes', 'title.json'), JSON.stringify(title));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ name: 'Tools', version: 1, output: { width: 320, height: 180, fps: 24, audio: false }, assets: { screen: 'assets/clip.mp4' }, scenes: [{ id: 'legacy', file: 'scenes/legacy.json' }, { id: 'title', file: 'scenes/title.json' }] }));
  return root;
}
const read = (root, file) => readFile(path.join(root, file), 'utf8');
const json = async (root, file) => JSON.parse(await read(root, file));
const screen = { id: 'tour', kind: 'screen', durationFrames: 48, screen: { asset: 'screen' }, camera: { shots: [{ at: 0 }, { at: .5, focus: [.3, .3], zoom: 2 }, { at: 1 }] } };
const rejects = (promise, pattern) => assert.rejects(promise, (error) => error instanceof ToolError && pattern.test([error.message, ...error.issues].join('\n')));

test('every tool publishes an object JSON Schema and inputs are validated', async () => {
  const tools = createProjectTools(await fixture()), list = tools.list();
  for (const name of ['project_get', 'scene_create', 'scene_update', 'camera_set_shots', 'render_frame', 'history_undo']) assert.ok(list.some((tool) => tool.name === name), name);
  for (const tool of list) { assert.equal(tool.inputSchema.type, 'object', tool.name); assert.ok(tool.description.length > 10, tool.name); }
  await rejects(tools.call('nope'), /Unknown tool/);
  await rejects(tools.call('scene_update', { id: 'Bad Id', patch: {} }), /id: use lowercase/);
  await rejects(tools.call('camera_set_shots', { id: 'legacy', shots: [{ at: 2 }] }), /shots\.0\.at/);
});

test('create, undo and redo restore exact files and report each change', async () => {
  const root = await fixture(), tools = createProjectTools(root), events = [];
  tools.events.on('event', (event) => events.push(event));
  const manifestBefore = await read(root, 'project.json');
  const { _change, ...created } = await tools.call('scene_create', { scene: screen, index: 1 });
  assert.deepEqual(created, { id: 'tour', file: 'scenes/tour.json' });
  assert.deepEqual(_change.details, ['project · scenes: legacy, title → legacy, tour, title', 'Added shot tour']);
  assert.deepEqual((await json(root, 'project.json')).scenes.map((scene) => scene.id), ['legacy', 'tour', 'title']);
  assert.equal((await tools.call('scene_get', { id: 'tour' })).camera.shots.length, 3);
  assert.deepEqual(await tools.call('history_undo'), { undid: 'Create tour', canUndo: false, canRedo: true });
  assert.equal(await read(root, 'project.json'), manifestBefore);
  await assert.rejects(read(root, 'scenes/tour.json'), { code: 'ENOENT' });
  await tools.call('history_redo');
  assert.equal((await json(root, 'scenes/tour.json')).kind, 'screen');
  assert.deepEqual(events.map((event) => event.source), ['tool', 'undo', 'redo']);
  assert.deepEqual(events[0].files.sort(), ['project.json', 'scenes/tour.json']);
  await rejects(tools.call('history_redo'), /Nothing to redo/);
  await tools.call('history_undo');
  await tools.call('scene_update', { id: 'title', patch: { durationFrames: 30 } });
  assert.deepEqual((await tools.call('history_list')).entries.map((entry) => entry.summary), ['Edit title'], 'a new change drops the undone branch');
});

test('changes that would invalidate the project are rejected before anything is written', async () => {
  const root = await fixture(), tools = createProjectTools(root), before = await read(root, 'scenes/title.json');
  await rejects(tools.call('scene_update', { id: 'title', patch: { durationFrames: 0 } }), /durationFrames must be a positive integer/);
  await rejects(tools.call('scene_create', { scene: { ...screen, screen: { asset: 'missing' } } }), /missing declared asset/);
  await rejects(tools.call('scene_create', { scene: { ...screen, id: 'title' } }), /already exists/);
  await rejects(tools.call('scene_update', { id: 'title', patch: { id: 'renamed' } }), /ids cannot change/);
  assert.equal(await read(root, 'scenes/title.json'), before);
  assert.deepEqual((await tools.call('history_list')).entries, []);
});

test('merge patches edit nested values and null deletes keys', async () => {
  const root = await fixture(), tools = createProjectTools(root);
  await tools.call('scene_update', { id: 'title', patch: { params: { subtitle: 'World' }, theme: 'navy-dark' } });
  await tools.call('scene_update', { id: 'title', patch: { theme: null } });
  assert.deepEqual(await json(root, 'scenes/title.json'), { ...title, params: { title: 'Hello', subtitle: 'World' } });
});

test('scene_replace honours fingerprints and strips runtime fields', async () => {
  const root = await fixture(), tools = createProjectTools(root), scene = await tools.call('scene_get', { id: 'title' });
  await rejects(tools.call('scene_replace', { id: 'title', scene, fingerprint: 'stale' }), /changed outside/);
  const saved = await tools.call('scene_replace', { id: 'title', scene: { ...scene, durationFrames: 36 }, fingerprint: scene.fingerprint });
  assert.equal(saved.fingerprint, (await tools.call('scene_get', { id: 'title' })).fingerprint);
  assert.deepEqual(Object.keys(await json(root, 'scenes/title.json')).sort(), ['durationFrames', 'id', 'params', 'preset']);
});

test('camera tools write the shot model and convert legacy recording scenes', async () => {
  const root = await fixture(), tools = createProjectTools(root);
  await tools.call('camera_set_shots', { id: 'legacy', shots: [{ at: 1 }, { at: 0 }, { at: .4, focus: [.8, .2], zoom: 3 }], ease: 'easeInOut' });
  const scene = await json(root, 'scenes/legacy.json');
  assert.equal(scene.kind, 'screen'); assert.equal(scene.preset, undefined); assert.equal(scene.cameraMotion, undefined);
  assert.deepEqual(scene.screen, { asset: 'screen', presentation: 'fullscreen', backdrop: 'theme', fit: 'contain', size: 1, tilt: [0, 0, 0] });
  assert.deepEqual(scene.camera, { ease: 'easeInOut', shots: [{ at: 0 }, { at: .4, focus: [.8, .2], zoom: 3 }, { at: 1 }] });
  await tools.call('camera_apply_move', { id: 'legacy', move: 'detail-pan', focus: [.2, .5], endFocus: [.8, .5], zoom: 2 });
  assert.equal((await json(root, 'scenes/legacy.json')).camera.shots.length, 6);
  assert.deepEqual((await json(root, 'scenes/legacy.json')).camera.move, { preset: 'detail-pan' });
  await tools.call('camera_frame_areas', { id: 'legacy', areas: [{ focus: [.2, .2], zoom: 2 }, { focus: [.8, .7], zoom: 3 }], returnToFull: false });
  const framed = (await json(root, 'scenes/legacy.json')).camera;
  assert.equal(framed.move, undefined); assert.equal(framed.shots.length, 6); assert.deepEqual(framed.shots.at(-1), { at: 1, focus: [.8, .7], zoom: 3, areaId: 'area-2' });
  await tools.call('screen_set', { id: 'legacy', presentation: 'studio', backdrop: 'slate', tilt: [10, -5, 0] });
  assert.equal((await json(root, 'scenes/legacy.json')).screen.backdrop, 'slate');
  await rejects(tools.call('screen_set', { id: 'legacy', size: 9 }), /size/);
  await rejects(tools.call('camera_set_shots', { id: 'title', shots: [{ at: 0 }] }), /not a screen shot/);
  assert.equal((await tools.call('validate')).valid, true);
});

test('delete, duplicate and reorder keep the manifest consistent', async () => {
  const root = await fixture(), tools = createProjectTools(root), original = await read(root, 'scenes/title.json');
  await tools.call('scene_duplicate', { id: 'title', newId: 'title-copy' });
  assert.deepEqual((await json(root, 'project.json')).scenes.map((scene) => scene.id), ['legacy', 'title', 'title-copy']);
  assert.equal((await json(root, 'scenes/title-copy.json')).id, 'title-copy');
  await rejects(tools.call('scene_reorder', { order: ['title', 'legacy'] }), /each scene once/);
  await tools.call('scene_reorder', { order: ['title-copy', 'title', 'legacy'] });
  await tools.call('scene_delete', { id: 'title' });
  await assert.rejects(read(root, 'scenes/title.json'), { code: 'ENOENT' });
  await tools.call('history_undo');
  assert.equal(await read(root, 'scenes/title.json'), original, 'undo restores the original bytes');
});

test('undo refuses to overwrite an edit made outside the tools', async () => {
  const root = await fixture(), tools = createProjectTools(root);
  await tools.call('scene_update', { id: 'title', patch: { durationFrames: 30 } });
  const saved = await read(root, 'scenes/title.json');
  await writeFile(path.join(root, 'scenes', 'title.json'), JSON.stringify({ ...title, durationFrames: 40 }));
  await rejects(tools.call('history_undo'), /changed after "Edit title"/);
  await writeFile(path.join(root, 'scenes', 'title.json'), saved);
  await tools.call('history_undo');
  assert.equal((await json(root, 'scenes/title.json')).durationFrames, 24);
});

test('concurrent changes are applied one at a time without losing edits', async () => {
  const root = await fixture(), tools = createProjectTools(root);
  await Promise.all(['a', 'b', 'c', 'd', 'e'].map((key) => tools.call('scene_update', { id: 'title', patch: { params: { [key]: key } } })));
  assert.deepEqual(Object.keys((await json(root, 'scenes/title.json')).params).sort(), ['a', 'b', 'c', 'd', 'e', 'title']);
  assert.equal((await tools.call('history_list')).entries.length, 5);
});

test('asset import copies once and registers the name', async () => {
  const root = await fixture(), tools = createProjectTools(root), source = path.join(await mkdtemp(path.join(tmpdir(), 'asset ')), 'logo.svg');
  await writeFile(source, '<svg xmlns="http://www.w3.org/2000/svg"/>');
  const { _change, ...imported } = await tools.call('asset_import', { source, name: 'logo' });
  assert.deepEqual(imported, { name: 'logo', file: 'assets/logo.svg' });
  assert.deepEqual(_change.details, ['Added assets/logo.svg (41 bytes)', 'project · assets.logo: unset → "assets/logo.svg"']);
  assert.equal(await read(root, 'assets/logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  assert.equal((await json(root, 'project.json')).assets.logo, 'assets/logo.svg');
  await rejects(tools.call('asset_import', { source, name: 'logo' }), /already exists/);
  await rejects(tools.call('asset_import', { source: '/does/not/exist.png', name: 'other' }), /No file/);
});

test('the watcher reports outside edits but not the tools\' own writes', async () => {
  const root = await fixture(), tools = createProjectTools(root), events = [], stop = tools.watch();
  tools.events.on('event', (event) => events.push(event));
  try {
    await tools.ready;
    await tools.call('scene_update', { id: 'title', patch: { durationFrames: 30 } });
    await new Promise((resolve) => setTimeout(resolve, 400));
    await writeFile(path.join(root, 'scenes', 'title.json'), JSON.stringify(title));
    const deadline = Date.now() + 3000;
    while (!events.some((event) => event.source === 'external') && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(events.map((event) => event.source), ['tool', 'external']);
    assert.deepEqual(events[1].files, ['scenes/title.json']);
  } finally { stop(); }
});

test('the preview server exposes tools over HTTP and streams change events', async () => {
  const root = await fixture(), preview = await startPreview(root, 0), url = (pathname) => new URL(pathname, preview.url);
  const controller = new AbortController(), headers = { 'x-joeflux-token': preview.token, 'content-type': 'application/json' };
  try {
    const list = await (await fetch(url('/api/tools'), { headers })).json();
    assert.ok(list.some((tool) => tool.name === 'scene_update' && tool.mutates));
    const stream = await fetch(url('/api/events'), { headers, signal: controller.signal }), reader = stream.body.getReader(), decoder = new TextDecoder();
    const response = await fetch(url('/api/tools/scene_update'), { method: 'POST', headers, body: JSON.stringify({ id: 'title', patch: { durationFrames: 30 } }) });
    assert.equal(response.status, 200);
    let text = '';
    while (!text.includes('"source":"tool"')) text += decoder.decode((await reader.read()).value);
    assert.match(text, /"files":\["scenes\/title.json"\]/);
    const invalid = await fetch(url('/api/tools/scene_update'), { method: 'POST', headers, body: JSON.stringify({ id: 'title', patch: { durationFrames: -1 } }) });
    assert.equal(invalid.status, 400);
    const body = await invalid.json();
    assert.equal(body.error, 'The change would make the project invalid.'); assert.ok(body.issues.length);
    const legacyProject = await (await fetch(url('/api/project'), { headers })).json();
    assert.equal(legacyProject.scenes[1].durationFrames, 30); assert.equal(legacyProject.root, undefined);
  } finally { controller.abort(); await preview.close(); }
});

test('the CLI lists and calls tools', async () => {
  const root = await fixture(), cli = (...args) => execFileSync('node', ['packages/cli/src/main.js', 'tool', root, ...args], { encoding: 'utf8' });
  assert.ok(JSON.parse(cli()).some((tool) => tool.name === 'catalog'));
  assert.equal(JSON.parse(cli('scene_get', '{"id":"title"}')).durationFrames, 24);
  assert.throws(() => execFileSync('node', ['packages/cli/src/main.js', 'tool', root, 'scene_update', '{"id":"title","patch":{"durationFrames":0}}'], { stdio: 'pipe' }), /durationFrames must be a positive integer/);
});

test('render_frame writes a downscaled PNG an agent can inspect', async () => {
  const root = await fixture(), tools = createProjectTools(root);
  await tools.call('scene_create', { scene: { ...screen, durationFrames: 24 } });
  const result = await tools.call('render_frame', { id: 'tour', at: .5, width: 160 });
  assert.equal(result.path, path.join(root, '.runtime', 'frames', 'tour-12.png'));
  const png = await readFile(result.path);
  assert.equal(png.readUInt32BE(16), 160); assert.equal(png.readUInt32BE(20), 90);
  await rejects(tools.call('render_frame', { id: 'tour', frame: 99 }), /Frame must be 0–23/);
});
