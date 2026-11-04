import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { startPreview } from '../packages/preview-server/src/index.js';
import { browserLaunchOptions } from '../packages/renderer/src/index.js';

test('a brief duration option saves a numeric decision and resumes after reload', { timeout: 30000 }, async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'studio-duration-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'project.json');
  await writeFile(file, JSON.stringify({
    version: 1, name: 'Duration choice', output: { width: 320, height: 180, fps: 24, audio: false }, assets: {}, scenes: [],
    brief: { questions: [{ id: 'duration-choice', field: 'duration', question: 'How many seconds should the video run?', options: ['15', '30'], recommendation: '15', reason: 'Keep the placement concise.', dependencies: [], provenance: { source: 'director', actor: 'creator', at: '2026-10-10T00:00:00Z' } }] },
  }));
  const preview = await startPreview(root, 0, { agents: {} });
  let browser;
  try {
    browser = await chromium.launch(browserLaunchOptions());
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    await page.goto(preview.url);
    const response = page.waitForResponse(value => value.url().endsWith('/api/tools/brief_decision_set'));
    await page.getByRole('button', { name: '15', exact: true }).click();
    const result = await response;
    assert.equal(result.ok(), true, JSON.stringify(await result.json()));
    const saved = JSON.parse(await readFile(file, 'utf8')).brief;
    assert.equal(saved.duration, 15);
    assert.equal(saved.decisions.find(decision => decision.id === 'duration-choice').answer, 15);
    await page.reload();
    await expect(page.getByLabel('Duration (seconds)', { exact: true })).toHaveValue('15');
    await expect(page.getByRole('button', { name: '15', exact: true })).toHaveCount(0);
  } finally { await browser?.close(); await preview.close(); }
});

test('general setup saves a brief, and resumes it', { timeout: 60000 }, async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'studio-brief-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'scenes'));
  await writeFile(path.join(root, 'scenes/title.json'), JSON.stringify({ id: 'title', preset: 'text-settle', durationFrames: 48, params: { title: 'Original' } }));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ version: 1, name: 'Neutral brief', output: { width: 320, height: 180, fps: 12, audio: false }, assets: {}, scenes: [{ id: 'title', file: 'scenes/title.json' }, {id:'next',preset:'text-settle',durationFrames:48,params:{title:'Next'}}] }));
  const preview = await startPreview(root, 0, { agents: {} }), browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    await page.goto(preview.url);
    await expect(page.getByLabel('Audience', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Grill this concept', exact: true })).toBeDisabled();
    await page.getByLabel('Audience', { exact: true }).fill('Developers');
    await page.getByLabel('Main message', { exact: true }).fill('Ship reliably');
    await page.getByRole('button', { name: 'Save brief', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save brief', exact: true })).toBeEnabled();
    const saved = JSON.parse(await readFile(path.join(root, 'project.json'), 'utf8'));
    assert.equal(saved.brief.audience, 'Developers');
    assert.equal(saved.brief.interview, null);
    await page.reload();
    await expect(page.getByLabel('Audience', { exact: true })).toHaveValue('Developers');
    await page.getByLabel('Main message', { exact: true }).fill('Unsaved message');
    await page.getByRole('button', { name: 'Reference shelf', exact: true }).click();
    await expect(page.getByText('Webflow Ecommerce', { exact: true })).toBeVisible();
    await expect(page.getByText('reference-only · publication date unknown', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('hypothesis · specimen review pending', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Timecoded review', exact: true }).click();
    await page.getByLabel('Review observation', { exact: true }).fill('The title disappears before I can read it');
    await page.getByLabel('Suggested repair', { exact: true }).fill('Extend the settled hold');
    await page.getByLabel('Evidence note', { exact: true }).fill('Watched this interval at normal speed');
    await page.getByLabel('Start (seconds)', { exact: true }).fill('0');
    await page.getByLabel('End (seconds)', { exact: true }).fill('2');
    await expect(page.getByRole('button', { name: 'Save review finding', exact: true })).toBeDisabled();
    await page.getByLabel('I inspected this interval', { exact: true }).check();
    await page.getByLabel('End (seconds)', { exact: true }).fill('1');
    await expect(page.getByLabel('I inspected this interval', { exact: true })).not.toBeChecked();
    await page.getByLabel('End (seconds)', { exact: true }).fill('2');
    await page.getByLabel('I inspected this interval', { exact: true }).check();
    await page.getByRole('button', { name: 'Save review finding', exact: true }).click();
    await expect(page.getByText('The title disappears before I can read it', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Main message', { exact: true })).toHaveValue('Unsaved message');
    const recorded = JSON.parse(await readFile(path.join(root, 'project.json'), 'utf8')).reviews[0];
    assert.deepEqual(recorded.findings[0].timecodes, [{ start: 0, end: 2 }]);
    assert.equal(recorded.performance.length, 0);
    await page.getByRole('button',{name:'Preview outgoing boundary',exact:true}).click();
    // Boundary previews run the export renderer, which can outlast ordinary UI waits.
    await expect(page.getByText('Boundary title → next. Times refer to this preview clip.',{exact:true})).toBeVisible({ timeout: 45000 });
    await page.getByLabel('Review observation',{exact:true}).fill('Boundary observation');
    await page.getByLabel('Suggested repair',{exact:true}).fill('Hold before the cut');
    await page.getByLabel('Evidence note',{exact:true}).fill('Test boundary evidence');
    await page.getByLabel('I inspected this interval',{exact:true}).check();
    await page.getByRole('button',{name:'Save review finding',exact:true}).click();
    await expect(page.getByText('Boundary observation',{exact:true})).toBeVisible();
    const boundary=JSON.parse(await readFile(path.join(root,'project.json'),'utf8')).reviews[1];
    assert.deepEqual(boundary.shotIds,['title','next']);
    assert.deepEqual(boundary.boundary,{from:'title',to:'next'});
  } finally { await browser.close(); await preview.close(); }
});
