import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProject } from '../packages/core/src/index.js';
import { TEXT_TEMPLATES, textTiming } from '../packages/motion/src/text-animation.js';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { createRenderServer } from '../packages/renderer/src/server.js';
import { browserLaunchOptions } from '../packages/renderer/src/index.js';

const output = { width: 1920, height: 1080, fps: 24, audio: false };
const project = (scene) => ({ output, assets: { demo: 'assets/demo.mp4' }, scenes: [scene] });
const text = { id: 'title', preset: 'text-template', durationFrames: 120, params: { title: 'A clearer view', subtitle: 'Made for the work ahead.' } };

test('six new text motions have selectable, valid scene definitions', () => {
  for (const template of ['line-wipe', 'scale-pop', 'character-cascade', 'number-roll', 'underline-sweep', 'caption-over-screen']) {
    assert.ok(TEXT_TEMPLATES.includes(template), template);
    assert.equal(validateProject(project({ ...text, textAnimation: { template, placement: 'lower-third' } })).valid, true, template);
  }
});

test('text motion keeps a measured reading hold and validates placement', () => {
  const shortHold = { ...text, textAnimation: { template: 'line-wipe', entryFrames: 34, holdFrames: 2, exitFrames: 20 } };
  assert.equal(validateProject(project(shortHold)).valid, false);
  assert.ok(validateProject(project(shortHold)).errors.some((error) => /reading hold/.test(error)));
  assert.equal(validateProject(project({ ...text, textAnimation: { template: 'scale-pop', placement: 'outside' } })).valid, false);
  assert.ok(textTiming(text).holdFrames > 24);
});

test('screen captions are validated separately from title-card motion', () => {
  const screen = { id: 'screen', kind: 'screen', durationFrames: 96, screen: { asset: 'demo' }, camera: { shots: [{ at: 0 }] }, caption: { text: 'One clear point', placement: 'bottom', animation: 'line-wipe' } };
  assert.equal(validateProject(project(screen)).valid, true);
  assert.equal(validateProject(project({ ...screen, caption: { ...screen.caption, text: 'A'.repeat(200) } })).valid, false);
});

test('screen caption enters, holds and exits on exact render frames', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'screen caption '));
  await mkdir(path.join(root, 'assets')); await mkdir(path.join(root, 'scenes'));
  await writeFile(path.join(root, 'assets', 'demo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#21436d"/></svg>');
  const scene = { id: 'screen', kind: 'screen', durationFrames: 96, screen: { asset: 'demo', presentation: 'studio' }, camera: { shots: [{ at: 0 }] }, caption: { text: 'One clear point', placement: 'bottom', animation: 'line-wipe' } };
  await writeFile(path.join(root, 'scenes', 'screen.json'), JSON.stringify(scene));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ name: 'Caption', version: 1, output: { width: 640, height: 360, fps: 24, audio: false }, assets: { demo: 'assets/demo.svg' }, scenes: [{ id: 'screen', file: 'scenes/screen.json' }] }));
  const server = await createRenderServer(root);
  let browser;
  try {
    browser = await chromium.launch(browserLaunchOptions());
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    await page.goto(server.origin); await page.waitForFunction(() => window.joeFluxReady);
    const states = await page.evaluate(async () => {
      const result = [];
      for (const frame of [0, 30, 65, 95]) { await window.renderScene({ sceneId: 'screen', frame }); const node = document.querySelector('[data-screen-caption]'); result.push({ text: node?.textContent, opacity: Number(node?.style.opacity) }); }
      return result;
    });
    assert.deepEqual(states.map((state) => state.text), Array(4).fill('One clear point'));
    assert.ok(states[0].opacity < .05 && states[1].opacity > .9 && states[2].opacity > .9 && states[3].opacity < .05, JSON.stringify(states));
  } finally { await browser?.close(); await server.close(); }
});
