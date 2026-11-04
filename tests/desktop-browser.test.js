import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { browserLaunchOptions } from '../packages/renderer/src/index.js';
import { startPreview } from '../packages/preview-server/src/index.js';
import { createDesktopProject } from '../packages/desktop/project.js';

// Build once before this integration test: pnpm run build:studio.
test('built studio loads a real project and edits it through the production API', async t => {
  try { await access(new URL('../apps/studio/dist/index.html', import.meta.url)); }
  catch { return t.skip('Run pnpm run build:studio first'); }
  const parent = await mkdtemp(path.join(tmpdir(), 'desktop browser '));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = await createDesktopProject(path.join(parent, 'Desktop Story'));
  const server = await startPreview(root, 0, { production: true, agents: {} });
  t.after(() => server.close());
  const browser = await chromium.launch(browserLaunchOptions());
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1480, height: 960 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(server.url);
  await page.getByRole('button', { name: 'Export', exact: true }).waitFor();
  assert.equal(await page.locator('script[src*="@vite"]').count(), 0);
  const result = await page.evaluate(async () => {
    const token = Object.values(sessionStorage).find(value => value.length === 43);
    const response = await fetch('/api/tools/scene_update', { method: 'POST', headers: { 'content-type': 'application/json', 'x-joeflux-token': token }, body: JSON.stringify({ id: 'opening', patch: { durationFrames: 48 } }) });
    return response.status;
  });
  assert.equal(result, 200);
  assert.deepEqual(errors, []);
});

test('desktop onboarding offers installation, sign-in and explicit API billing, and clears entered keys', async t => {
  const parent = await mkdtemp(path.join(tmpdir(), 'desktop onboarding '));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = await createDesktopProject(path.join(parent, 'Setup'));
  let configured = false;
  const actions = [];
  const server = await startPreview(root, 0, { production: true,
    agents: { claude: { label: 'Claude Code', command: 'missing-test-claude' }, codex: { label: 'Codex', command: process.execPath, status: { args: ['-e', 'process.exit(1)'], parse: () => ({ signedIn: false, account: null }) } } },
    connections: { status: async () => ({ claude: { desktop: true, keyConfigured: false, canRememberKey: true }, codex: { desktop: true, keyConfigured: configured, canRememberKey: true } }), action: async (id, action, body) => { actions.push({ id, action, body }); if (action === 'save-key') configured = true; if (action === 'remove-key') configured = false; return action === 'install' ? { cancelled: true } : { configured }; }, key: async () => null },
  });
  t.after(() => server.close());
  const browser = await chromium.launch(browserLaunchOptions());
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1480, height: 960 } });
  await page.goto(server.url);
  await page.getByRole('button', { name: 'Install Claude Code' }).waitFor();
  await page.setViewportSize({ width: 1060, height: 700 });
  const setupTop = await page.getByText('Connect your AI director', { exact: true }).boundingBox();
  const panelHead = await page.locator('.chat .panel-head').boundingBox();
  assert.ok(setupTop.y >= panelHead.y + panelHead.height, 'Setup starts below the header on a small Mac screen');
  await page.setViewportSize({ width: 1480, height: 960 });
  await mkdir('.runtime/desktop-smoke', { recursive: true });
  await page.screenshot({ path: '.runtime/desktop-smoke/onboarding.png' });
  await page.getByRole('button', { name: 'Install Claude Code' }).click();
  await page.getByText('Installation cancelled. Nothing was installed.').waitFor();
  await page.getByRole('button', { name: 'Sign in with ChatGPT', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Use Codex API key' }).click();
  await page.getByText(/API usage is billed separately/).waitFor();
  await page.getByLabel('Codex API key', { exact: true }).fill('sk-browser-test');
  await page.getByRole('button', { name: 'Save Codex API key' }).click();
  await page.getByRole('button', { name: 'Connections', exact: true }).click();
  await page.getByText(/API key configured/).waitFor();
  assert.equal(await page.locator('input[type=password]').count(), 0);
  assert.ok(!JSON.stringify(await page.evaluate(() => ({ ...localStorage, ...sessionStorage }))).includes('sk-browser-test'));
  await page.getByRole('button', { name: 'Remove Codex API key' }).click();
  await page.getByRole('button', { name: 'Sign in with ChatGPT', exact: true }).waitFor();
  assert.deepEqual(actions.map(item => item.action), ['install', 'save-key', 'remove-key']);
});
