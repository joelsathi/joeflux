// Mirrors skills/ into the Codex and Claude skill folders. --check reports drift without writing.
import { cp, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'skills');
export const MIRRORS = ['.agents/skills', '.claude/skills'];

async function files(directory) {
  let entries; try { entries = await readdir(directory, { withFileTypes: true }); } catch { return []; }
  return (await Promise.all(entries.map(async (entry) => entry.isDirectory()
    ? (await files(path.join(directory, entry.name))).map((file) => `${entry.name}/${file}`)
    : [entry.name]))).flat().sort();
}

// Paths that are missing, extra or different in each mirror.
export async function skillDrift() {
  const expected = await files(source), drift = [];
  for (const mirror of MIRRORS) {
    const actual = await files(path.join(root, mirror));
    for (const file of new Set([...expected, ...actual])) {
      const [a, b] = await Promise.all([source, path.join(root, mirror)].map((base) => readFile(path.join(base, file)).catch(() => null)));
      if (!a || !b || !a.equals(b)) drift.push(`${mirror}/${file}`);
    }
  }
  return drift;
}

export async function syncSkills() {
  for (const mirror of MIRRORS) {
    await rm(path.join(root, mirror), { recursive: true, force: true });
    await cp(source, path.join(root, mirror), { recursive: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.includes('--check')) {
    const drift = await skillDrift();
    if (drift.length) { process.stderr.write(`Skill copies differ from skills/. Run pnpm run skills:sync.\n${drift.join('\n')}\n`); process.exit(1); }
    process.stdout.write('Codex and Claude skill copies match skills/.\n');
  } else {
    await syncSkills();
    process.stdout.write('Codex and Claude skill copies synchronized.\n');
  }
}
