import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createProjectTools } from '../packages/tools/src/index.js';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'harness templates '));
  await mkdir(path.join(root, 'scenes'));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ name: 'Templates', version: 1, output: { width: 640, height: 360, fps: 24, audio: false }, assets: { demo: 'assets/demo.mp4' }, scenes: [] }));
  return root;
}

test('template library exposes reusable slot definitions and preview scenes', async () => {
  const tools = createProjectTools(await fixture());
  const templates = await tools.call('template_list', { preview: true });
  assert.ok(templates.length >= 8);
  assert.ok(templates.every((item) => item.id && item.category && item.slots?.length && Object.keys(item.controls?.durations ?? {}).length && item.previewScene));
  const summary = await tools.call('template_list');
  assert.equal(summary.length, templates.length);
  assert.ok(summary.every((item) => item.slots?.length && !item.previewScene && !item.scene));
  const transitions = await tools.call('template_list', { category: 'Transitions' });
  assert.ok(transitions.length && transitions.every((item) => item.category === 'Transitions'));
  assert.ok(templates.some((item) => item.id === 'screen-handoff'));
});

test('template apply substitutes slots, duration and intensity through one undoable tool call', async () => {
  const root = await fixture(), tools = createProjectTools(root);
  const result = await tools.call('template_apply', { template: 'focus-tour', id: 'tour', slots: { asset: 'demo', title: 'Explore the console' }, duration: 'short', intensity: 1.2 });
  assert.equal(result.id, 'tour');
  const scene = JSON.parse(await readFile(path.join(root, 'scenes', 'tour.json'), 'utf8'));
  assert.equal(scene.screen.asset, 'demo');
  assert.equal(scene.durationFrames, 72);
  assert.ok(scene.camera.shots[1].zoom > 2);
  assert.equal((await tools.call('validate')).valid, true);
  await tools.call('history_undo');
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'project.json'), 'utf8')).scenes, []);
});

test('template slots reject missing assets and overlong copy before creating a scene', async () => {
  const root = await fixture(), tools = createProjectTools(root);
  await assert.rejects(tools.call('template_apply', { template: 'focus-tour', id: 'tour', slots: { asset: 'missing', title: 'A' } }), /asset/);
  await assert.rejects(tools.call('template_apply', { template: 'focus-tour', id: 'tour', slots: { asset: 'demo', title: 'A'.repeat(200) } }), /title/);
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'project.json'), 'utf8')).scenes, []);
});

test('template poster renders once and reuses its runtime cache', async () => {
  const root = await fixture(), tools = createProjectTools(root);
  const first = await tools.call('template_poster', { template: 'chapter-opener' });
  const second = await tools.call('template_poster', { template: 'chapter-opener' });
  assert.equal(first.url, second.url);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.ok((await stat(path.join(root, first.file))).size > 100);
});
