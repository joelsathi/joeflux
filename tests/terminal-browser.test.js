import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { createRenderServer } from '../packages/renderer/src/server.js';
import { browserLaunchOptions } from '../packages/renderer/src/index.js';
import { listTemplates, instantiateTemplate } from '../packages/presets/src/templates.js';

test('terminal palettes render offline at preview sizes and three formats, with deterministic scroll and disposal', { timeout: 60000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'terminal-browser-'));
  const templates = await listTemplates();
  const scenes = ['dark', 'light'].map(palette => instantiateTemplate(templates.find(item => item.id === `terminal-${palette}`), { id: palette, duration: 'long' }));
  const project = { version: 1, name: 'Terminal', output: { width: 640, height: 360, fps: 24, audio: false }, assets: {}, scenes };
  await writeFile(path.join(root, 'project.json'), JSON.stringify(project));
  const server = await createRenderServer(root), browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage(), errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      if (!route.request().url().startsWith(server.origin)) { external.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    await page.goto(server.origin); await page.waitForFunction(() => window.joeFluxReady);
    for (const [width, height] of [[240, 135], [480, 270], [640, 360], [480, 480], [360, 640]]) {
      const result = await page.evaluate(async ({ project, width, height }) => {
        const { createSceneRenderer } = await import('/packages/renderer/src/browser-scene.js');
        project.output = { ...project.output, width, height };
        const render = createSceneRenderer(project), canvas = document.createElement('canvas'), frames = [];
        for (const scene of project.scenes) {
          await render(canvas, scene, 33.5); const early = canvas.toDataURL();
          await render(canvas, scene, 340); const late = canvas.toDataURL();
          await render(canvas, scene, 0); await render(canvas, scene, 33.5);
          frames.push({ same: early === canvas.toDataURL(), moves: early !== late, early });
        }
        const scrolling = structuredClone(project.scenes[0]);
        scrolling.components[0].inputs.transcript = '$ echo results\n' + Array.from({ length: 34 }, (_, i) => `Result ${i + 1}: ready`).join('\n');
        scrolling.components[0].inputs.secondTranscript = '';
        await render(canvas, scrolling, 113.5); const scroll = canvas.toDataURL();
        await render(canvas, scrolling, 340); await render(canvas, scrolling, 113.5);
        const scrollSame = scroll === canvas.toDataURL();
        await render.dispose();
        return { same: frames.every(item => item.same), moves: frames.every(item => item.moves), palettesDiffer: frames[0].early !== frames[1].early, scrollSame };
      }, { project, width, height });
      assert.deepEqual(result, { same: true, moves: true, palettesDiffer: true, scrollSame: true });
    }
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
  } finally { await browser.close(); await server.close(); }
});
