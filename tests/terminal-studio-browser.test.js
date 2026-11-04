import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { startPreview } from '../packages/preview-server/src/index.js';
import { browserLaunchOptions } from '../packages/renderer/src/index.js';
import { createProjectTools } from '../packages/tools/src/index.js';

test('terminal template accepts multiline copy and preserves Enter while editing applied components', { timeout: 60000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'terminal-studio-'));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ version: 1, name: 'Terminal editing', output: { width: 640, height: 360, fps: 24, audio: false }, assets: {}, scenes: [] }));
  const tools = createProjectTools(root), server = await startPreview(root, 0), browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(server.url);
    await page.getByRole('button', { name: 'Add a shot', exact: true }).click();
    await page.getByRole('menuitem', { name: /Browse templates/ }).click();
    await page.getByRole('button', { name: 'Choose Terminal · Light template', exact: true }).click();
    const transcript = '$ demo start\nExample ready', fieldLabel = 'First transcript ($ command, then output)';
    const field = page.getByLabel(fieldLabel, { exact: true });
    assert.equal(await field.evaluate(element => element.tagName), 'TEXTAREA');
    await field.fill(transcript);
    await page.getByRole('button', { name: 'Add shot', exact: true }).last().click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect.poll(async () => (await tools.call('project_get')).scenes[0]?.components[0].inputs.transcript).toBe(transcript);
    const inspector = page.getByRole('complementary', { name: 'Inspector' }), applied = inspector.getByLabel(fieldLabel, { exact: true });
    await applied.fill('$ demo start'); await applied.press('End'); await applied.press('Enter'); await applied.pressSequentially('Updated output');
    assert.equal(await applied.inputValue(), '$ demo start\nUpdated output');
    assert.equal((await tools.call('project_get')).scenes[0].components[0].inputs.transcript, transcript);
    await applied.press('Control+Enter');
    await expect.poll(async () => (await tools.call('project_get')).scenes[0].components[0].inputs.transcript).toBe('$ demo start\nUpdated output');
    await inspector.getByLabel('Terminal theme', { exact: true }).last().click();
    await page.getByRole('option', { name: 'Dark', exact: true }).click();
    await expect.poll(async () => (await tools.call('project_get')).scenes[0].components[0].inputs.palette).toBe('dark');
    await page.waitForFunction(() => document.querySelector('.stage canvas')?.dataset.renderedFrame);
  } finally { await browser.close(); await server.close(); }
});
