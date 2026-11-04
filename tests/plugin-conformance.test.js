import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const cli = path.resolve('scripts/check-plugin.mjs'), fixture = path.resolve('fixtures/plugins/proof-pack');
const run = (...args) => promisify(execFile)(process.execPath, [cli, ...args]);
test('data-pack conformance runs the contributor starter across three formats and durations', async () => {
  const { stdout } = await run(fixture), result = JSON.parse(stdout);
  assert.equal(result.valid, true); assert.equal(result.apiVersion, 1);
  assert.equal(result.templates, 1); assert.equal(result.checks.length, 9);
  assert.deepEqual([...new Set(result.checks.map(check => check.format))], ['landscape', 'square', 'portrait']);
  assert.deepEqual([...new Set(result.checks.map(check => check.duration))], ['short', 'medium', 'long']);
  assert.equal(result.rendered, false);
});
test('conformance rejects executable manifests and missing exact dependencies with actionable diagnostics', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'plugin-conformance-')); t.after(() => rm(root, { recursive: true, force: true }));
  const manifest = JSON.parse(await readFile(path.join(fixture, 'plugin.json'), 'utf8'));
  await writeFile(path.join(root, 'plugin.json'), JSON.stringify({ ...manifest, entryPoints: { renderer: 'evil.js' } }));
  await assert.rejects(run(root), error => error.code === 1 && /entryPoints|unsupported/i.test(error.stderr));
  const template = JSON.parse(await readFile(path.join(fixture, 'templates/proof-reveal.json'), 'utf8'));
  await writeFile(path.join(root, 'plugin.json'), JSON.stringify({ ...manifest, dependencies: { 'example/shared': '1.0.0' }, contributes: { templates: [template] } }));
  await assert.rejects(run(root), error => error.code === 1 && /Missing plugin dependency example\/shared@1.0.0/.test(error.stderr));
});
test('conformance rejects a template whose shortest duration loses a protected reading hold', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'plugin-conformance-reading-')); t.after(() => rm(root, { recursive: true, force: true }));
  const manifest = JSON.parse(await readFile(path.join(fixture, 'plugin.json'), 'utf8'));
  const template = { id: 'reading', label: 'Reading', category: 'Copy', scene: { preset: 'text-template', params: { title: '{{title}}' }, textAnimation: { template: 'masked-lines' } }, slots: [{ id: 'title', type: 'text', maxLength: 100, default: 'Read this complete result before the next scene begins' }], controls: { durations: { short: .5, medium: 5, long: 7 } } };
  await writeFile(path.join(root, 'plugin.json'), JSON.stringify({ ...manifest, contributes: { templates: [template] } }));
  await assert.rejects(run(root), error => error.code === 1 && /landscape.*short.*reading hold/i.test(error.stderr));
});
test('conformance is read-only and exports a local JS SDK entry matching its declaration surface', async () => {
  const before = await readFile(path.join(fixture, 'plugin.json')); await run(fixture);
  assert.deepEqual(await readFile(path.join(fixture, 'plugin.json')), before);
  const api = await import('../packages/plugins/index.js');
  for (const name of ['discoverLocalPackage', 'createRegistry', 'createPackageSnapshot', 'validatePluginManifest', 'validateTemplateDefinition']) assert.equal(typeof api[name], 'function');
  const declarations = await readFile(path.resolve('packages/plugins/index.d.ts'), 'utf8');
  assert.match(declarations, /export interface PluginManifest/); assert.match(declarations, /execution: 'data'/); assert.match(declarations, /entryPoints\??: (?:Readonly<)?Record<string, never>/);
});
