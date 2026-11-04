import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { startPreview } from '../packages/preview-server/src/index.js';
import { browserLaunchOptions } from '../packages/renderer/src/index.js';
import { createProjectTools } from '../packages/tools/src/index.js';
import { AGENTS } from '../packages/agents/src/index.js';

const roots = [];
test.after(() => Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))));
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'studio hardening ')); roots.push(root);
  await mkdir(path.join(root, 'scenes')); await mkdir(path.join(root, 'assets'));
  await writeFile(path.join(root, 'assets/screen.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#345"/></svg>');
  const scenes = [{ id: 'title', preset: 'text-settle', durationFrames: 48, params: { title: 'Original title' }, transition: { type: 'crossfade', frames: 6 } }, { id: 'screen', kind: 'screen', durationFrames: 48, screen: { asset: 'screen' }, camera: { shots: [{ at: 0 }] }, caption: { text: 'Default glass' } }];
  for (const scene of scenes) await writeFile(path.join(root, `scenes/${scene.id}.json`), JSON.stringify(scene));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ name: 'Hardening', version: 1, output: { width: 320, height: 180, fps: 12, audio: false }, assets: { screen: 'assets/screen.svg' }, scenes: scenes.map(({ id }) => ({ id, file: `scenes/${id}.json` })) }));
  return root;
}

test('variation errors can retry and stale choices preserve edits made while the dialog is open', { timeout: 60000 }, async () => {
  const root = await fixture(), preview = await startPreview(root, 0, { agents: {} }), browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    let fail = true;
    await page.route('**/api/tools/variation_generate', route => { if (fail) { fail = false; return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Could not render preview' }) }); } return route.continue(); });
    await page.goto(preview.url); await page.waitForSelector('canvas[data-rendered-scene="title"]');
    await page.getByRole('tab', { name: 'Look', exact: true }).click();
    await page.getByRole('button', { name: 'Explore three looks' }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Could not render preview');
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.locator('.variation-card')).toHaveCount(3, { timeout: 30000 });
    const tools = createProjectTools(root);
    await tools.call('scene_update', { id: 'title', patch: { params: { title: 'New external title' } } });
    await page.waitForFunction(() => document.querySelector('[aria-label="Shot 1: New external title"]'));
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText(/changed after these looks/i);
    for (const card of await page.locator('.variation-card').all()) await expect(card).toBeDisabled();
    assert.equal(JSON.parse(await readFile(path.join(root, 'scenes/title.json'), 'utf8')).params.title, 'New external title');
    await page.getByRole('button', { name: 'Refresh looks' }).click();
    await expect(page.locator('.variation-card')).toHaveCount(3, { timeout: 30000 });
    await page.locator('.variation-card').first().click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    assert.equal(JSON.parse(await readFile(path.join(root, 'scenes/title.json'), 'utf8')).params.title, 'New external title');
  } finally { await browser.close(); await preview.close(); }
});

test('all five screen inspector tabs fit and are reachable at desktop and laptop sizes', async () => {
  const root = await fixture(), preview = await startPreview(root, 0, { agents: {} }), browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage(); await page.goto(preview.url);
    await page.getByRole('button', { name: 'Shot 2: screen', exact: true }).click();
    for (const width of [1440, 1280, 1024]) {
      await page.setViewportSize({ width, height: 800 });
      for (const label of ['Camera', 'Screen', 'Text', 'Look', 'Art']) {
        const tab = page.getByRole('tab', { name: label, exact: true });
        const visible = await tab.evaluate(node => { const tab = node.getBoundingClientRect(), panel = node.closest('aside').getBoundingClientRect(); return tab.left >= panel.left && tab.right <= panel.right; });
        assert.equal(visible, true, `${label} fits at ${width}px`);
        await tab.click(); await expect(tab).toHaveAttribute('aria-selected', 'true');
      }
      await page.getByRole('tab', { name: 'Camera', exact: true }).focus(); await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('tab', { name: 'Screen', exact: true })).toBeFocused();
    }
  } finally { await browser.close(); await preview.close(); }
});

const fake = { ...AGENTS.claude, status: undefined, login: undefined, label: 'Fake', command: process.execPath, args: async (options) => [path.resolve('tests/fixtures/fake-agent.mjs'), ...await AGENTS.claude.args(options)] };
const title = async (root) => JSON.parse(await readFile(path.join(root, 'scenes/title.json'), 'utf8')).durationFrames;

test('chat cards summarize each change and undo only while it is the latest', { timeout: 60000 }, async () => {
  const root = await fixture(), preview = await startPreview(root, 0, { agents: { fake } }), browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), tools = createProjectTools(root);
    await page.goto(preview.url);
    const input = page.getByLabel('Message the director');
    await input.fill(JSON.stringify({ tool: 'scene_update', arguments: { id: 'title', patch: { durationFrames: 60 } } })); await input.press('Enter');
    const card = page.locator('.change-summary');
    await expect(card).toContainText('Edit title');
    await expect(card).toContainText('title · durationFrames: 48 → 60');
    await expect(card.getByRole('button', { name: 'Undo this change' })).toBeVisible();
    await tools.call('scene_update', { id: 'title', patch: { durationFrames: 72 } });
    await expect(card).toContainText('Later changes follow');
    await expect(card.getByRole('button', { name: 'Undo this change' })).toHaveCount(0);
    await tools.call('history_undo');
    await card.getByRole('button', { name: 'Undo this change' }).click();
    await expect(card).toContainText('Undone');
    assert.equal(await title(root), 48);
  } finally { await browser.close(); await preview.close(); }
});

test('transition preview renders the boundary in a dialog; captions and look controls say what they do', { timeout: 90000 }, async () => {
  const root = await fixture(), preview = await startPreview(root, 0, { agents: {} }), browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(preview.url); await page.waitForSelector('canvas[data-rendered-scene="title"]');
    await page.getByRole('tab', { name: 'Look', exact: true }).click();
    await expect(page.getByLabel('Soft focus')).toBeVisible();
    await page.getByRole('button', { name: 'Preview transition' }).click();
    const video = page.getByRole('dialog').locator('video');
    await expect(video).toBeVisible({ timeout: 60000 });
    await expect(page.getByRole('dialog')).toContainText('Crossfade over 6 frames (0.5 s), starting at 1 s.');
    await page.waitForFunction(() => document.querySelector('.transition-video')?.readyState >= 2);
    assert.equal(await video.evaluate((node) => node.videoWidth), 320);
    await createProjectTools(root).call('project_update', { theme: 'navy-dark' });
    await expect(page.getByRole('dialog')).toContainText('These shots changed after this preview was rendered');
    await page.getByRole('button', { name: 'Render again', exact: true }).click();
    // The previous video can remain visible until the render effect clears it.
    // Observe that new render starting before waiting for its completed video.
    await expect(page.getByRole('button', { name: 'Render again', exact: true })).toBeDisabled();
    await expect(video).toBeVisible({ timeout: 60000 });
    await expect(page.getByRole('button', { name: 'Render again', exact: true })).toBeEnabled();
    await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0);
    await createProjectTools(root).call('scene_update', { id: 'screen', patch: { screen: { backdrop: 'slate' } } });
    await expect(page.getByRole('dialog')).toContainText('These shots changed after this preview was rendered');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Shot 2: screen', exact: true }).click();
    await page.getByRole('tab', { name: 'Look', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Preview transition' })).toBeDisabled();
    await page.getByRole('tab', { name: 'Text', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Glass', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(/Reading hold: 2\.6s · minimum 1\.0s/)).toBeVisible();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await preview.close(); }
});
