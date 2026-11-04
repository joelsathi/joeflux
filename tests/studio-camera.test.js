import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { startPreview } from '../packages/preview-server/src/index.js';
import { browserLaunchOptions } from '../packages/renderer/src/index.js';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'harness studio camera '));
  await mkdir(path.join(root, 'scenes')); await mkdir(path.join(root, 'assets'));
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=24:d=2', '-an', '-c:v', 'libx264', path.join(root, 'assets', 'clip.mp4')]);
  await writeFile(path.join(root, 'scenes', 'tour.json'), JSON.stringify({ id: 'tour', kind: 'screen', durationFrames: 48, screen: { asset: 'screen' }, camera: { shots: [{ at: 0 }, { at: .4, focus: [.3, .3], zoom: 2 }, { at: .7, focus: [.7, .6], zoom: 2 }, { at: 1 }] } }));
  await writeFile(path.join(root, 'scenes', 'legacy.json'), JSON.stringify({ id: 'legacy', preset: 'recorded-showcase', durationFrames: 48, params: { asset: 'screen' }, cameraMotion: { preset: 'orbit' } }));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ name: 'Studio camera', version: 1, output: { width: 640, height: 360, fps: 24, audio: false }, theme: 'navy-dark', assets: { screen: 'assets/clip.mp4' }, scenes: [{ id: 'tour', file: 'scenes/tour.json' }, { id: 'legacy', file: 'scenes/legacy.json' }] }));
  return root;
}
const scene = async (root, id) => JSON.parse(await readFile(path.join(root, 'scenes', `${id}.json`), 'utf8'));
async function eventually(check, message) {
  const deadline = Date.now() + 8000;
  for (;;) { try { return await check(); } catch (error) { if (Date.now() > deadline) throw new Error(`${message}: ${error.message}`); await new Promise((resolve) => setTimeout(resolve, 100)); } }
}

test('the studio sets easing, flow, drift and export motion blur through camera_style and scene_update', async () => {
  const root = await fixture(), preview = await startPreview(root, 0, { agents: {} }), browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 950 } }), errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(preview.url);
    await page.waitForSelector('canvas[data-rendered-scene="tour"]', { timeout: 30000 });

    await page.locator('[role="combobox"][aria-label="Easing"]').click();
    for (const label of ['Gentle', 'Snappy', 'Spring']) await page.getByRole('option', { name: label, exact: true }).waitFor();
    await page.getByRole('option', { name: 'Spring', exact: true }).click();
    await page.getByRole('listbox').waitFor({ state: 'detached' });
    await eventually(async () => assert.equal((await scene(root, 'tour')).camera.ease, 'spring'), 'easing saved');

    const flow = page.getByLabel('Flow through areas');
    await flow.check();
    await eventually(async () => assert.equal((await scene(root, 'tour')).camera.flow, true), 'flow on');
    await flow.uncheck();
    await eventually(async () => assert.equal('flow' in (await scene(root, 'tour')).camera, false), 'flow off removes the key');

    // Dragging previews locally and commits once on release.
    const drift = page.getByRole('slider', { name: 'Drift' }), track = drift.locator('xpath=ancestor::span[contains(@class, "MuiSlider-root")]');
    const box = await track.boundingBox(), y = box.y + box.height / 2;
    await page.mouse.move(box.x + 1, y); await page.mouse.down();
    await page.mouse.move(box.x + box.width * .6, y, { steps: 6 });
    await eventually(async () => assert.equal(await drift.getAttribute('aria-valuenow'), '0.6'), 'drag previews the drift');
    assert.equal('drift' in (await scene(root, 'tour')).camera, false, 'nothing saved mid-drag');
    await page.mouse.up();
    await eventually(async () => assert.equal((await scene(root, 'tour')).camera.drift, .6), 'release commits drift');
    await page.getByRole('button', { name: 'Undo' }).click();
    await eventually(async () => assert.equal('drift' in (await scene(root, 'tour')).camera, false), 'one undo step per drag');
    await drift.focus(); await page.keyboard.press('ArrowRight');
    await eventually(async () => assert.equal((await scene(root, 'tour')).camera.drift, .05), 'keyboard sets drift too');
    assert.deepEqual((await scene(root, 'tour')).camera.shots.length, 4, 'style keeps the shots');

    await page.getByRole('tab', { name: 'Look' }).click();
    const blur = page.getByLabel('Motion blur (export)');
    await page.getByText(/Motion blur is off/).waitFor();
    await blur.check();
    await eventually(async () => assert.deepEqual((await scene(root, 'tour')).motionBlur, { enabled: true, samples: 8, shutter: .5 }), 'motion blur on');
    await blur.uncheck();
    await eventually(async () => assert.deepEqual((await scene(root, 'tour')).motionBlur, { enabled: false, samples: 8, shutter: .5 }), 'motion blur off retains quality');

    await page.getByRole('button', { name: /Shot 2: legacy/ }).click();
    await page.getByRole('tab', { name: 'Camera' }).click();
    await page.getByLabel('Flow through areas').check();
    await eventually(async () => {
      const legacy = await scene(root, 'legacy');
      assert.equal(legacy.kind, 'screen'); assert.equal(legacy.cameraMotion, undefined);
      assert.equal(legacy.camera.flow, true); assert.deepEqual(legacy.camera.move, { preset: 'orbit' });
    }, 'legacy scene converts and keeps its move');
    assert.equal(await page.getByRole('button', { name: /Orbit/ }).getAttribute('aria-pressed'), 'true');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await preview.close(); }
});
