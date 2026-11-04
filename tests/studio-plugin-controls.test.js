import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { startPreview } from '../packages/preview-server/src/index.js';
import { browserLaunchOptions } from '../packages/renderer/src/index.js';

async function open({ proofAssets = false } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'studio plugin controls '));
  await mkdir(path.join(root, 'scenes'));
  await mkdir(path.join(root, 'assets'));
  const assets = proofAssets ? { proof: 'assets/proof.svg', other: 'assets/other.svg', missing: 'assets/missing.svg' } : {};
  for (const [id, color] of [['proof', '#fa3500'], ['other', '#0055ff']]) await writeFile(path.join(root, `assets/${id}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="${color}"/></svg>`);
  await writeFile(path.join(root, 'assets/missing.svg'), 'This source file is not a valid image.');
  const scenes = ['animejs', 'motion', 'threejs', 'react-three'].map(plugin => ({ id: plugin, plugin, durationFrames: 120, params: { title: plugin, subtitle: 'Custom copy' }, pluginOptions: { color: '#74e7cd', quality: 1 } }));
  for (const scene of scenes) await writeFile(path.join(root, `scenes/${scene.id}.json`), JSON.stringify(scene));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ version: 1, name: 'Plugin controls', output: { width: 640, height: 360, fps: 24, audio: false }, assets, scenes: scenes.map(scene => ({ id: scene.id, file: `scenes/${scene.id}.json` })) }));
  const preview = await startPreview(root, 0, { agents: {} }), browser = await chromium.launch(browserLaunchOptions());
  const page = await browser.newPage({ viewport: { width: 1550, height: 1000 } });
  await page.goto(preview.url); await page.waitForSelector('canvas[data-rendered-scene="animejs"]');
  return { root, page, close: async () => { await browser.close(); await preview.close(); } };
}

test('plugin inspector edits only effective copy, color, quality and timing controls', async () => {
  const { root, page, close } = await open();
  try {
    const inspector = page.getByRole('complementary', { name: 'Inspector' });
    for (const [index, id] of ['animejs', 'motion', 'threejs', 'react-three'].entries()) {
      await page.getByRole('button', { name: `Shot ${index + 1}: ${id}`, exact: true }).click();
      await expect(inspector.getByRole('tab', { name: 'Look', exact: true })).toHaveCount(0);
      await expect(inspector.getByRole('tab', { name: 'Art', exact: true })).toHaveCount(0);
      await expect(inspector.getByLabel('Eyebrow', { exact: true })).toHaveCount(0);
      await expect(inspector.getByLabel('Plugin color', { exact: true })).toBeVisible();
      await expect(inspector.getByLabel('Render quality', { exact: true })).toHaveCount(index < 2 ? 0 : 1);
    }
    await inspector.getByLabel('Title', { exact: true }).fill('My product');
    await inspector.getByLabel('Title', { exact: true }).press('Enter');
    await inspector.getByLabel('Plugin color', { exact: true }).fill('#ff5500');
    await inspector.getByLabel('Plugin color', { exact: true }).press('Tab');
    await inspector.getByLabel('Render quality', { exact: true }).click();
    await page.getByRole('option', { name: 'High · 2×' }).click();
    await inspector.getByRole('button', { name: 'Short · 3s' }).click();
    await expect.poll(async () => JSON.parse(await readFile(path.join(root, 'scenes/react-three.json'), 'utf8'))).toMatchObject({ params: { title: 'My product' }, pluginOptions: { color: '#ff5500', quality: 2 }, durationFrames: 72 });
  } finally { await close(); }
});

test('template detail renders edited inputs, applies that scene and clears a failed preview', async () => {
  const { root, page, close } = await open();
  try {
    await page.getByRole('button', { name: 'Add a shot' }).click();
    await page.getByRole('menuitem', { name: /Browse templates/ }).click();
    await page.getByRole('button', { name: 'Choose Anime.js choreography template' }).click();
    const detail = page.locator('.template-detail-pane'), canvas = detail.locator('canvas');
    await expect(canvas).toHaveAttribute('data-rendered-scene', 'preview-plugin-animejs');
    const initial = await canvas.evaluate(node => node.toDataURL());
    await detail.getByLabel('title', { exact: true }).fill('The real edited title');
    await detail.getByLabel('subtitle', { exact: true }).fill('');
    await detail.getByLabel('Template color', { exact: true }).fill('#ff5500');
    await detail.getByRole('button', { name: 'long · 7s' }).click();
    await expect.poll(() => canvas.evaluate(node => node.toDataURL())).not.toBe(initial);
    await expect(canvas).toHaveAttribute('data-rendered-frame', '92');
    await expect(detail.getByLabel('Theme', { exact: true })).toHaveCount(0);
    const previewPixels = await canvas.evaluate(node => node.toDataURL());
    await page.getByRole('button', { name: 'Add shot', exact: true }).click();
    await expect.poll(async () => JSON.parse(await readFile(path.join(root, 'project.json'), 'utf8')).scenes.length).toBe(5);
    const added = JSON.parse(await readFile(path.join(root, 'scenes/plugin-animejs-1.json'), 'utf8'));
    assert.equal(added.pluginOptions.color, '#ff5500'); assert.equal(added.durationFrames, 168);
    assert.deepEqual(added.params, { title: 'The real edited title', subtitle: '' });
    const appliedPixels = await page.evaluate(async ({ scene, rendererUrl }) => {
      const { createSceneRenderer } = await import(rendererUrl);
      const render = createSceneRenderer({ output: { width: 480, height: 270, fps: 24 }, assets: {} });
      const target = document.createElement('canvas');
      try { await render(target, scene, 92); return target.toDataURL(); } finally { await render.dispose(); }
    }, { scene: added, rendererUrl: `/@fs${path.resolve('packages/renderer/src/browser-scene.js')}` });
    assert.equal(previewPixels, appliedPixels, 'detail preview matches the applied scene at the same frame and output size');
    await page.getByRole('button', { name: 'Add a shot' }).click();
    await page.getByRole('menuitem', { name: /Browse templates/ }).click();
    await page.getByRole('button', { name: 'Choose Focus tour template' }).click();
    await expect(detail.getByRole('alert')).toContainText(/needs asset/);
    await expect(detail.locator('canvas.is-live')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add shot', exact: true })).toBeDisabled();
  } finally { await close(); }
});

test('template detail follows the selected proof asset and hides stale media when decoding fails', async () => {
  const { page, close } = await open({ proofAssets: true });
  try {
    await page.getByRole('button', { name: 'Add a shot' }).click();
    await page.getByRole('menuitem', { name: /Browse templates/ }).click();
    await page.getByRole('button', { name: 'Choose Focus tour template' }).click();
    const detail = page.locator('.template-detail-pane'), preview = detail.locator('.template-preview');
    await expect(preview.locator('canvas[data-asset="proof"]')).toBeVisible();
    const before = await preview.screenshot();
    await detail.getByLabel('asset', { exact: true }).click();
    await page.getByRole('option', { name: 'other · other.svg', exact: true }).click();
    await expect(preview.locator('canvas[data-asset="other"]')).toBeVisible();
    assert.notDeepEqual(await preview.screenshot(), before, 'changed proof media is rendered');
    await detail.getByLabel('asset', { exact: true }).click();
    await page.getByRole('option', { name: 'missing · missing.svg', exact: true }).click();
    await expect(detail.getByRole('alert')).toContainText('Could not decode asset missing');
    await expect(preview.locator('canvas[data-asset="other"]')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Add shot', exact: true })).toBeDisabled();
  } finally { await close(); }
});
