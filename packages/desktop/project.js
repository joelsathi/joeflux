import { cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJson } from '../core/src/io.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export async function createDesktopProject(destination) {
  const target = path.resolve(destination);
  await mkdir(path.dirname(target), { recursive: true });
  // Claim the destination atomically; never merge into or remove an existing folder.
  await mkdir(target);
  try {
    const template = path.join(root, 'templates/project');
    // Copy into the directory we just claimed. Node/Electron versions differ in
    // whether errorOnExist also rejects the existing destination directory itself.
    for (const entry of await readdir(template)) {
      await cp(path.join(template, entry), path.join(target, entry), { recursive: true, force: false, errorOnExist: true });
    }
    const manifestPath = path.join(target, 'project.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.name = path.basename(target).replaceAll('-', ' ');
    await writeJson(manifestPath, manifest);
    return target;
  } catch (error) { await rm(target, { recursive: true, force: true }); throw error; }
}
