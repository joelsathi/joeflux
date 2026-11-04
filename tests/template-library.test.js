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

test('project_get summarizes template scenes and guards scene_replace against the summary', async () => {
  const tools = createProjectTools(await fixture());
  for (const [template, id] of [['brand-reveal', 'cta'], ['plugin-motion', 'plan']]) await tools.call('template_apply', { template, id });
  const tokens = (value) => Math.round(JSON.stringify(value).length / 4);
  const summary = await tools.call('project_get'), full = await tools.call('project_get', { detail: 'full' });
  const cta = summary.scenes.find((scene) => scene.id === 'cta');
  assert.equal(cta.summarized, true);
  assert.deepEqual(Object.keys(cta.templateInstance).sort(), ['inputs', 'overrides', 'settings', 'template']);
  assert.deepEqual(cta.components.map((item) => Object.keys(item)), [['id', 'component'], ['id', 'component'], ['id', 'component']]);
  assert.equal(cta.fingerprint, full.scenes.find((scene) => scene.id === 'cta').fingerprint);
  assert.ok(full.scenes.every((scene) => scene.templateInstance.definition && !scene.summarized));
  assert.ok(tokens(summary) < tokens(full) / 2, `${tokens(summary)} vs ${tokens(full)}`);
  await assert.rejects(tools.call('scene_replace', { id: 'cta', scene: cta, fingerprint: cta.fingerprint }), /scene_get/);
  const saved = await tools.call('scene_get', { id: 'cta' });
  assert.ok(saved.templateInstance.definition && saved.components[0].inputs);
});
