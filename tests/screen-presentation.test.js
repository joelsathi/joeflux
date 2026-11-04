import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { evaluateRecipe } from '../packages/presets/src/recipes.js';
import { getFrameState } from '../packages/motion/src/index.js';
import { chromeLayout, CHROME_BAR } from '../packages/motion/src/spatial-stage.js';
import { screenBounds } from '../packages/motion/src/lighting.js';
import { screenSceneErrors } from '../packages/schema/src/scene.js';
import { validateProject } from '../packages/core/src/index.js';
import { createProjectTools, ToolError } from '../packages/tools/src/index.js';

const output = { width: 1920, height: 1080, fps: 24 };
const screenScene = (screen = {}, extra = {}) => ({ id: 'shot', kind: 'screen', durationFrames: 48, screen: { asset: 'screen', presentation: 'studio', ...screen }, camera: { shots: [{ at: 0 }, { at: 1 }] }, ...extra });
const planeOf = (scene, frame = 0) => evaluateRecipe(scene, frame, output).planes[0];
const close = (actual, expected) => { for (const key of Object.keys(expected)) assert.ok(Math.abs(actual[key] - expected[key]) < 1e-9, `${key}: ${actual[key]} vs ${expected[key]}`); };

test('studio defaults keep the original floating-screen geometry exactly', () => {
  const plane = planeOf(screenScene());
  assert.deepEqual(plane.rect, { x: 1920 * .13, y: 1080 * .13, width: 1920 * .74, height: 1080 * .74 });
  assert.equal(plane.pose.radius, 22);
  const explicit = planeOf(screenScene({ padding: .13, offset: [0, 0], radius: 22, shadow: 'soft', frame: 'none', lighting: { style: 'none' } }));
  assert.deepEqual(explicit, plane);
  const legacy = getFrameState({ id: 'legacy', preset: 'recorded-showcase', durationFrames: 48, params: { asset: 'screen' }, cameraMotion: { preset: 'focus-zoom', presentation: 'studio' } }, 20, output).recipe.planes[0];
  assert.deepEqual(legacy.rect, { x: 1920 * .13, y: 1080 * .13, width: 1920 * .74, height: 1080 * .74 });
  assert.equal(legacy.pose.radius, 22);
});

test('padding and offset place the floating screen; fullscreen ignores them', () => {
  close(planeOf(screenScene({ padding: .05 })).rect, { x: 96, y: 54, width: 1728, height: 972 });
  close(planeOf(screenScene({ padding: .2, offset: [.1, -.05] })).rect, { x: 1920 * .3, y: 1080 * .15, width: 1920 * .6, height: 1080 * .6 });
  close(planeOf(screenScene({ padding: 0 })).rect, { x: 0, y: 0, width: 1920, height: 1080 });
  const full = planeOf(screenScene({ presentation: 'fullscreen', padding: .2, offset: [.3, .3] }));
  assert.deepEqual(full.rect, { x: 0, y: 0, width: 1920, height: 1080 });
});

test('radius flows into the plane pose; fullscreen defaults to the camera pose radius', () => {
  assert.equal(planeOf(screenScene({ radius: 40 })).pose.radius, 40);
  assert.equal(planeOf(screenScene({ radius: 0 })).pose.radius, 0);
  assert.equal(planeOf(screenScene({ presentation: 'fullscreen' })).pose.radius, 0);
  const angled = screenScene({ presentation: 'fullscreen' }, { camera: { shots: [{ at: 0, pose: { radius: 24 } }, { at: 1, pose: { radius: 24 } }] } });
  assert.equal(planeOf(angled).pose.radius, 24);
  assert.equal(planeOf({ ...angled, screen: { ...angled.screen, radius: 8 } }).pose.radius, 8);
});

