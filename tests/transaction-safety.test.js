import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, realpath, writeFile, rm, stat, utimes } from 'node:fs/promises';
import { hostname, tmpdir, uptime } from 'node:os';
import path from 'node:path';
import { createProjectTools } from '../packages/tools/src/index.js';
import { createToolRunner, defineTool } from '../packages/tools/src/runner.js';
import { withProjectLock } from '../packages/core/src/project-lock.js';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'transaction-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'scenes'));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ name: 'Transactions', version: 1, output: { width: 320, height: 180, fps: 24, audio: false }, assets: {}, scenes: [{ id: 'title', file: 'scenes/title.json' }] }));
  await writeFile(path.join(root, 'scenes/title.json'), JSON.stringify({ id: 'title', preset: 'text-settle', durationFrames: 24, params: { title: 'Hello' } }));
  return root;
}
const json = async (root, file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const child = (code, args) => {
  const process = spawn(globalThis.process.execPath, ['--input-type=module', '-e', code, ...args], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let error = ''; process.stderr.on('data', chunk => error += chunk);
  const done = once(process, 'exit').then(([code]) => assert.equal(code, 0, error));
  return { process, done };
};

test('independent processes serialize their entire read/update/history transaction', async t => {
  const root = await fixture(t), module = new URL('../packages/tools/src/runner.js', import.meta.url).href;
  const code = `import {createToolRunner,defineTool} from ${JSON.stringify(module)};
    const runner=createToolRunner(process.argv[1],[defineTool({name:'increment',mutates:true,async run({tx}){const scene=await tx.readJson('scenes/title.json');await new Promise(r=>setTimeout(r,80));scene.durationFrames++;tx.writeJson('scenes/title.json',scene);return scene;}})]);
    process.send('ready'); await new Promise(r=>process.once('message',r));for(let i=0;i<3;i++)await runner.call('increment');process.disconnect();`;
  const children = Array.from({ length: 4 }, () => child(code, [root]));
  await Promise.all(children.map(({ process }) => once(process, 'message')));
  children.forEach(({ process }) => process.send('go'));
  await Promise.all(children.map(({ done }) => done));
  assert.equal((await json(root, 'scenes/title.json')).durationFrames, 36);
  const runner = createProjectTools(root);
  assert.equal((await runner.history()).entries.length, 12);
  for (let i = 0; i < 12; i++) await runner.undo();
  assert.equal((await json(root, 'scenes/title.json')).durationFrames, 24);
});

test('binary import is removed by undo and restored byte-for-byte after the source disappears', async t => {
  const root = await fixture(t), source = path.join(root, 'source.bin'), bytes = Buffer.alloc(2_000_000);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
  await writeFile(source, bytes);
  const runner = createProjectTools(root), result = await runner.call('asset_import', { source, name: 'binary' });
  assert.deepEqual(await readFile(path.join(root, result.file)), bytes);
  await rm(source);
  assert.ok((await stat(path.join(root, '.runtime/history.json'))).size < 20_000, 'history stores references, not media bytes');
  await runner.undo();
  await assert.rejects(stat(path.join(root, result.file)), { code: 'ENOENT' });
  await runner.redo();
  assert.deepEqual(await readFile(path.join(root, result.file)), bytes);
  await runner.undo();
  assert.equal((await readdir(path.join(root, '.runtime/blobs'))).length, 1, 'redo keeps its media');
  await runner.call('scene_update', { id: 'title', patch: { durationFrames: 30 } });
  assert.deepEqual(await readdir(path.join(root, '.runtime/blobs')), [], 'a discarded redo branch releases its media');
});

test('reusing a preexisting asset preserves it on undo; rejected imports leave no asset', async t => {
  const root = await fixture(t), source = path.join(root, 'source.bin');
  await mkdir(path.join(root, 'assets')); await writeFile(source, Buffer.from([0, 255, 10]));
  await writeFile(path.join(root, 'assets/source.bin'), Buffer.from([0, 255, 10]));
  const runner = createProjectTools(root);
  await runner.call('asset_import', { source, name: 'binary' }); await runner.undo();
  assert.deepEqual(await readFile(path.join(root, 'assets/source.bin')), Buffer.from([0, 255, 10]));
  await rm(path.join(root, 'assets/source.bin'));
  const scene = await json(root, 'scenes/title.json'); scene.durationFrames = 0;
  await writeFile(path.join(root, 'scenes/title.json'), JSON.stringify(scene));
  await assert.rejects(runner.call('asset_import', { source, name: 'binary' }), /invalid/);
  await assert.rejects(stat(path.join(root, 'assets/source.bin')), { code: 'ENOENT' });
});

test('change cards identify their entry and guarded undo cannot undo a later edit', async t => {
  const root = await fixture(t), runner = createProjectTools(root);
  const first = await runner.call('scene_update', { id: 'title', patch: { durationFrames: 30 } });
  assert.ok(first._change?.id);
  assert.match(first._change.summary, /title/);
  assert.ok(first._change.details.some(detail => detail.includes('durationFrames')));
  const second = await runner.call('scene_update', { id: 'title', patch: { durationFrames: 40 } });
  await assert.rejects(runner.call('history_undo', { entryId: first._change.id }), /latest|recent/);
  assert.equal((await json(root, 'scenes/title.json')).durationFrames, 40);
  await runner.call('history_undo', { entryId: second._change.id });
  assert.equal((await json(root, 'scenes/title.json')).durationFrames, 30);
  assert.equal((await runner.history()).entries[0].id, first._change.id);
});

test('history publication failure rolls back already published project and binary files', async t => {
  const root = await fixture(t), before = await readFile(path.join(root, 'project.json'));
  await mkdir(path.join(root, '.runtime/history.json'), { recursive: true });
  const runner = createToolRunner(root, [defineTool({ name: 'failure', mutates: true, async run({ tx }) {
    const manifest = await tx.readJson('project.json'); manifest.name = 'Changed'; tx.writeJson('project.json', manifest); tx.writeText('assets/new.txt', 'new'); return {};
  } })]);
  await assert.rejects(runner.call('failure'));
  assert.deepEqual(await readFile(path.join(root, 'project.json')), before);
  await assert.rejects(stat(path.join(root, 'assets/new.txt')), { code: 'ENOENT' });
});

const lockFile = async (root, key) => path.join(await realpath(root), '.runtime', 'locks', `${createHash('sha256').update(key).digest('hex')}.lock`);
const plant = async (root, content, ageSeconds = 0) => {
  const file = await lockFile(root, 'project-mutations');
  await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, content);
  const then = new Date(Date.now() - ageSeconds * 1000); await utimes(file, then, then);
  return file;
};
const waits = async (root) => {
  const controller = new AbortController(); setTimeout(() => controller.abort(), 300);
  await assert.rejects(withProjectLock(root, 'project-mutations', async () => {}, { signal: controller.signal }), { name: 'AbortError' });
};

test('abandoned locks are reaped: empty after a crash, or left before a reboot', async t => {
  const root = await fixture(t), runner = createProjectTools(root);
  await plant(root, '', 1);
  await waits(root);
  await plant(root, '', 60);
  await runner.call('scene_update', { id: 'title', patch: { durationFrames: 30 } });
  await plant(root, JSON.stringify({ token: 'old', pid: process.pid, host: hostname(), boot: Date.now() - 86_400_000 }));
  await runner.call('scene_update', { id: 'title', patch: { durationFrames: 32 } });
  assert.equal((await json(root, 'scenes/title.json')).durationFrames, 32);
});

test('a live local holder is never stolen, even when its lock looks old after sleep', async t => {
  const root = await fixture(t);
  await plant(root, JSON.stringify({ token: 'live', pid: process.pid, host: hostname(), boot: Date.now() - uptime() * 1000 }), 600);
  await waits(root);
  await plant(root, JSON.stringify({ token: 'remote', pid: 1, host: 'another-host' }), 60);
  await withProjectLock(root, 'project-mutations', async () => {});
});

test('a rejected import keeps no media, and redo is guarded by entry id', async t => {
  const root = await fixture(t), source = path.join(root, 'clip.bin'), runner = createProjectTools(root);
  await writeFile(source, Buffer.alloc(4096, 7));
  const scene = await json(root, 'scenes/title.json'); scene.durationFrames = 0;
  await writeFile(path.join(root, 'scenes/title.json'), JSON.stringify(scene));
  await assert.rejects(runner.call('asset_import', { source, name: 'clip' }), /invalid/);
  assert.deepEqual(await readdir(path.join(root, '.runtime/blobs')).catch(() => []), []);
  scene.durationFrames = 24; await writeFile(path.join(root, 'scenes/title.json'), JSON.stringify(scene));
  const first = await runner.call('scene_update', { id: 'title', patch: { durationFrames: 30 } });
  const second = await runner.call('scene_update', { id: 'title', patch: { durationFrames: 40 } });
  await runner.undo(); await runner.undo();
  await assert.rejects(runner.call('history_redo', { entryId: second._change.id }), /next to redo/);
  await runner.call('history_redo', { entryId: first._change.id });
  assert.equal((await json(root, 'scenes/title.json')).durationFrames, 30);
});

test('project mutations still work when the sandbox denies system uptime', async t => {
  const root = await fixture(t), original = os.uptime;
  os.uptime = () => { throw Object.assign(new Error('uv_uptime EPERM'), { code: 'EPERM' }); };
  syncBuiltinESMExports();
  try {
    const runner = createProjectTools(root);
    await runner.call('scene_update', { id: 'title', patch: { durationFrames: 30 } });
    assert.equal((await json(root, 'scenes/title.json')).durationFrames, 30);
    await plant(root, JSON.stringify({ token: 'live', pid: process.pid, host: hostname(), boot: 1 }), 600);
    await waits(root);
  } finally { os.uptime = original; syncBuiltinESMExports(); }
});
