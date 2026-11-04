import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { startPreview } from '../packages/preview-server/src/index.js';
import { browserLaunchOptions } from '../packages/renderer/src/index.js';

async function eventually(check) {
  for (let i = 0; i < 80; i++) { try { return await check(); } catch (error) { if (i === 79) throw error; await new Promise(resolve => setTimeout(resolve, 100)); } }
}
test('Studio trims, skips and holds actual source frames with undo, and reviews a film from the shot with retry and stale detection', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'playback-studio-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'scenes')); await mkdir(path.join(root, 'assets'));
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30:d=2', '-an', '-c:v', 'libx264', path.join(root, 'assets/clip.mp4')]);
  const source = { id: 'source', kind: 'screen', durationFrames: 48, screen: { asset: 'clip' }, camera: { shots: [{ at: 0 }, { at: .5, focus: [.3, .3], zoom: 2 }, { at: 1 }] } };
  const title = { id: 'intro', preset: 'text-settle', durationFrames: 12, theme: 'navy-dark', params: { title: '' }, transition: { type: 'crossfade', frames: 4 } };
  const file = path.join(root, 'scenes/source.json');
  await writeFile(file, JSON.stringify(source)); await writeFile(path.join(root, 'scenes/intro.json'), JSON.stringify(title));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ version: 1, name: 'Playback test', output: { width: 320, height: 180, fps: 24, audio: false }, assets: { clip: 'assets/clip.mp4' }, scenes: [{ id: 'intro', file: 'scenes/intro.json' }, { id: 'source', file: 'scenes/source.json' }] }));
  const preview = await startPreview(root, 0, { agents: {} }), browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(preview.url); await page.waitForSelector('canvas[data-rendered-scene="intro"]');
    await page.getByRole('button', { name: 'Shot 2: source', exact: true }).click();
    // Source controls live beside the recording's screen controls.
    await page.getByRole('tab', { name: 'Screen', exact: true }).click();
    await page.getByRole('button', { name: 'Next source frame', exact: true }).click();
    assert.equal(await page.locator('.source-moments img').getAttribute('alt'), 'Source frame 1 at 0.0333 seconds');
    await page.getByRole('button', { name: 'Previous source frame', exact: true }).click();
    await page.getByLabel('Source start (seconds)', { exact: true }).fill('0.25');
    await page.getByLabel('Source end (seconds)', { exact: true }).fill('1.75');
    await page.getByRole('button', { name: 'Apply source trim', exact: true }).click();
    const read = async () => JSON.parse(await readFile(file, 'utf8'));
    await eventually(async () => assert.equal((await read()).durationFrames, 36));
    await page.getByLabel('Waiting start (seconds)', { exact: true }).fill('0.5');
    await page.getByLabel('Waiting end (seconds)', { exact: true }).fill('1');
    await page.getByRole('button', { name: 'Skip waiting', exact: true }).click();
    await eventually(async () => assert.equal((await read()).durationFrames, 24));
    const slider = page.getByRole('slider', { name: 'Source frame', exact: true });
    await slider.focus(); await page.keyboard.press('Home'); for (let i = 0; i < 45; i++) await page.keyboard.press('ArrowRight');
    await page.getByLabel('Result hold (frames)', { exact: true }).fill('12');
    await page.getByRole('button', { name: 'Hold this result', exact: true }).click();
    await eventually(async () => { const saved = await read(); assert.equal(saved.playback.moments.at(-1).type, 'hold'); assert.deepEqual(saved.camera, source.camera); });
    for (const duration of [24, 36, 48]) { await page.getByRole('button', { name: 'Undo', exact: true }).click(); await eventually(async () => assert.equal((await read()).durationFrames, duration)); }
    let fail = true;
    await page.route('**/api/tools/film_preview', async route => {
      if (fail) { fail = false; await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Review render failed for retry test.' }) }); }
      else await route.continue();
    });
    await page.getByRole('button', { name: 'Play from this shot', exact: true }).click();
    await page.getByText('Review render failed for retry test.', { exact: true }).waitFor();
    const response = page.waitForResponse(value => value.url().endsWith('/api/tools/film_preview') && value.ok());
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    const result = await (await response).json();
    assert.equal(result.startOffsets.source, 8); assert.equal(result.totalFrames, 56);
    await page.getByRole('button', { name: 'Pause film', exact: true }).click();
    assert.equal(await page.locator('video[aria-label="Film review"]').getAttribute('controls'), null, 'silent review has no audio controls');
    await page.getByRole('button', { name: 'Back to review start', exact: true }).click();
    await eventually(async () => assert.ok(Math.abs(await page.locator('video[aria-label="Film review"]').evaluate(video => video.currentTime) - 8 / 24) < .001));
    await writeFile(file, JSON.stringify({ ...source, screen: { asset: 'clip', presentation: 'studio' } }));
    await page.getByText('The film changed after this preview was rendered. Render again to review the current version.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await preview.close(); }
});