test('schema accepts the presentation fields and rejects out-of-range values', () => {
  assert.deepEqual(screenSceneErrors(screenScene({ padding: .3, offset: [-.5, .5], radius: 64, shadow: 'floating', frame: 'browser-dark', frameTitle: 'app.example.com', lighting: { style: 'floor', intensity: 1 } })), []);
  assert.deepEqual(screenSceneErrors(screenScene({ padding: 0, radius: 0, shadow: 'none', frame: 'window', lighting: { style: 'glow' } })), []);
  const invalid = { padding: .31, offset: [.6, 0], radius: 65, shadow: 'huge', frame: 'phone', frameTitle: 'x'.repeat(121), lighting: { style: 'laser' } };
  for (const [key, value] of Object.entries(invalid)) assert.match(screenSceneErrors(screenScene({ [key]: value })).join('\n'), new RegExp(`screen\\.${key}`), key);
  assert.match(screenSceneErrors(screenScene({ lighting: { style: 'glow', intensity: 1.5 } })).join('\n'), /screen\.lighting\.intensity/);
  assert.match(screenSceneErrors(screenScene({ lighting: { style: 'glow', color: 'red' } })).join('\n'), /screen\.lighting/);
  assert.match(screenSceneErrors(screenScene({ offset: [0] })).join('\n'), /screen\.offset/);
  const project = (screen) => ({ output: { ...output, audio: false }, assets: { screen: 'a.mp4' }, scenes: [screenScene(screen)] });
  assert.equal(validateProject(project({ frame: 'browser-light', lighting: { style: 'spotlight', intensity: .4 } })).valid, true);
  assert.equal(validateProject(project({ shadow: 'huge' })).valid, false);
});

test('chrome layout fits the frame in the rect and keeps the media aspect (contain) or fills it (cover)', () => {
  const rect = { x: 100, y: 50, width: 1400, height: 900 };
  const contain = chromeLayout(rect, 1280, 720, 'contain');
  close(contain.media, { width: 1400, height: 787.5 });
  close(contain.box, { x: 100, width: 1400, height: 787.5 + CHROME_BAR, y: 50 + (900 - 787.5 - CHROME_BAR) / 2 });
  const square = chromeLayout(rect, 1000, 1000);
  close(square.media, { width: 900 - CHROME_BAR, height: 900 - CHROME_BAR });
  close(square.box, { y: 50, height: 900, x: 100 + (1400 - 860) / 2 });
  const cover = chromeLayout(rect, 1280, 720, 'cover');
  assert.deepEqual(cover.box, rect);
  assert.deepEqual(cover.media, { width: 1400, height: 900 - CHROME_BAR });
});

test('lighting follows the projected screen position', () => {
  const plane = planeOf(screenScene({ offset: [.2, 0] }));
  const flat = screenBounds(plane, output);
  close(flat, { x: 1920 * .33 + 1920 * .37, y: 540, width: 1920 * .74, height: 1080 * .74 });
  const back = screenBounds({ ...plane, pose: { ...plane.pose, z: -1800 } }, output);
  close(back, { x: 960 + (flat.x - 960) / 2, y: 540, width: flat.width / 2 });
});

const clip = (root) => execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=24:d=1', '-an', '-c:v', 'libx264', path.join(root, 'assets', 'clip.mp4')]);
async function project(scenes) {
  const root = await mkdtemp(path.join(tmpdir(), 'harness screen look '));
  await mkdir(path.join(root, 'scenes')); await mkdir(path.join(root, 'assets')); clip(root);
  for (const scene of scenes) await writeFile(path.join(root, 'scenes', `${scene.id}.json`), JSON.stringify(scene, null, 2));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ name: 'Look', version: 1, output: { width: 320, height: 180, fps: 24, audio: false }, assets: { screen: 'assets/clip.mp4' }, scenes: scenes.map(({ id }) => ({ id, file: `scenes/${id}.json` })) }));
  return root;
}
const read = async (root, id) => JSON.parse(await readFile(path.join(root, 'scenes', `${id}.json`), 'utf8'));
const hero = { id: 'hero', kind: 'screen', durationFrames: 48, screen: { asset: 'screen', presentation: 'studio', backdrop: 'slate', fit: 'cover', size: 1.1, tilt: [8, -6, 0], padding: .08, offset: [.05, 0], radius: 18, shadow: 'deep', frame: 'browser-dark', frameTitle: 'app.example.com', lighting: { style: 'glow', intensity: .7 } }, camera: { shots: [{ at: 0 }, { at: .5, focus: [.3, .3], zoom: 2 }, { at: 1 }] } };
const other = { id: 'other', kind: 'screen', durationFrames: 48, screen: { asset: 'second', frame: 'window', shadow: 'none' }, camera: { shots: [{ at: 0 }] } };
const legacy = { id: 'legacy', preset: 'recorded-showcase', durationFrames: 48, params: { asset: 'screen' }, cameraMotion: { preset: 'focus-zoom', scale: 2 } };
const title = { id: 'title', preset: 'text-settle', durationFrames: 24, params: { title: 'Hello' } };
const plain = { id: 'plain', preset: 'recorded-showcase', durationFrames: 24, params: { asset: 'screen', title: 'Keep my caption' } };

