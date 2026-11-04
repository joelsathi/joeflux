import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeScriptArguments } from '../packages/cli/src/arguments.js';
import { previewCommand } from '../packages/cli/src/arguments.js';

const harnessRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(harnessRoot, 'packages/cli/src/main.js');

test('removes pnpm script separators before command parsing', () => {
  assert.deepEqual(normalizeScriptArguments(['--', 'sync', 'projects/demo']), ['sync', 'projects/demo']);
});

test('reports pnpm when suggesting the starter preview command', () => {
  assert.equal(previewCommand('/tmp/a video'), 'pnpm run preview -- /tmp/a video');
});

test('creates a concise starter manifest and a pnpm preview command', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'joeflux-init-'));
  const target = join(directory, 'new video');
  const result = spawnSync(process.execPath, [cli, 'init', target], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(await readFile(join(target, 'project.json'), 'utf8'));
  assert.deepEqual(manifest.scenes, [{ id: 'opening', file: 'scenes/opening.json' }]);
  assert.equal(JSON.parse(result.stdout).next, `pnpm run preview -- ${target}`);
});
