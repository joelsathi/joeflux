import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startPreview } from '../packages/preview-server/src/index.js';

async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'desktop server '));
  await mkdir(path.join(root, 'scenes'));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ version: 1, name: 'Desktop', output: { width: 320, height: 180, fps: 24, audio: false }, assets: {}, scenes: [{ id: 'title', file: 'scenes/title.json' }] }));
  await writeFile(path.join(root, 'scenes/title.json'), JSON.stringify({ id: 'title', preset: 'text-settle', durationFrames: 24, params: { title: 'Hello' } }));
  const staticRoot = path.join(root, 'built');
  await mkdir(path.join(staticRoot, 'assets'), { recursive: true });
  await writeFile(path.join(staticRoot, 'index.html'), '<!doctype html><title>Production studio</title>');
  await writeFile(path.join(staticRoot, 'assets/studio.js'), 'window.production = true;');
  const server = await startPreview(root, 0, { production: true, staticRoot, agents: {}, ...options });
  t.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });
  return { ...server, root, headers: { 'x-joeflux-token': server.token, 'content-type': 'application/json' } };
}

test('production serves built UI and assets without exposing source or project files', async t => {
  const server = await fixture(t);
  const get = name => fetch(new URL(name, server.url));
  assert.equal(await (await get('/')).text(), '<!doctype html><title>Production studio</title>');
  assert.equal(await (await get('/assets/studio.js')).text(), 'window.production = true;');
  assert.match((await get('/assets/studio.js')).headers.get('content-type'), /javascript/);
  for (const name of ['/src/main.jsx', '/project.json', '/@fs/etc/passwd', '/assets/%2e%2e%2f%2e%2e%2fproject.json', '/missing.js']) {
    assert.equal((await get(name)).status, 404, name);
  }
});

test('production preserves session authentication and origin protection for reads and edits', async t => {
  const server = await fixture(t), url = new URL('/api/tools/scene_update', server.url);
  assert.equal((await fetch(new URL('/api/project', server.url))).status, 401);
  const changed = await fetch(url, { method: 'POST', headers: server.headers, body: JSON.stringify({ id: 'title', patch: { durationFrames: 48 } }) });
  assert.equal(changed.status, 200);
  for (const hostile of [{ origin: 'https://evil.example' }, { 'sec-fetch-site': 'same-site' }]) {
    assert.equal((await fetch(url, { method: 'POST', headers: { ...server.headers, ...hostile }, body: '{}' })).status, 403);
  }
  const result = await (await fetch(new URL('/api/project', server.url), { headers: server.headers })).json();
  assert.equal(result.scenes[0].durationFrames, 48);
});

test('production closes active event streams and releases its port', async t => {
  const server = await fixture(t);
  const response = await fetch(new URL('/api/events', server.url), { headers: server.headers });
  const reader = response.body.getReader();
  await reader.read();
  await server.close();
  await assert.rejects(fetch(new URL('/api/project', server.url), { headers: server.headers }));
  await reader.cancel().catch(() => {});
});

test('production shutdown waits for an active edit to finish and preserve its undo entry', async t => {
  const { projectApi } = await import('../packages/preview-server/src/index.js');
  const { drainOperations } = await import('../packages/preview-server/src/production.js');
  const root = await mkdtemp(path.join(tmpdir(), 'desktop shutdown '));
  t.after(() => rm(root, { recursive: true, force: true }));
  let begin, release;
  const started = new Promise(resolve => { begin = resolve; });
  const proceed = new Promise(resolve => { release = resolve; });
  const handlers = new Map(), studio = { token: 'session' };
  const tools = { async call() {
    await writeFile(path.join(root, 'scene.json'), '{"changed":true}');
    begin(); await proceed;
    await writeFile(path.join(root, 'history.json'), '{"undo":true}');
    return {};
  } };
  projectApi(root, tools, studio).configureServer({ middlewares: { use(route, handler) { if (typeof route === 'string') handlers.set(route, handler); } } });
  const { Readable } = await import('node:stream');
  const { EventEmitter } = await import('node:events');
  const request = Readable.from([Buffer.from('{}')]);
  Object.assign(request, { url: '/tools/scene_update', method: 'POST', headers: { 'content-type': 'application/json', 'x-joeflux-token': 'session' } });
  const response = Object.assign(new EventEmitter(), { writeHead() {}, end() {}, writableFinished: false });
  handlers.get('/api')(request, response, () => {});
  await started;
  let stopped = false;
  const stopping = drainOperations(studio).then(() => { stopped = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(stopped, false, 'shutdown cannot interrupt a partially published transaction');
  release(); await stopping;
  const { readFile } = await import('node:fs/promises');
  assert.equal(await readFile(path.join(root, 'history.json'), 'utf8'), '{"undo":true}');
});


test('desktop connections require the studio token and expose actions but never key retrieval', async t => {
  const calls = [];
  const connections = { status: async () => ({ claude: { desktop: true, keyConfigured: true } }), action: async (...args) => { calls.push(args); return { configured: true }; }, key: async () => 'do-not-expose' };
  const server = await fixture(t, { agents: { claude: { label: 'Claude', command: process.execPath } }, connections });
  const url = new URL('/api/connections/claude/save-key', server.url);
  assert.equal((await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
  assert.deepEqual(calls, []);
  assert.equal((await fetch(url, { method: 'POST', headers: server.headers, body: JSON.stringify({ key: 'secret', remember: false }) })).status, 200);
  assert.equal(calls.length, 1);
  for (const action of ['key', 'exec', 'read']) assert.equal((await fetch(new URL(`/api/connections/claude/${action}`, server.url), { method: 'POST', headers: server.headers, body: '{}' })).status, 400);
  const agents = await (await fetch(new URL('/api/agents', server.url), { headers: server.headers })).json();
  assert.equal(agents[0].connection.keyConfigured, true);
  assert.equal(agents[0].signedIn, true);
  assert.ok(!JSON.stringify(agents).includes('do-not-expose'));
});

test('desktop chat refuses unapproved CLI billing before starting the agent', async t => {
  const server = await fixture(t, { connections: { key: async () => null, status: async () => ({ codex: { cliApproved: false } }) } });
  const response = await fetch(new URL('/api/chat', server.url), { method: 'POST', headers: server.headers, body: JSON.stringify({ agent: 'codex', prompt: 'hello' }) });
  assert.match(await response.text(), /Connections.*account/);
});

test('disconnecting while a desktop key is retrieved never starts an agent', async t => {
  let entered, release, started = false;
  const waiting = new Promise(resolve => { entered = resolve; });
  const key = new Promise(resolve => { release = resolve; });
  const server = await fixture(t, { agents: { codex: { command: process.execPath, args: () => { started = true; return ['-e', '']; }, parser: () => () => [] } }, connections: { key: async () => { entered(); return key; } } });
  const controller = new AbortController();
  const request = fetch(new URL('/api/chat', server.url), { method: 'POST', headers: server.headers, body: JSON.stringify({ agent: 'codex', prompt: 'hello' }), signal: controller.signal }).catch(() => {});
  await waiting;
  controller.abort(); await request;
  await new Promise(resolve => setTimeout(resolve, 50));
  release('test-secret');
  await server.close();
  assert.equal(started, false);
});