test('screen_match copies the look to every other screen shot as one undo step', async () => {
  const root = await project([hero, other, title, legacy, plain]), tools = createProjectTools(root);
  const manifest = JSON.parse(await readFile(path.join(root, 'project.json'), 'utf8'));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ ...manifest, assets: { ...manifest.assets, second: 'assets/clip.mp4' } }));
  const before = Object.fromEntries(await Promise.all(['hero', 'other', 'title', 'legacy', 'plain'].map(async (id) => [id, await readFile(path.join(root, 'scenes', `${id}.json`), 'utf8')])));
  const result = await tools.call('screen_match', { id: 'hero' });
  const { _change, ...matched } = result;
  assert.deepEqual(matched, { source: 'hero', matched: ['other', 'legacy'], skipped: [{ id: 'plain', reason: 'conversion would replace captions; keep editing this scene in Classic' }] });
  assert.equal(_change.summary, 'Match every screen to hero');
  assert.ok(_change.details.includes('other · screen.frame: "window" → "browser-dark"'), _change.details.join('\n'));
  const { asset, ...look } = hero.screen;
  assert.deepEqual((await read(root, 'other')).screen, { asset: 'second', ...look });
  const converted = await read(root, 'legacy');
  assert.equal(converted.kind, 'screen'); assert.equal(converted.cameraMotion, undefined);
  assert.deepEqual(converted.screen, { asset: 'screen', ...look });
  assert.equal(converted.camera.shots.length, 4, 'camera path survives conversion');
  assert.equal(await readFile(path.join(root, 'scenes', 'title.json'), 'utf8'), before.title);
  assert.equal(await readFile(path.join(root, 'scenes', 'plain.json'), 'utf8'), before.plain);
  assert.equal(await readFile(path.join(root, 'scenes', 'hero.json'), 'utf8'), before.hero);
  assert.deepEqual((await tools.call('history_list')).entries.map((entry) => entry.summary), ['Match every screen to hero']);
  await tools.call('history_undo');
  for (const [id, text] of Object.entries(before)) assert.equal(await readFile(path.join(root, 'scenes', `${id}.json`), 'utf8'), text, `${id} restored`);
  await assert.rejects(tools.call('screen_match', { id: 'title' }), (error) => error instanceof ToolError && /not a screen shot/.test(error.message));
});

test('screen_match removes look fields the source does not set', async () => {
  const bare = { id: 'bare', kind: 'screen', durationFrames: 24, screen: { asset: 'screen', presentation: 'studio' }, camera: { shots: [{ at: 0 }] } };
  const root = await project([bare, { ...hero, screen: { ...hero.screen, asset: 'screen' } }]), tools = createProjectTools(root);
  assert.deepEqual((await tools.call('screen_match', { id: 'bare' })).matched, ['hero']);
  assert.deepEqual((await read(root, 'hero')).screen, { asset: 'screen', presentation: 'studio' });
});

test('validate warns about adjacent screen shots whose padding, size or frame differ', async () => {
  const studio = (id, screen = {}) => ({ id, kind: 'screen', durationFrames: 24, screen: { asset: 'screen', presentation: 'studio', ...screen }, camera: { shots: [{ at: 0 }] } });
  const root = await project([studio('a'), studio('b', { padding: .08, frame: 'window' }), title, studio('c', { size: 1.2 }), studio('d', { padding: .13, size: 1.2 }), { ...studio('e'), screen: { asset: 'screen', padding: .2 } }]);
  const tools = createProjectTools(root), report = await tools.call('validate');
  assert.equal(report.valid, true); assert.deepEqual(report.errors, []);
  assert.deepEqual(report.warnings, [
    'Screen shots "a" and "b" differ in padding 0.13 vs 0.08, frame none vs window; screen_match makes them consistent.',
    'Screen shots "d" and "e" differ in size 1.2 vs 1; screen_match makes them consistent.',
  ]);
  await tools.call('screen_match', { id: 'a' });
  assert.deepEqual((await tools.call('validate')).warnings, []);
});
