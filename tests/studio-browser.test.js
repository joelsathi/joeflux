import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { startPreview } from '../packages/preview-server/src/index.js';
import { AGENTS } from '../packages/agents/src/index.js';
import { browserLaunchOptions } from '../packages/renderer/src/index.js';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'harness studio '));
  await mkdir(path.join(root, 'scenes')); await mkdir(path.join(root, 'assets'));
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=24:d=2', '-an', '-c:v', 'libx264', path.join(root, 'assets', 'clip.mp4')]);
  await writeFile(path.join(root, 'scenes', 'tour.json'), JSON.stringify({ id: 'tour', kind: 'screen', durationFrames: 48, screen: { asset: 'screen' }, camera: { shots: [{ at: 0 }, { at: .5, focus: [.3, .3], zoom: 2 }, { at: 1 }] } }));
  await writeFile(path.join(root, 'scenes', 'legacy.json'), JSON.stringify({ id: 'legacy', preset: 'recorded-showcase', durationFrames: 48, params: { asset: 'screen' }, cameraMotion: { preset: 'orbit' } }));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ name: 'Studio test', version: 1, output: { width: 640, height: 360, fps: 24, audio: false }, theme: 'navy-dark', assets: { screen: 'assets/clip.mp4' }, scenes: [{ id: 'tour', file: 'scenes/tour.json' }, { id: 'legacy', file: 'scenes/legacy.json' }] }));
  return root;
}
const scene = async (root, id) => JSON.parse(await readFile(path.join(root, 'scenes', `${id}.json`), 'utf8'));
const manifest = async (root) => JSON.parse(await readFile(path.join(root, 'project.json'), 'utf8'));
async function eventually(check, message) {
  const deadline = Date.now() + 8000;
  for (;;) { try { return await check(); } catch (error) { if (Date.now() > deadline) throw new Error(`${message}: ${error.message}`); await new Promise((resolve) => setTimeout(resolve, 100)); } }
}
async function open(root, options) {
  const preview = await startPreview(root, 0, options), browser = await chromium.launch(browserLaunchOptions());
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } }), errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(preview.url);
  await page.waitForSelector('canvas[data-rendered-scene="tour"]', { timeout: 30000 });
  return { page, errors, close: async () => { await browser.close(); await preview.close(); } };
}

