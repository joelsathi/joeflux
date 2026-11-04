// Regenerates the Studio screenshots in website/static/img/screens from a copy of the motion showcase.
// Usage: node scripts/capture-docs-screenshots.mjs
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { AGENTS } from '../packages/agents/src/index.js';
import { startPreview } from '../packages/preview-server/src/index.js';
import { browserLaunchOptions } from '../packages/renderer/src/index.js';
import { createProjectTools } from '../packages/tools/src/index.js';

const output = path.resolve('website/static/img/screens');
const root = path.join(await mkdtemp(path.join(tmpdir(), 'docs-shots-')), 'Launch walkthrough');
await cp(path.resolve('projects/motion-showcase'), root, { recursive: true, filter: (source) => !source.includes(`${path.sep}exports`) && !source.includes(`${path.sep}.runtime`) });
const tools = createProjectTools(root);
await tools.call('project_update', { name: 'Launch walkthrough', brand: 'example' });
await tools.call('brand_bookend_apply', { role: 'intro', bookend: 'intro' });
await tools.call('brand_bookend_apply', { role: 'outro', bookend: 'outro' });
await tools.call('background_apply', { id: 'chapter', background: 'example/aurora' });
await tools.call('scene_update', { id: 'focus', patch: { brand: 'none' } });
await tools.call('scene_create', { index: 3, scene: { id: 'tour', kind: 'screen', durationFrames: 144, theme: 'example-dark',
  screen: { asset: 'overview', presentation: 'studio', backdrop: 'theme', fit: 'contain', padding: 0.14, radius: 22, shadow: 'floating', frame: 'browser-dark', frameTitle: 'console.example.com', lighting: { style: 'glow', intensity: 0.6 } },
  camera: { shots: [{ at: 0 }, { at: 0.3, focus: [0.32, 0.36], zoom: 1.7 }, { at: 0.7, focus: [0.32, 0.36], zoom: 1.7 }, { at: 1 }] } } });

// A signed-in director with no model behind it: the screenshots show the UI, not a conversation.
const director = { ...AGENTS.claude, status: { args: ['-e', 'process.stdout.write(\'{"loggedIn":true,"email":"you@example.com"}\')'], parse: AGENTS.claude.status.parse }, command: process.execPath };
const preview = await startPreview(root, 0, { agents: { claude: director } });
const browser = await chromium.launch(browserLaunchOptions());
const settle = (page, ms = 2500) => page.waitForTimeout(ms);
try {
  await mkdir(output, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(preview.url);
  await page.locator('.shot-select').first().waitFor();
  await page.locator('.shot-select').nth(1).click();
  await settle(page, 3000);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await settle(page, 2200);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.mouse.move(800, 20);
  await settle(page, 1200);
  await page.screenshot({ path: path.join(output, 'studio.png') });
  await page.locator('.chat').screenshot({ path: path.join(output, 'director.png') });
  await page.getByLabel('Brand kit').screenshot({ path: path.join(output, 'brand-kit-card.png') });

  await page.getByRole('tab', { name: 'Look' }).click();
  await settle(page, 800);
  await page.getByLabel('Inspector').screenshot({ path: path.join(output, 'inspector-look.png') });
  await page.getByText('Background gallery', { exact: true }).evaluate((node) => node.scrollIntoView({ block: 'start' }));
  await settle(page, 800);
  await page.getByLabel('Inspector').screenshot({ path: path.join(output, 'inspector-backgrounds.png') });

  await page.locator('.shot-select').nth(3).click();
  await settle(page, 3000);
  await page.screenshot({ path: path.join(output, 'studio-screen.png') });
  await page.getByLabel('Inspector').screenshot({ path: path.join(output, 'inspector-camera.png') });
  await page.getByLabel('Shots').screenshot({ path: path.join(output, 'shot-strip.png') });

  await page.locator('.shot-select').first().click();
  await settle(page, 3000);
  await page.locator('.stage').screenshot({ path: path.join(output, 'stage-intro.png') });

  await page.getByRole('button', { name: 'Add a shot' }).click();
  await page.getByRole('menuitem', { name: /Browse templates/ }).click();
  await page.getByRole('dialog').waitFor();
  await settle(page, 4000);
  await page.getByRole('dialog').screenshot({ path: path.join(output, 'templates.png') });
  if (errors.length) throw new Error(`Studio page errors: ${errors.join('; ')}`);
  console.log(`Screenshots written to ${output}`);
} finally {
  await browser.close();
  await preview.close();
  await rm(path.dirname(root), { recursive: true, force: true });
}
