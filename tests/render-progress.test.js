import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createToolRunner, defineTool } from '../packages/tools/src/runner.js';
import { startPreview } from '../packages/preview-server/src/index.js';
import { browserLaunchOptions } from '../packages/renderer/src/index.js';

test('render jobs emit separate start, frame and terminal events for success, cache hits and failures', async () => {
  const pending = [], events = [];
  const runner = createToolRunner(tmpdir(), ['render_scene', 'render_preview'].map((name) => defineTool({ name, run: ({ emit }) => new Promise((resolve, reject) => pending.push({ emit, resolve, reject })) })));
  runner.events.on('event', (event) => events.push(event));
  const first = runner.call('render_scene'), second = runner.call('render_preview');
  assert.deepEqual(events.map(({ status, tool }) => [status, tool]), [['started', 'render_scene'], ['started', 'render_preview']]);
  const [a, b] = events.map(({ jobId }) => jobId);
  assert.ok(a && b && a !== b);
  pending[0].emit({ type: 'progress', frame: 1, frames: 1 });
  assert.equal(events.at(-1).jobId, a);
  assert.equal(events.at(-1).status, 'running', 'last frame is not completion until encoding finishes');
  pending[1].resolve({ cached: true }); await second;
  assert.equal(events.at(-1).jobId, b); assert.equal(events.at(-1).status, 'completed');
  const failure = assert.rejects(first, /encoding failed/);
  pending[0].reject(new Error('encoding failed')); await failure;
  assert.equal(events.at(-1).jobId, a); assert.equal(events.at(-1).status, 'failed');
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'harness progress '));
  await mkdir(path.join(root, 'scenes'));
  await writeFile(path.join(root, 'scenes/title.json'), JSON.stringify({ id: 'title', preset: 'text-settle', durationFrames: 3, params: { title: 'Hi' } }));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ name: 'Progress', version: 1, output: { width: 320, height: 180, fps: 24, audio: false }, assets: {}, scenes: [{ id: 'title', file: 'scenes/title.json' }] }));
  return root;
}

test('external rendering releases Export after success, a cache hit and failure', async () => {
  const root = await fixture(), preview = await startPreview(root, 0, { agents: {} }), browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage();
    await page.goto(preview.url);
    const exportButton = page.getByRole('button', { name: 'Export', exact: true });
    await expect(exportButton).toBeEnabled();
    await page.evaluate(async (moduleUrl) => {
      const { apiFetch, readEvents } = await import(moduleUrl);
      const response = await apiFetch('/api/events'); window.renderEvents = [];
      (async () => { for await (const event of readEvents(response)) window.renderEvents.push(event); })();
    }, `/@fs${path.resolve('packages/preview-server/src/browser-session.js')}`);
    const call = (input) => fetch(new URL('/api/tools/render_scene', preview.url), { method: 'POST', headers: { 'x-joeflux-token': preview.token, 'content-type': 'application/json' }, body: JSON.stringify(input) });
    const rendering = call({ id: 'title' });
    await expect(exportButton).toBeDisabled();
    assert.equal((await rendering).status, 200);
    await expect(exportButton).toBeEnabled();
    const cached = await call({ id: 'title' });
    assert.equal(cached.status, 200); assert.equal((await cached.json()).cached, 1);
    await expect(exportButton).toBeEnabled();
    assert.equal((await call({ id: 'missing' })).status, 400);
    await expect(exportButton).toBeEnabled();
    await expect.poll(() => page.evaluate(() => window.renderEvents.filter((event) => ['completed', 'failed'].includes(event.status)).map((event) => event.status))).toEqual(['completed', 'completed', 'failed']);
  } finally { await browser.close(); await preview.close(); }
});

test('Export stays busy across overlapping jobs and ignores progress after a terminal event', async () => {
  const root = await fixture(), preview = await startPreview(root, 0, { agents: {} }), browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      const original = window.fetch;
      window.fetch = (url, options) => url === '/api/events'
        ? Promise.resolve(new Response(new ReadableStream({ start(controller) {
          window.studioEvents = (event) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
        } }), { headers: { 'content-type': 'text/event-stream' } }))
        : original(url, options);
    });
    await page.goto(preview.url);
    const exportButton = page.getByRole('button', { name: 'Export', exact: true });
    await expect(exportButton).toBeEnabled();
    await page.waitForFunction(() => typeof window.studioEvents === 'function');
    const emit = (jobId, status, extra = {}) => page.evaluate((event) => window.studioEvents(event), { type: 'progress', jobId, status, ...extra });
    await emit('a', 'started'); await emit('b', 'started');
    await expect(exportButton).toBeDisabled();
    await emit('a', 'completed'); await expect(exportButton).toBeDisabled();
    await emit('b', 'failed'); await expect(exportButton).toBeEnabled();
    await emit('a', 'running', { frame: 3, frames: 3 }); await expect(exportButton).toBeEnabled();
    await emit('cached', 'completed'); await emit('cached', 'started'); await expect(exportButton).toBeEnabled();
  } finally { await browser.close(); await preview.close(); }
});
