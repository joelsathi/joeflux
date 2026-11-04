import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fingerprint } from './index.js';

// `read` lets callers overlay unsaved changes (tool transactions) on the files.
export async function loadProject(projectRoot, read = (file) => readFile(path.join(projectRoot, file), 'utf8')) {
  const manifest = JSON.parse(await read('project.json'));
  const scenes = await Promise.all((manifest.scenes ?? []).map(async (entry) => {
    if (!entry.file) return entry;
    const file = entry.file.replaceAll('\\', '/');
    const scenePath = path.resolve(projectRoot, file);
    if (!scenePath.startsWith(`${path.resolve(projectRoot)}${path.sep}`)) throw new Error(`Scene path escapes the project: ${entry.file}`);
    const scene = JSON.parse(await read(file));
    return { ...entry, ...scene, id: entry.id, file };
  }));
  return { ...manifest, root: projectRoot, scenes };
}

export async function readScene(scenePath) {
  const raw = await readFile(scenePath, 'utf8');
  return { scene: JSON.parse(raw), fingerprint: fingerprint(raw) };
}

export async function saveScene(scenePath, scene, expectedFingerprint) {
  const current = await readScene(scenePath);
  if (current.fingerprint !== expectedFingerprint) {
    throw new Error('Scene changed outside the preview. Reload it before saving.');
  }
  await mkdir(path.dirname(scenePath), { recursive: true });
  const encoded = `${JSON.stringify(scene, null, 2)}\n`;
  const temporary = `${scenePath}.tmp`;
  await writeFile(temporary, encoded);
  await rename(temporary, scenePath);
  return { fingerprint: fingerprint(encoded) };
}

export async function writeJson(target, value) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, target);
}
