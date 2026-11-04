import { constants } from 'node:fs';
import { open, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePluginManifest, validateRelativeJsonPath } from './schema.js';
import { createPackageSnapshot } from './registry.js';

const MAX_JSON_BYTES = 1024 * 1024;

export async function discoverLocalPackage(directory) {
  if (directory instanceof URL) {
    if (directory.protocol !== 'file:') throw new Error('Plugin discovery accepts local directories only.');
    directory = fileURLToPath(directory);
  }
  if (typeof directory !== 'string' || !directory || /^[a-z][a-z0-9+.-]*:\/\//i.test(directory)) throw new Error('Plugin discovery accepts a local directory path only.');
  const root = await realpath(path.resolve(directory));
  if (!(await stat(root)).isDirectory()) throw new Error('Plugin package path must be a directory.');
  const readJson = async relative => {
    validateRelativeJsonPath(relative);
    const target = path.resolve(root, relative), actual = await realpath(target);
    if (!actual.startsWith(`${root}${path.sep}`)) throw new Error(`Plugin file escapes the package through a symlink: ${relative}.`);
    const handle = await open(actual, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await handle.stat();
      if (!info.isFile()) throw new Error(`Plugin JSON path is not a regular file: ${relative}.`);
      if (info.size > MAX_JSON_BYTES) throw new Error(`Plugin JSON file exceeds the ${MAX_JSON_BYTES}-byte size limit: ${relative}.`);
      const data = await handle.readFile('utf8');
      if (Buffer.byteLength(data) > MAX_JSON_BYTES) throw new Error(`Plugin JSON file exceeds the size limit: ${relative}.`);
      if (await realpath(target) !== actual) throw new Error(`Plugin path changed during discovery: ${relative}.`);
      try { return JSON.parse(data); } catch (error) { throw new Error(`Invalid plugin JSON in ${relative}: ${error.message}`); }
    } finally { await handle.close(); }
  };
  const manifest = validatePluginManifest(await readJson('plugin.json'));
  const templates = await Promise.all(manifest.contributes.templates.map(item => typeof item === 'string' ? readJson(item) : item));
  return createPackageSnapshot({ manifest, templates });
}
