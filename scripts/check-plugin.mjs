#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverLocalPackage, createRegistry, PLUGIN_API_VERSION } from '../packages/plugins/index.js';
import { instantiateTemplate } from '../packages/presets/src/template-instance.js';
import { validateProject } from '../packages/core/src/index.js';
import { loadProject } from '../packages/core/src/io.js';

export const CONFORMANCE_FORMATS = Object.freeze([
  { format: 'landscape', width: 1920, height: 1080 },
  { format: 'square', width: 1080, height: 1080 },
  { format: 'portrait', width: 1080, height: 1920 },
]);

// Discovery validates plain JSON and snapshots it. No package code is imported,
// activated or rendered by this command; it never edits a project or package.
export async function checkPlugin(directory, { dependencies = [], project, inputs = {} } = {}) {
  const target = await discoverLocalPackage(directory);
  const packages = [target, ...await Promise.all(dependencies.map(discoverLocalPackage))];
  const registry = createRegistry({ packages });
  const templates = registry.listTemplates().filter(template => template.origin.package === target.manifest.id);
  if (!templates.length) throw new Error('The checked package must contribute at least one template.');
  const base = project ?? { version: 1, name: 'Data-pack conformance', assets: {}, output: { fps: 24, audio: false } };
  const checks = [];
  for (const template of templates) for (const format of CONFORMANCE_FORMATS) for (const duration of ['short', 'medium', 'long']) {
    const context = `${template.id} ${format.format} ${duration}`;
    try {
      const settings = inputs[template.id] ?? {};
      const scene = instantiateTemplate(template, { id: 'conformance', fps: base.output.fps, assets: base.assets, duration, slots: settings.slots ?? {}, controls: settings.controls ?? {} });
      const result = validateProject({ ...base, output: { ...base.output, width: format.width, height: format.height, audio: false }, scenes: [scene], pluginLock: { version: 1, packages, disabled: [], generation: registry.generation } });
      if (!result.valid) throw new Error(result.errors.join(' '));
      checks.push({ template: template.id, format: format.format, duration, width: format.width, height: format.height, frames: scene.durationFrames, fps: base.output.fps });
    } catch (error) { throw new Error(`${context}: ${error.message}`); }
  }
  return { valid: true, apiVersion: PLUGIN_API_VERSION, package: { id: target.manifest.id, version: target.manifest.version, digest: target.digest }, registryGeneration: registry.generation, templates: templates.length, checks, rendered: false,
    limitations: ['Data/schema checks only; frame rendering, layout inspection, performance and creative approval remain separate gates.'] };
}

async function main(args) {
  const options = { dependencies: [], inputs: {} }; let directory;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') { process.stdout.write('Usage: pnpm plugin:check <local-pack> [--dependency <local-pack>] [--project <project>] [--inputs <JSON-file>]\n'); return; }
    if (['--dependency', '--project', '--inputs'].includes(arg)) {
      const value = args[++i]; if (!value || value.startsWith('--')) throw new Error(`${arg} requires a path.`);
      if (arg === '--dependency') options.dependencies.push(value);
      if (arg === '--project') options.project = await loadProject(path.resolve(value));
      if (arg === '--inputs') options.inputs = JSON.parse(await readFile(path.resolve(value), 'utf8'));
    } else if (arg.startsWith('-')) throw new Error(`Unknown option ${arg}.`);
    else if (directory) throw new Error('Pass one package directory; declare dependency directories with --dependency.');
    else directory = arg;
  }
  if (!directory) throw new Error('Pass a local package directory. Use --help for supported options.');
  if (!options.inputs || typeof options.inputs !== 'object' || Array.isArray(options.inputs)) throw new Error('--inputs must contain an object keyed by namespaced template id.');
  const result = await checkPlugin(directory, options); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { process.stderr.write(`${JSON.stringify({ valid: false, error: error.message }, null, 2)}\n`); process.exitCode = 1; });
}
