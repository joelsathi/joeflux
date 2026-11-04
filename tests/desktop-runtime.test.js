import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('desktop creates a portable project in a path with spaces and refuses overwrite', async t => {
  const { createDesktopProject } = await import('../packages/desktop/project.js');
  const parent = await mkdtemp(path.join(tmpdir(), 'desktop project '));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const target = path.join(parent, 'My video');
  await createDesktopProject(target);
  const manifest = JSON.parse(await readFile(path.join(target, 'project.json'), 'utf8'));
  assert.equal(manifest.name, 'My video');
  assert.equal(manifest.output.audio, false);
  await writeFile(path.join(target, 'keep.txt'), 'original');
  await assert.rejects(createDesktopProject(target), /exist/i);
  assert.equal(await readFile(path.join(target, 'keep.txt'), 'utf8'), 'original');
});

test('packaged runtime resolves bundled executables and preserves agent search paths', async () => {
  const { desktopEnvironment } = await import('../packages/desktop/runtime.cjs');
  const env = desktopEnvironment('/Applications/JoeFlux.app/Contents/Resources', { PATH: '/custom/bin:/usr/bin', HOME: '/Users/test' });
  assert.equal(env.JOEFLUX_FFMPEG, '/Applications/JoeFlux.app/Contents/Resources/runtime/ffmpeg');
  assert.equal(env.JOEFLUX_FFPROBE, '/Applications/JoeFlux.app/Contents/Resources/runtime/ffprobe');
  assert.equal(env.PLAYWRIGHT_BROWSERS_PATH, '/Applications/JoeFlux.app/Contents/Resources/runtime/browsers');
  assert.equal(env.ELECTRON_RUN_AS_NODE, '1');
  assert.ok(env.PATH.split(path.delimiter).includes('/custom/bin'));
  assert.ok(env.PATH.split(path.delimiter).includes('/opt/homebrew/bin'));
  assert.ok(env.PATH.split(path.delimiter).includes('/Users/test/.local/bin'));
});

test('MCP subprocess launched by an Electron backend retains Node mode', async () => {
  const { nodeSubprocessEnvironment } = await import('../packages/core/src/runtime.js');
  assert.deepEqual(nodeSubprocessEnvironment({ ELECTRON_RUN_AS_NODE: '1' }), { ELECTRON_RUN_AS_NODE: '1' });
  assert.deepEqual(nodeSubprocessEnvironment({}), {});
});

test('resource copying preserves relative framework links across repeated builds', async t => {
  const { copyRuntimeDirectory } = await import('../packages/desktop/resources.js');
  const { mkdir, symlink, readlink } = await import('node:fs/promises');
  const parent = await mkdtemp(path.join(tmpdir(), 'desktop resources '));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const source = path.join(parent, 'source'), target = path.join(parent, 'copied');
  await mkdir(path.join(source, 'Versions/A'), { recursive: true });
  await writeFile(path.join(source, 'Versions/A/engine'), 'original');
  await symlink('A', path.join(source, 'Versions/Current'));
  await copyRuntimeDirectory(source, target);
  await copyRuntimeDirectory(source, target);
  assert.equal(await readlink(path.join(target, 'Versions/Current')), 'A');
  await writeFile(path.join(target, 'Versions/Current/engine'), 'packaged');
  assert.equal(await readFile(path.join(source, 'Versions/A/engine'), 'utf8'), 'original');
});
