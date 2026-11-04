import { createRegistry, dataDigest } from '../../plugins/src/registry.js';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../library/templates');

export async function listTemplates(project = {}) {
  const dirs = await readdir(ROOT, { withFileTypes: true });
  const templates = await Promise.all(dirs.filter((item) => item.isDirectory()).map(async (item) => JSON.parse(await readFile(path.join(ROOT, item.name, 'template.json'), 'utf8'))));
  const builtins = templates.map(template => ({ ...template, origin: { package: 'harness/core', version: '1.0.0', template: template.id, digest: dataDigest(template) } }));
  const disabled = new Set(project.pluginLock?.disabled ?? []);
  const packages = (project.pluginLock?.packages ?? []).filter(pack => !disabled.has(pack.manifest.id));
  return [...createRegistry({ packages, builtins }).listTemplates()].sort((a, b) => a.label.localeCompare(b.label));
}

export { instantiateTemplate } from './template-instance.js';
