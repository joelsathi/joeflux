import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createRenderServer } from '../packages/renderer/src/server.js';
import { browserLaunchOptions } from '../packages/renderer/src/index.js';
const projectPath = new URL('../projects/animation-plugin-gallery', import.meta.url).pathname;

test('plugin copy wraps long and unbroken inputs inside safe margins with uniform glyph proportions', { timeout: 60000 }, async () => {
  const server = await createRenderServer(projectPath), browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage(); await page.goto(server.origin); await page.waitForFunction(() => window.joeFluxReady);
    await page.evaluate(() => window.renderScene({ sceneId: 'animejs', frame: 0 }));
    const cases = await page.evaluate(async () => {
      const { createPlugin } = await import('/animation-plugins/runtime.js');
      const results = [];
      for (const [width, height] of [[1920, 1080], [1080, 1080], [1080, 1920]]) {
        for (const [title, subtitle] of [
          ['A considered composition for every story and every screen size', 'Readable typography stays inside the frame across landscape, square, and portrait delivery formats.'],
          ['W'.repeat(64), 'W'.repeat(100)],
          ['A deliberate\nline break', ''],
          ['', ''],
        ]) {
          const canvas = document.createElement('canvas'), context = canvas.getContext('2d'), calls = [];
          const fillText = context.fillText.bind(context);
          context.fillText = function (text, x, y, ...rest) {
            const m = this.getTransform(), metrics = this.measureText(text), top = this.textBaseline === 'top' ? y : y - metrics.actualBoundingBoxAscent;
            calls.push({ text, compressed: rest.length > 0, sx: m.a, sy: m.d,
              left: x * m.a + m.e, right: (x + metrics.width) * m.a + m.e,
              top: top * m.d + m.f, bottom: (top + Number(this.font.match(/[\d.]+(?=px)/)[0]) * 1.25) * m.d + m.f });
            return fillText(text, x, y, ...rest);
          };
          const input = { canvas, context, output: { width, height, fps: 24 }, scene: { params: { title, subtitle } } };
          const instance = await createPlugin('animejs', input); await instance.render(72); instance.dispose();
          results.push({ width, height, title, subtitle, calls });
        }
      }
      return results;
    });
    for (const specimen of cases) {
      const { width, height, title, subtitle, calls } = specimen;
      assert.ok(calls.every(call => Math.abs(call.sx - call.sy) < 1e-9 && !call.compressed), `${width}×${height}: glyphs must not stretch`);
      assert.ok(calls.every(call => call.left >= width * .05 && call.right <= width * .95 && call.top >= height * .04 && call.bottom <= height * .96), `${width}×${height}: copy must stay inside safe margins`);
      const written = calls.slice(1).map(call => call.text).join('').replace(/\s/g, '');
      assert.equal(written, (title + subtitle).replace(/\s/g, ''), 'copy is wrapped without dropping characters or filling blank slots');
      if (title.includes('\n')) assert.ok(calls.some(call => call.text === 'A deliberate') && calls.some(call => call.text === 'line break'));
    }
  } finally { await browser.close(); await server.close(); }
});

test('four plugin engines reflow in three formats and repeat after backward and fractional seeks', { timeout: 60000 }, async () => {
  const server = await createRenderServer(projectPath), browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage(); await page.goto(server.origin); await page.waitForFunction(() => window.joeFluxReady);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const results = await page.evaluate(async () => {
      const { createSceneRenderer } = await import('/packages/renderer/src/browser-scene.js');
      const project = await (await fetch('/project.json')).json(), results = [];
      for (const [width, height] of [[384, 216], [320, 320], [216, 384]]) {
        const formatProject = { ...project, output: { ...project.output, width, height } };
        for (const scene of project.scenes) {
          const render = createSceneRenderer(formatProject), canvas = document.createElement('canvas');
          const roundRect = CanvasRenderingContext2D.prototype.roundRect, cards = [];
          CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, ...rest) {
            if (w > 100 && h > 100) { const matrix = this.getTransform(); cards.push({ x: matrix.e, y: matrix.f }); }
            return roundRect.call(this, x, y, w, h, ...rest);
          };
          try {
            await render(canvas, scene, 72); const arrangement = [...cards]; cards.length = 0;
            await render(canvas, scene, 12.5); const first = canvas.toDataURL();
            await render(canvas, scene, 42); const changed = canvas.toDataURL() !== first;
            await render(canvas, scene, 0); await render(canvas, scene, 12.5);
            results.push({ width, height, plugin: scene.plugin, repeated: canvas.toDataURL() === first, changed, cards: arrangement });
          } finally { CanvasRenderingContext2D.prototype.roundRect = roundRect; await render.dispose(); }
        }
      }
      return results;
    });
    for (const item of results) {
      assert.ok(item.repeated && item.changed, `${item.plugin} at ${item.width}×${item.height} must animate and seek deterministically`);
      if (item.width <= item.height && ['animejs', 'motion'].includes(item.plugin)) {
        assert.ok(new Set(item.cards.map(card => Math.round(card.y))).size > 1, `${item.plugin} must use multiple card rows in square and portrait`);
      }
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await server.close(); }
});


test('unsupported plugin formats fail before creating a render session', { timeout: 60000 }, async () => {
  const server = await createRenderServer(projectPath), browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage(); await page.goto(server.origin); await page.waitForFunction(() => window.joeFluxReady);
    const outcomes = await page.evaluate(async () => {
      const { createPlugin } = await import('/animation-plugins/runtime.js'), outcomes = [];
      for (const id of ['animejs', 'motion', 'threejs', 'react-three']) {
        const canvas = document.createElement('canvas');
        try {
          const instance = await createPlugin(id, { canvas, context: canvas.getContext('2d'), output: { width: 400, height: 300, fps: 24 }, scene: {} });
          instance.dispose(); outcomes.push({ id, message: '' });
        } catch (error) { outcomes.push({ id, message: error.message }); }
      }
      return outcomes;
    });
    for (const item of outcomes) assert.match(item.message, /support 16:9, 1:1, and 9:16/, `${item.id} must explain the supported formats before allocating a session`);
  } finally { await browser.close(); await server.close(); }
});

test('validation reports unsupported plugin output formats before rendering', async () => {
  const { validateProject } = await import('../packages/core/src/index.js');
  const project = { version: 1, name: 'Plugin', output: { width: 1080, height: 1350, fps: 24, audio: false }, assets: {}, scenes: [{ id: 'motion', plugin: 'motion', durationFrames: 48 }] };
  assert.match(validateProject(project).errors.join('\n'), /support 16:9, 1:1, and 9:16/);
  assert.deepEqual(validateProject({ ...project, output: { ...project.output, height: 1920 } }).errors, []);
});
