import { createHash } from 'node:crypto';
import { cloneData, deepFreeze, validatePluginManifest, validateTemplateDefinition } from './schema.js';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export function dataDigest(value) { return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }

export function createPackageSnapshot(input) {
  const manifest = validatePluginManifest(input.manifest);
  if (!Array.isArray(input.templates) || input.templates.length !== manifest.contributes.templates.length) throw new Error('Plugin snapshot must contain every declared template.');
  const templates = input.templates.map(validateTemplateDefinition);
  const ids = new Set();
  for (const [index, template] of templates.entries()) {
    if (ids.has(template.id)) throw new Error(`Duplicate template ${template.id} in ${manifest.id}.`);
    ids.add(template.id);
    const declaration = manifest.contributes.templates[index];
    if (typeof declaration !== 'string' && dataDigest(declaration) !== dataDigest(template)) throw new Error(`Plugin template ${template.id} disagrees with its inline declaration.`);
  }
  const digest = dataDigest({ manifest, templates });
  if (input.digest !== undefined && input.digest !== digest) throw new Error(`Plugin snapshot integrity mismatch for ${manifest.id}: digest differs.`);
  return deepFreeze({ manifest, templates, digest });
}

export function createRegistry({ packages = [], builtins = [] } = {}) {
  if (!Array.isArray(packages) || !Array.isArray(builtins)) throw new Error('Registry packages and builtins must be arrays.');
  const snapshots = packages.map(createPackageSnapshot).sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
  const packageMap = new Map();
  for (const pkg of snapshots) {
    if (packageMap.has(pkg.manifest.id)) throw new Error(`Duplicate plugin package ${pkg.manifest.id}.`);
    packageMap.set(pkg.manifest.id, pkg);
  }
  const visiting = new Set(), visited = new Set();
  const visit = pkg => {
    const { id, dependencies } = pkg.manifest;
    if (visiting.has(id)) throw new Error(`Plugin dependency cycle includes ${id}.`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const [dependency, version] of Object.entries(dependencies)) {
      const target = packageMap.get(dependency);
      if (!target) throw new Error(`Missing plugin dependency ${dependency}@${version} required by ${id}.`);
      if (target.manifest.version !== version) throw new Error(`Plugin dependency version mismatch: ${id} requires ${dependency}@${version}, found ${target.manifest.version}.`);
      visit(target);
    }
    visiting.delete(id); visited.add(id);
  };
  snapshots.forEach(visit);
  const templateMap = new Map();
  const add = template => {
    if (typeof template.id !== 'string' || !template.id || templateMap.has(template.id)) throw new Error(`Duplicate or invalid template id ${template.id}.`);
    templateMap.set(template.id, deepFreeze(template));
  };
  builtins.map(cloneData).forEach(add);
  for (const pkg of snapshots) for (const template of pkg.templates) add({
    ...template,
    id: `${pkg.manifest.id}/${template.id}`,
    origin: { package: pkg.manifest.id, version: pkg.manifest.version, template: template.id, digest: pkg.digest },
  });
  const templates = deepFreeze([...templateMap.values()].sort((a, b) => a.id.localeCompare(b.id)));
  const metadata = deepFreeze(snapshots.map(({ manifest, digest }) => ({ id: manifest.id, version: manifest.version, license: manifest.license, apiVersion: manifest.apiVersion, dependencies: manifest.dependencies, capabilities: manifest.capabilities, digest })));
  const digest = dataDigest({ packages: snapshots, templates });
  const serialized = deepFreeze({ apiVersion: 1, generation: digest, digest, packages: metadata, templates });
  return Object.freeze({
    generation: digest, digest,
    listTemplates: () => templates,
    getTemplate: id => templateMap.get(id),
    listPackages: () => metadata,
    toJSON: () => serialized,
  });
}
