import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createBrandKit, loadBrandKits, registryText } from '../packages/presets/src/brand-kit-sync.js';
import { BRAND_KITS, brandLogo } from '../packages/presets/src/brand-kits.js';
import { resolveTheme } from '../packages/presets/src/themes.js';
import { createProjectTools } from '../packages/tools/src/index.js';
import { createRenderServer } from '../packages/renderer/src/server.js';
import { browserLaunchOptions } from '../packages/renderer/src/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function project() {
  const root = await mkdtemp(path.join(tmpdir(), 'harness brand '));
  await mkdir(path.join(root, 'scenes'));
  await writeFile(path.join(root, 'scenes/title.json'), JSON.stringify({ id: 'title', preset: 'text-settle', durationFrames: 48, params: { title: 'Hello' } }));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ name: 'Brand', version: 1, output: { width: 640, height: 360, fps: 24, audio: false }, assets: {}, scenes: [{ id: 'title', file: 'scenes/title.json' }] }));
  return root;
}

test('the committed registry matches the brand-kits folders', async () => {
  const { kits, errors } = await loadBrandKits(ROOT);
  assert.deepEqual(errors, []);
  assert.equal(await readFile(path.join(ROOT, 'brand-kits/registry.json'), 'utf8'), registryText(kits), 'run pnpm run brand -- sync');
});

test('kit themes, backgrounds and mode-aware logos are exposed to every surface', () => {
  assert.ok(BRAND_KITS.some(kit => kit.id === 'example'));
  assert.equal(resolveTheme('example-dark').accent, '#8B7CFF');
  assert.equal(resolveTheme('example-light').mode, 'light');
  assert.match(brandLogo('example', 'dark').url, /logo-on-dark\.svg$/);
  assert.match(brandLogo('example', 'light').url, /logo-on-light\.svg$/);
  assert.equal(brandLogo('missing', 'dark'), null);
});

test('sync reports invalid manifests, mismatched ids, missing files and escaping paths', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'harness kits '));
  await createBrandKit(root, 'good', 'Good');
  await mkdir(path.join(root, 'brand-kits/renamed'), { recursive: true });
  await writeFile(path.join(root, 'brand-kits/renamed/brand.json'), JSON.stringify({ id: 'other', name: 'Other', logos: { onDark: 'logos/missing.svg' } }));
  await mkdir(path.join(root, 'brand-kits/escape'), { recursive: true });
  await writeFile(path.join(root, 'brand-kits/escape/brand.json'), JSON.stringify({ id: 'escape', name: 'Escape', logos: { onDark: '../secret.svg' } }));
  const { kits, errors } = await loadBrandKits(root);
  assert.deepEqual(kits.map(kit => kit.id), ['good']);
  assert.ok(errors.some(error => /renamed: id "other" must match/.test(error)));
  assert.ok(errors.some(error => /renamed: missing file logos\/missing\.svg/.test(error)));
  assert.ok(errors.some(error => /escape: logos\.onDark must be a relative path/.test(error)));
  await assert.rejects(createBrandKit(root, 'good'), /already exists/);
  await assert.rejects(createBrandKit(root, 'Bad Name'), /lowercase/);
});

test('brand tools read guidelines, set the project kit and add undoable bookends', async () => {
  const root = await project(), tools = createProjectTools(root);
  assert.ok((await tools.call('brand_kit_list')).some(kit => kit.id === 'example'));
  assert.match((await tools.call('brand_kit_get', { id: 'example' })).guidelines, /Example Studio brand guidelines/);
  await assert.rejects(tools.call('brand_bookend_apply', { role: 'intro', bookend: 'intro' }), /brand kit for the project first/);
  await assert.rejects(tools.call('project_update', { brand: 'missing' }), (error) => error.issues.some(issue => /Unknown brand kit "missing"/.test(issue)));
  await tools.call('project_update', { brand: 'example' });
  await tools.call('brand_bookend_apply', { role: 'intro', bookend: 'intro' });
  await tools.call('brand_bookend_apply', { role: 'outro', bookend: 'outro' });
  let saved = await tools.call('project_get');
  assert.deepEqual(saved.scenes.map(scene => scene.id), ['brand-intro', 'title', 'brand-outro']);
  assert.equal(saved.scenes[0].durationFrames, 72);
  assert.equal(await readFile(path.join(root, saved.assets['example-intro'])).then(file => file.length), (await readFile(path.join(ROOT, 'brand-kits/example/bookends/intro.mp4'))).length);
  await tools.call('brand_bookend_apply', { role: 'intro', bookend: 'none' });
  assert.ok(!(await tools.call('project_get')).scenes.some(scene => scene.id === 'brand-intro'));
  await tools.call('history_undo');
  saved = await tools.call('project_get');
  assert.equal(saved.scenes[0].id, 'brand-intro');
});

test('the export renderer draws the kit logo for the theme mode with its font loaded offline', async () => {
  const root = await project();
  const server = await createRenderServer(root), browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } }), external = [];
    await page.route('**/*', route => { if (!route.request().url().startsWith(server.origin)) { external.push(route.request().url()); return route.abort(); } return route.continue(); });
    await page.goto(server.origin); await page.waitForFunction(() => window.joeFluxReady);
    const logos = await page.evaluate(async () => {
      const { createSceneRenderer } = await import('/packages/renderer/src/browser-scene.js');
      const project = await (await fetch('/project.json')).json(), canvas = document.querySelector('canvas'), results = [];
      for (const theme of ['example-dark', 'example-light']) {
        await createSceneRenderer({ ...project, theme, brand: 'example' })(canvas, project.scenes[0], 30);
        const logo = document.querySelector('[data-brand-logo]');
        results.push({ src: logo.src, alt: logo.alt, left: logo.style.left, width: logo.style.width, font: document.fonts.check('600 32px "Harness Inter"') });
      }
      await createSceneRenderer({ ...project, theme: 'example-dark', brand: 'none' })(canvas, project.scenes[0], 30);
      return { results, cleared: !document.querySelector('[data-brand-logo]') };
    });
    assert.match(logos.results[0].src, /logo-on-dark\.svg$/);
    assert.match(logos.results[1].src, /logo-on-light\.svg$/);
    assert.deepEqual(logos.results.map(row => [row.alt, row.left, row.width, row.font]), [['Example Studio', '96px', '300px', true], ['Example Studio', '96px', '300px', true]]);
    assert.equal(logos.cleared, true);
    assert.deepEqual(external, []);
  } finally { await browser.close(); await server.close(); }
});