test('the studio edits shots through tools, with undo, and follows outside edits', async () => {
  const root = await fixture(), { page, errors, close } = await open(root, { agents: {} });
  try {
    await page.getByRole('button', { name: /Detail pan/ }).click();
    await eventually(async () => assert.equal((await scene(root, 'tour')).camera.shots.length, 6), 'detail pan applied');
    await page.getByRole('button', { name: 'Undo' }).click();
    await eventually(async () => assert.equal((await scene(root, 'tour')).camera.shots.length, 3), 'undo restores shots');
    // The shortcut reads the Studio's history, which refreshes after the undo lands on disk.
    await page.waitForSelector('button[aria-label="Redo"]:not([disabled])');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await eventually(async () => assert.equal((await scene(root, 'tour')).camera.shots.length, 6), 'keyboard redo');

    await page.getByRole('tab', { name: 'Screen' }).click();
    await page.getByRole('button', { name: 'Floating' }).click();
    await eventually(async () => assert.deepEqual((await scene(root, 'tour')).screen, { asset: 'screen', presentation: 'studio', tilt: [14, -9, -3], backdrop: 'paper', fit: 'cover' }), 'floating screen');
    await page.getByRole('tab', { name: 'Look' }).click();
    await page.getByRole('button', { name: 'Short · 3s' }).click();
    await eventually(async () => assert.equal((await scene(root, 'tour')).durationFrames, 72), 'duration preset');
    await page.getByRole('radio', { name: /Default · light/ }).click();
    await eventually(async () => assert.equal((await scene(root, 'tour')).theme, 'oxygen-wso2-light'), 'theme swatch');

    await page.getByRole('button', { name: /Shot 2: legacy/ }).click();
    await page.getByRole('tab', { name: 'Screen' }).click();
    await page.getByRole('button', { name: 'Slate' }).click();
    await eventually(async () => { const legacy = await scene(root, 'legacy'); assert.equal(legacy.kind, 'screen'); assert.equal(legacy.screen.backdrop, 'slate'); assert.equal(legacy.cameraMotion, undefined); }, 'legacy scene converts on first edit');

    await page.getByRole('button', { name: 'Add a shot' }).click();
    await page.getByRole('menuitem', { name: /Title card/ }).click();
    await eventually(async () => assert.deepEqual((await manifest(root)).scenes.map((entry) => entry.id), ['tour', 'legacy', 'title-1']), 'title card inserted after the selection');
    const title = page.getByLabel('Title', { exact: true });
    await title.fill('Ship faster'); await title.press('Enter');
    await eventually(async () => assert.equal((await scene(root, 'title-1')).params.title, 'Ship faster'), 'title saved');
    await page.getByRole('button', { name: /Word stagger/ }).click();
    await eventually(async () => assert.equal((await scene(root, 'title-1')).textAnimation.template, 'word-stagger'), 'text animation');

    await page.getByRole('button', { name: 'Actions for Ship faster' }).click();
    await page.getByRole('menuitem', { name: 'Move left' }).click();
    await eventually(async () => assert.deepEqual((await manifest(root)).scenes.map((entry) => entry.id), ['tour', 'title-1', 'legacy']), 'move left');
    await page.getByRole('button', { name: 'Actions for Ship faster' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await eventually(async () => assert.equal(existsSync(path.join(root, 'scenes', 'title-1.json')), false), 'deleted');
    await page.getByRole('button', { name: 'Undo' }).click();
    await eventually(async () => assert.equal((await scene(root, 'title-1')).params.title, 'Ship faster'), 'undo delete');

    await writeFile(path.join(root, 'scenes', 'tour.json'), JSON.stringify({ ...(await scene(root, 'tour')), durationFrames: 120 }));
    await eventually(async () => assert.match(await page.getByRole('button', { name: /Shot 1: tour/ }).innerText(), /5s/), 'outside edit reaches the strip');
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test('the director chat streams agent tool calls, and sign-in uses the CLI', async () => {
  const root = await fixture(), marker = path.join(root, '.signed-in');
  const fake = { ...AGENTS.claude, label: 'Claude Code', command: process.execPath, args: async (options) => [path.resolve('tests/fixtures/fake-agent.mjs'), ...await AGENTS.claude.args(options)],
    status: { args: ['-e', `process.stdout.write(require('fs').existsSync(${JSON.stringify(marker)}) ? '{"loggedIn":true,"email":"t@example.test"}' : '{"loggedIn":false}')`], parse: AGENTS.claude.status.parse },
    login: ['-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, '1'); console.log('Opening https://claude.ai/login')`] };
  const { page, errors, close } = await open(root, { agents: { claude: fake } });
  try {
    await page.getByRole('button', { name: 'Sign in with Claude' }).click();
    const input = page.getByLabel('Message the director');
    await input.waitFor();
    await input.fill(JSON.stringify({ tool: 'scene_update', arguments: { id: 'tour', patch: { durationFrames: 96 } } }));
    await input.press('Enter');
    await page.getByRole('button', { name: /Edited a shot · tour/ }).waitFor();
    await page.getByLabel('Done').waitFor();
    await page.getByText('Done.', { exact: true }).waitFor();
    await eventually(async () => assert.equal((await scene(root, 'tour')).durationFrames, 96), 'agent edit saved');
    await eventually(async () => assert.match(await page.getByRole('button', { name: /Shot 1: tour/ }).innerText(), /4s/), 'agent edit reaches the strip');
    assert.match(await page.getByRole('button', { name: 'Undo', exact: true }).getAttribute('aria-label'), /Undo/);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await eventually(async () => assert.equal((await scene(root, 'tour')).durationFrames, 48), 'agent edit is undoable from the studio');
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test('areas are drawn, moved and removed directly on the stage; the tilt pad and move cards drive the camera', async () => {
  const root = await fixture(), { page, errors, close } = await open(root, { agents: {} });
  try {
    await page.getByRole('button', { name: 'Frame areas', exact: true }).click();
    const overlay = page.locator('.frame-overlay');
    await overlay.waitFor();
    const box = await overlay.boundingBox(), at = (x, y) => [box.x + box.width * x, box.y + box.height * y];
    await page.mouse.move(...at(.6, .55)); await page.mouse.down(); await page.mouse.move(...at(.75, .7), { steps: 4 }); await page.mouse.move(...at(.9, .85), { steps: 4 }); await page.mouse.up();
    await eventually(async () => {
      const { shots } = (await scene(root, 'tour')).camera;
      assert.equal(shots.length, 5);
      assert.deepEqual(shots.filter((shot) => shot.focus).map((shot) => shot.focus).at(-1).map((v) => Math.round(v * 100)), [75, 70]);
    }, 'drawn area becomes a second stop');
    const before = (await scene(root, 'tour')).camera.shots.map((shot) => shot.at);
    const area = page.getByRole('group', { name: /Area 2,/ }), areaBox = await area.boundingBox();
    await page.mouse.move(areaBox.x + areaBox.width / 2, areaBox.y + areaBox.height / 2); await page.mouse.down();
    await page.mouse.move(areaBox.x + areaBox.width / 2 - box.width * .2, areaBox.y + areaBox.height / 2, { steps: 5 }); await page.mouse.up();
    await eventually(async () => {
      const { shots } = (await scene(root, 'tour')).camera;
      assert.deepEqual(shots.map((shot) => shot.at), before, 'moving keeps timing');
      assert.ok(Math.abs(shots.at(-2).focus[0] - .55) < .03, `moved to ${shots.at(-2).focus[0]}`);
    }, 'moved area');
    await page.getByRole('group', { name: /Area 1,/ }).focus();
    await page.keyboard.press('Delete');
    await eventually(async () => assert.equal((await scene(root, 'tour')).camera.shots.filter((shot) => shot.focus).length, 2), 'deleted area leaves one stop (arrive + hold)');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: /Orbit/ }).click();
    await eventually(async () => assert.deepEqual((await scene(root, 'tour')).camera.move, { preset: 'orbit', strength: 1 }), 'orbit applied');
    await eventually(async () => assert.equal(await page.getByRole('button', { name: /Orbit/ }).getAttribute('aria-pressed'), 'true'), 'orbit selection reaches the UI');
    await page.getByRole('slider', { name: 'Intensity' }).focus(); await page.keyboard.press('ArrowLeft');
    await eventually(async () => assert.equal((await scene(root, 'tour')).camera.move.strength, .95), 'intensity re-applies the move');

    await page.getByRole('tab', { name: 'Screen' }).click();
    await page.getByRole('button', { name: 'Floating' }).click();
    const pad = page.getByRole('slider', { name: 'Tilt pad' });
    await pad.waitFor();
    const padBox = await pad.boundingBox();
    await page.mouse.move(padBox.x + padBox.width / 2, padBox.y + padBox.height / 2); await page.mouse.down();
    await page.mouse.move(padBox.x + padBox.width - 1, padBox.y + padBox.height / 2, { steps: 5 }); await page.mouse.up();
    await eventually(async () => { const [x, y] = (await scene(root, 'tour')).screen.tilt; assert.ok(Math.abs(x) <= 1 && y > 33, `tilt ${x}, ${y}`); }, 'tilt pad');
    await pad.dblclick();
    await eventually(async () => assert.deepEqual((await scene(root, 'tour')).screen.tilt.slice(0, 2), [0, 0]), 'double-click resets tilt');
    assert.deepEqual(errors, []);
  } finally { await close(); }
});
