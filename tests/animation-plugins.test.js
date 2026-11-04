import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createProjectTools } from '../packages/tools/src/index.js';
import { validateProject } from '../packages/core/src/index.js';
const base = { version: 1, name: 'Plugins', output: { width: 640, height: 360, fps: 24, audio: false }, assets: {}, scenes: [] };
test('animation plugins are discoverable, insertable and undoable without media', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'animation-plugins-'));
  await writeFile(path.join(root, 'project.json'), JSON.stringify(base));
  const tools = createProjectTools(root);
  const catalog = await tools.call('animation_plugin_list');
  assert.deepEqual(catalog.map(p => p.id).sort(), ['animejs', 'motion', 'react-three', 'threejs']);
  assert.ok(catalog.every(p => p.license === 'MIT' && p.source && p.skill));
  for (const plugin of catalog) {
    await tools.call('template_apply', { template: `plugin-${plugin.id}`, id: plugin.id, slots: { title: 'Frame-perfect', subtitle: 'Local animation' } });
    const scene = JSON.parse(await readFile(path.join(root, `scenes/${plugin.id}.json`), 'utf8'));
    assert.equal(scene.plugin, plugin.id);
    assert.equal(scene.params.title, 'Frame-perfect');
    assert.equal((await tools.call('validate')).valid, true);
    await tools.call('history_undo');
  }
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'project.json'), 'utf8')).scenes, []);
});
test('plugin scenes reject unknown engines and ambiguous render ownership', () => {
  for (const scene of [
    { plugin: 'remote-script' }, { plugin: 'animejs', module: 'scenes/a.js' },
    { plugin: 'threejs', pluginOptions: { quality: 9 } },
  ]) assert.equal(validateProject({ ...base, scenes: [{ id: 'test', durationFrames: 120, ...scene }] }).valid, false);
  assert.equal(validateProject({ ...base, scenes: [{ id: 'test', durationFrames: 120, plugin: 'animejs' }] }).valid, true);
});

test('packaged metadata sanitization does not invalidate the prebuilt plugin runtime', async () => {
  const { pluginBuildIdentity } = await import('../packages/animation-plugins/build.js');
  const { cp, mkdir } = await import('node:fs/promises');
  const root = await mkdtemp(path.join(tmpdir(), 'plugin-package-'));
  await mkdir(path.join(root, 'packages'), { recursive: true });
  await cp(new URL('../packages/animation-plugins', import.meta.url), path.join(root, 'packages/animation-plugins'), { recursive: true });
  await cp(new URL('../pnpm-lock.yaml', import.meta.url), path.join(root, 'pnpm-lock.yaml'));
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ dependencies: { three:'0.186.1' }, scripts: { build:'build' }, devDependencies:{esbuild:'0.25.12'} }));
  const before = await pluginBuildIdentity(root);
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ dependencies: { three:'0.186.1' } }));
  assert.equal(await pluginBuildIdentity(root), before);
  await writeFile(path.join(root, 'pnpm-lock.yaml'), 'changed dependency lock');
  assert.notEqual(await pluginBuildIdentity(root), before);
});

test('bundle license policy rejects non-MIT, mixed and missing declarations', async () => {
  const { requireMitLicense } = await import('../packages/animation-plugins/build.js');
  assert.doesNotThrow(()=>requireMitLicense({name:'allowed',license:'MIT'}));
  for(const license of ['Apache-2.0','(MIT OR GPL-3.0)','SEE LICENSE IN LICENSE.md',undefined]) {
    assert.throws(()=>requireMitLicense({name:'unapproved',license}),/require MIT/);
  }
});
