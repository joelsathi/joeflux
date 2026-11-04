import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { discoverLocalPackage } from '../packages/plugins/src/discovery.js';
import { createRegistry } from '../packages/plugins/src/registry.js';
import { validatePluginManifest, validateTemplateDefinition } from '../packages/plugins/src/schema.js';

const example = new URL('../fixtures/plugins/proof-pack/', import.meta.url);
const template = () => ({
  id: 'proof', label: 'Proof reveal', category: 'Product', description: 'Show a readable claim.',
  scene: { plugin: 'animejs', durationFrames: 120, params: { title: '{{title}}', subtitle: '{{subtitle}}' }, pluginOptions: { color: '#74e7cd', quality: 1 } },
  slots: [{ id: 'title', type: 'text', default: 'A visible result', maxLength: 64 }, { id: 'subtitle', type: 'text', default: '', maxLength: 100 }],
  controls: { durations: { short: 4, medium: 5, long: 7 }, fields: [{ id: 'accent', label: 'Accent color', type: 'color', path: 'pluginOptions.color', default: '#74e7cd' }] },
});
const manifest = (overrides = {}) => ({ manifestVersion: 1, apiVersion: 1, id: 'example/proof-pack', version: '1.0.0', license: 'MIT', dependencies: {}, entryPoints: {}, capabilities: { execution: 'data', offline: true }, contributes: { templates: [template()] }, ...overrides });
const snapshot = (overrides = {}) => { const value = manifest(overrides); return { manifest: value, templates: value.contributes.templates }; };

