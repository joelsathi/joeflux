import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createProjectTools } from '../packages/tools/src/index.js';
import { sceneFingerprint } from '../packages/renderer/src/render.js';
import { createRenderServer } from '../packages/renderer/src/server.js';
import { browserLaunchOptions } from '../packages/renderer/src/index.js';
import { chromium } from '@playwright/test';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'harness backgrounds '));
  await mkdir(path.join(root, 'scenes'));
  await writeFile(path.join(root, 'scenes', 'title.json'), JSON.stringify({ id: 'title', preset: 'text-template', durationFrames: 72, params: { title: 'A better view' } }));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ name: 'Backgrounds', version: 1, output: { width: 640, height: 360, fps: 24, audio: false }, assets: {}, scenes: [{ id: 'title', file: 'scenes/title.json' }] }));
  return root;
}

test('brand kit backgrounds list safe artwork with paired text and accent tokens', async () => {
  const tools = createProjectTools(await fixture());
  const entries = await tools.call('background_list');
  assert.ok(entries.length >= 2);
  assert.ok(entries.every((item) => item.id && item.file && item.mode && item.colors?.length && item.safeArea && item.theme));
  assert.ok(entries.some((item) => item.id === 'example/aurora'));
});

test('applying a background changes the image and paired theme in one undoable action', async () => {
  const root = await fixture(), tools = createProjectTools(root);
  await tools.call('background_apply', { id: 'title', background: 'example/aurora' });
  const saved = JSON.parse(await readFile(path.join(root, 'scenes/title.json'), 'utf8'));
  assert.equal(saved.background.image, 'example/aurora');
  assert.equal(saved.theme, 'background-example-aurora');
  assert.equal((await tools.call('validate')).valid, true);
  assert.equal((await tools.call('history_list')).entries.length, 1);
  await tools.call('history_undo');
  assert.equal(JSON.parse(await readFile(path.join(root, 'scenes/title.json'), 'utf8')).background, undefined);
  await assert.rejects(tools.call('background_apply', { id: 'title', background: 'example/nope' }), /Unknown background/);
});

test('render fingerprint includes the selected library background', async () => {
  const root = await fixture(), tools = createProjectTools(root);
  await tools.call('background_apply', { id: 'title', background: 'example/aurora' });
  const scene = JSON.parse(await readFile(path.join(root, 'scenes/title.json'), 'utf8'));
  const project = { root, output: { width: 640, height: 360, fps: 24 }, assets: {} };
  const first = await sceneFingerprint(project, scene);
  assert.equal(typeof first, 'string');
  assert.notEqual(await sceneFingerprint(project, { ...scene, background: { style: 'static' } }), first);
});

test('the export frame actually paints a selected library background', async () => {
  const root = await fixture(), tools = createProjectTools(root);
  await tools.call('background_apply', { id: 'title', background: 'example/aurora' });
  const server = await createRenderServer(root);
  let browser;
  try {
    browser = await chromium.launch(browserLaunchOptions());
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(server.origin);
    await page.waitForFunction(() => window.joeFluxReady, undefined, { timeout: 3000 }).catch(() => { throw new Error(`Renderer not ready: ${errors.join('; ')}`); });
    const pixel = await page.evaluate(async () => {
      await window.renderScene({ sceneId: 'title', frame: 35 });
      return [...document.querySelector('#frame').getContext('2d').getImageData(6, 6, 1, 1).data];
    });
    assert.ok(pixel[0] < 90 && pixel[1] < 90 && pixel[2] > pixel[1], `violet-tinted dark aurora corner: ${pixel}`);
  } finally { await browser?.close(); await server.close(); }
});