async function directory(t, value = manifest()) {
  const root = await mkdtemp(path.join(tmpdir(), 'harness-plugin-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'plugin.json'), JSON.stringify(value));
  return root;
}

test('a separately authored data pack contributes a namespaced editable template without loading code', async () => {
  const pkg = await discoverLocalPackage(example), registry = createRegistry({ packages: [pkg] });
  const contributed = registry.getTemplate('example/proof-pack/proof-reveal');
  assert.equal(contributed.scene.plugin, 'animejs');
  assert.equal(contributed.controls.fields[0].path, 'pluginOptions.color');
  assert.deepEqual(contributed.origin, { package: 'example/proof-pack', version: '1.0.0', template: 'proof-reveal', digest: pkg.digest });
  assert.equal(registry.listTemplates().length, 1);
  const serialized = JSON.parse(JSON.stringify(registry));
  assert.equal(serialized.templates[0].id, 'example/proof-pack/proof-reveal');
  assert.equal(JSON.stringify(serialized).includes(new URL(example).pathname), false);
});

test('manifest validation rejects incompatible APIs, code execution, unpinned dependencies and non-MIT packs', () => {
  for (const value of [
    manifest({ id: 'unscoped' }), manifest({ version: '^1.0.0' }), manifest({ version: '01.0.0' }),
    manifest({ apiVersion: 2 }), manifest({ manifestVersion: 2 }), manifest({ license: 'Apache-2.0' }),
    manifest({ entryPoints: { renderer: './renderer.js' } }), manifest({ capabilities: { execution: 'host', offline: true } }),
    manifest({ capabilities: { execution: 'data', offline: false } }), manifest({ dependencies: { 'example/shared': '^1.0.0' } }),
    manifest({ contributes: { tools: ['dangerous.js'], templates: [] } }),
  ]) assert.throws(() => validatePluginManifest(value), /plugin|manifest|version|license|execution|entry|offline|depend|contribut/i);
  assert.equal(validatePluginManifest(manifest({ version: '1.2.3-beta.1+local' })).version, '1.2.3-beta.1+local');
});

test('template validation limits data packs to trusted existing engines and presets', () => {
  for (const scene of [
    { plugin: 'remote-script' }, { module: 'scenes/code.js' }, { kind: 'composition', components: [] },
    { plugin: 'animejs', preset: 'text-settle' }, { preset: 'unknown' },
    { plugin: 'animejs', dependencies: ['secrets.json'] }, { plugin: 'animejs', pluginOptions: { color: 'https://example.com' } },
  ]) assert.throws(() => validateTemplateDefinition({ ...template(), scene: { durationFrames: 120, ...scene } }), /scene|plugin|preset|module|render|depend|color/i);
  assert.equal(validateTemplateDefinition({ ...template(), scene: { preset: 'text-settle', durationFrames: 120, params: { title: '{{title}}' } }, controls: { durations: { short: 4, medium: 5, long: 7 } } }).scene.preset, 'text-settle');
});

test('declared controls reject unsafe paths, unsupported fields, mismatched types and invalid defaults', () => {
  const changes = [
    { path: '__proto__.polluted' }, { path: 'params.constructor.name' }, { path: 'module' },
    { path: 'background.intensity', type: 'number', min: 0, max: 1, default: .5 },
    { path: 'pluginOptions.color', type: 'text', maxLength: 20, default: 'red' },
    { default: 'red' },
    { type: 'number', path: 'pluginOptions.quality', min: 1, max: 2, step: 1, default: 3 },
  ];
  for (const change of changes) {
    const value = template(); value.controls.fields[0] = { ...value.controls.fields[0], ...change };
    assert.throws(() => validateTemplateDefinition(value), /control|path|field|default|color|quality/i);
  }
  const duplicate = template(); duplicate.controls.fields.push({ ...duplicate.controls.fields[0], id: 'other' });
  assert.throws(() => validateTemplateDefinition(duplicate), /duplicate|path/i);
  const pollution = JSON.parse(JSON.stringify(template()).replace('"params":{', '"params":{"__proto__":{"polluted":true},'));
  assert.throws(() => validateTemplateDefinition(pollution), /unsafe|prototype|__proto__/i);
  assert.equal({}.polluted, undefined);
});

test('template slots and intensity mappings cannot target undeclared or invalid data', () => {
  const unknown = template(); unknown.scene.params.title = '{{undeclared}}';
  assert.throws(() => validateTemplateDefinition(unknown), /slot|undeclared/i);
  const tooLong = template(); tooLong.slots[0].default = 'x'.repeat(65);
  assert.throws(() => validateTemplateDefinition(tooLong), /slot|title|length/i);
  const intensity = template(); intensity.controls.intensity = { path: 'pluginOptions.quality', base: 1, scale: 2 };
  assert.throws(() => validateTemplateDefinition(intensity), /intensity|quality|range/i);
});

test('numeric field defaults and initial values align with the declared step',()=>{
  const value={id:'stepped',label:'Stepped',category:'Titles',scene:{preset:'text-settle',params:{title:'Result'},background:{style:'gradient-drift',intensity:.5}},slots:[],controls:{durations:{short:4,medium:5,long:6},fields:[{id:'intensity',label:'Intensity',path:'background.intensity',type:'number',min:0,max:1,step:.3,default:.5}]}};
  assert.throws(()=>validateTemplateDefinition(value),/step/i);
  value.controls.fields[0].default=.6;
  assert.throws(()=>validateTemplateDefinition(value),/step/i);
  value.scene.background.intensity=.6;
  assert.equal(validateTemplateDefinition(value).controls.fields[0].default,.6);
});

test('duration presets can define the initial frame count without a redundant scene duration', () => {
  const value = template(); delete value.scene.durationFrames;
  assert.equal(validateTemplateDefinition(value).controls.durations.medium, 5);
  for (const durationFrames of [0, 1, 1.5, '120']) {
    assert.throws(() => validateTemplateDefinition({ ...value, scene: { ...value.scene, durationFrames } }), /duration/i);
  }
});

test('plugin copy and slot syntax are validated before a package enters the registry', () => {
  for (const title of [42, null, 'x'.repeat(65), '{{missing-name}}', '{{title']) {
    const value = template(); value.scene.params.title = title;
    assert.throws(() => validateTemplateDefinition(value), /title|copy|slot|template/i);
  }
  const value = template(); value.slots[0].type = 'asset';
  assert.throws(() => validateTemplateDefinition(value), /asset|slot|text/i);
});

test('snapshots are detached and deeply immutable, including nested template controls', () => {
  const pkg = snapshot(), registry = createRegistry({ packages: [pkg] }), original = registry.digest;
  pkg.templates[0].scene.params.title = 'mutated';
  assert.equal(registry.getTemplate('example/proof-pack/proof').scene.params.title, '{{title}}');
  assert.throws(() => { registry.getTemplate('example/proof-pack/proof').controls.fields[0].path = 'module'; }, TypeError);
  assert.throws(() => { registry.listTemplates().push(template()); }, TypeError);
  assert.equal(registry.digest, original);
});

test('registry generation follows canonical package content and rejects tampered snapshot digests', () => {
  const a = createRegistry({ packages: [snapshot()] });
  const reordered = snapshot(); reordered.templates[0].scene = { params: reordered.templates[0].scene.params, durationFrames: 120, pluginOptions: reordered.templates[0].scene.pluginOptions, plugin: 'animejs' };
  assert.equal(createRegistry({ packages: [reordered] }).digest, a.digest);
  const changed = snapshot(); changed.templates[0].scene.pluginOptions.color = '#ffffff';
  assert.notEqual(createRegistry({ packages: [changed] }).generation, a.generation);
  assert.throws(() => createRegistry({ packages: [{ ...snapshot(), digest: '0'.repeat(64) }] }), /digest|integrity/i);
});

test('dependency resolution rejects missing, mismatched and cyclic versions and duplicate contribution names', () => {
  const main = snapshot({ dependencies: { 'example/shared': '1.0.0' } });
  assert.throws(() => createRegistry({ packages: [main] }), /missing|depend/i);
  assert.throws(() => createRegistry({ packages: [main, snapshot({ id: 'example/shared', version: '2.0.0' })] }), /version|depend/i);
  assert.throws(() => createRegistry({ packages: [main, snapshot({ id: 'example/shared', dependencies: { 'example/proof-pack': '1.0.0' } })] }), /cycl/i);
  assert.throws(() => createRegistry({ packages: [snapshot(), snapshot()] }), /duplicate/i);
  assert.throws(() => createRegistry({ packages: [snapshot()], builtins: [{ ...template(), id: 'example/proof-pack/proof' }] }), /duplicate/i);
  const shared = snapshot({ id: 'example/shared' });
  assert.equal(createRegistry({ packages: [main, shared] }).digest, createRegistry({ packages: [shared, main] }).digest);
});

test('local discovery accepts inline data and hashes referenced JSON content', async t => {
  const root = await directory(t), inline = await discoverLocalPackage(root);
  assert.equal(inline.templates[0].id, 'proof');
  const value = manifest({ contributes: { templates: ['templates/proof.json'] } });
  await mkdir(path.join(root, 'templates'));
  await writeFile(path.join(root, 'plugin.json'), JSON.stringify(value));
  await writeFile(path.join(root, 'templates/proof.json'), JSON.stringify(template()));
  const first = await discoverLocalPackage(root);
  const changed = template(); changed.label = 'Changed proof';
  await writeFile(path.join(root, 'templates/proof.json'), JSON.stringify(changed));
  const next = await discoverLocalPackage(root);
  assert.notEqual(next.digest, first.digest);
  assert.equal(first.templates[0].label, 'Proof reveal');
  assert.throws(() => { first.templates[0].label = 'changed'; }, TypeError);
});

test('local discovery rejects traversal, URL paths, symlink escapes and oversized JSON files', async t => {
  for (const file of ['../escape.json', '/tmp/escape.json', 'https://example.com/template.json', 'templates/../escape.json', 'templates\\escape.json', 'templates/code.js']) {
    const root = await directory(t, manifest({ contributes: { templates: [file] } }));
    await assert.rejects(discoverLocalPackage(root), /path|relative|JSON|template/i);
  }
  const root = await directory(t, manifest({ contributes: { templates: ['outside.json'] } }));
  const outside = await directory(t);
  await writeFile(path.join(outside, 'secret.json'), JSON.stringify(template()));
  await symlink(path.join(outside, 'secret.json'), path.join(root, 'outside.json'));
  await assert.rejects(discoverLocalPackage(root), /escape|outside|symbolic|symlink/i);
  const big = await directory(t); await writeFile(path.join(big, 'plugin.json'), ' '.repeat(1024 * 1024 + 1));
  await assert.rejects(discoverLocalPackage(big), /large|limit|size/i);
});
