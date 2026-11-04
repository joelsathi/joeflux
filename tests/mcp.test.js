import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { startPreview } from '../packages/preview-server/src/index.js';
import { setupMcp } from '../packages/mcp/src/setup.js';

const SERVER = path.resolve('packages/mcp/src/server.js');
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'harness mcp '));
  await mkdir(path.join(root, 'scenes')); await mkdir(path.join(root, 'assets'));
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=24:d=1', '-an', '-c:v', 'libx264', path.join(root, 'assets', 'clip.mp4')]);
  await writeFile(path.join(root, 'scenes', 'tour.json'), JSON.stringify({ id: 'tour', kind: 'screen', durationFrames: 24, screen: { asset: 'screen' }, camera: { shots: [{ at: 0 }, { at: 1, focus: [.5, .5], zoom: 2 }] } }));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ name: 'MCP', version: 1, output: { width: 320, height: 180, fps: 24, audio: false }, assets: { screen: 'assets/clip.mp4' }, scenes: [{ id: 'tour', file: 'scenes/tour.json' }] }));
  return root;
}
async function connect(args, env = {}) {
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER, ...args], env: { ...process.env, ...env }, stderr: 'pipe' }));
  return client;
}

test('the MCP server lists tools with guidance and applies validated changes', async () => {
  const root = await fixture(), client = await connect([root]);
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.find((tool) => tool.name === 'camera_set_shots').inputSchema.type, 'object');
    assert.match(client.getInstructions(), /project_get/);
    const ok = await client.callTool({ name: 'camera_set_shots', arguments: { id: 'tour', shots: [{ at: 0 }, { at: .5, focus: [.2, .2], zoom: 3 }, { at: 1 }] } });
    assert.equal(ok.isError, undefined);
    assert.equal(JSON.parse(await readFile(path.join(root, 'scenes', 'tour.json'), 'utf8')).camera.shots.length, 3);
    const bad = await client.callTool({ name: 'scene_update', arguments: { id: 'tour', patch: { durationFrames: 0 } } });
    assert.equal(bad.isError, true); assert.match(bad.content[0].text, /invalid[\s\S]*durationFrames/);
    const unknown = await client.callTool({ name: 'nope', arguments: {} });
    assert.equal(unknown.isError, true);
  } finally { await client.close(); }
});

test('without a project the MCP server opens and switches projects through project_open', async () => {
  const root = await fixture(), client = await connect([], { JOEFLUX_PROJECT: '', JOEFLUX_URL: '' });
  try {
    assert.match(client.getInstructions(), /project_open/);
    assert.ok((await client.listTools()).tools.some((tool) => tool.name === 'project_open'));
    const closed = await client.callTool({ name: 'project_get', arguments: {} });
    assert.equal(closed.isError, true); assert.match(closed.content[0].text, /project_open[\s\S]*projects\/demo/);
    assert.ok(JSON.parse((await client.callTool({ name: 'project_open', arguments: {} })).content[0].text).projects.includes('projects/demo'));
    assert.equal((await client.callTool({ name: 'project_open', arguments: { project: 'projects/no-such-project' } })).isError, true);
    assert.equal(JSON.parse((await client.callTool({ name: 'project_open', arguments: { project: root } })).content[0].text).open, root);
    const ok = await client.callTool({ name: 'scene_update', arguments: { id: 'tour', patch: { durationFrames: 30 } } });
    assert.equal(ok.isError, undefined);
    assert.equal(JSON.parse(await readFile(path.join(root, 'scenes', 'tour.json'), 'utf8')).durationFrames, 30);
  } finally { await client.close(); }
});

test('grouped mode lists core tools and reaches the rest through toolset_enable and toolset_call', async () => {
  const root = await fixture(), client = await connect([root, '--toolsets=core']);
  try {
    assert.match(client.getInstructions(), /toolset_enable/);
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    assert.ok(names.includes('project_get') && names.includes('toolset_enable') && names.includes('toolset_call'));
    assert.ok(!names.includes('camera_set_shots') && !names.includes('brief_get'));
    const changed = new Promise((resolve) => client.setNotificationHandler(ToolListChangedNotificationSchema, resolve));
    const enabled = JSON.parse((await client.callTool({ name: 'toolset_enable', arguments: { groups: ['screen'] } })).content[0].text);
    assert.ok(enabled.tools.some((tool) => tool.name === 'camera_set_shots' && tool.inputSchema.type === 'object'));
    await changed;
    assert.ok((await client.listTools()).tools.some((tool) => tool.name === 'camera_set_shots'));
    const viaCall = await client.callTool({ name: 'toolset_call', arguments: { name: 'camera_set_shots', input: { id: 'tour', shots: [{ at: 0 }, { at: 1, zoom: 2 }] } } });
    assert.equal(viaCall.isError, undefined);
    assert.equal(JSON.parse(await readFile(path.join(root, 'scenes', 'tour.json'), 'utf8')).camera.shots[1].zoom, 2);
    assert.equal((await client.callTool({ name: 'toolset_enable', arguments: { groups: ['nope'] } })).isError, true);
  } finally { await client.close(); }
});

test('render_frame returns the PNG as MCP image content', async () => {
  const root = await fixture(), client = await connect([root]);
  try {
    const result = await client.callTool({ name: 'render_frame', arguments: { id: 'tour', frame: 0, width: 160 } });
    const image = result.content.find((part) => part.type === 'image');
    assert.equal(image.mimeType, 'image/png');
    assert.equal(Buffer.from(image.data, 'base64').readUInt32BE(16), 160);
  } finally { await client.close(); }
});

test('proxy mode sends changes through the running studio so its history and events see them', async () => {
  const root = await fixture(), preview = await startPreview(root, 0), controller = new AbortController();
  const client = await connect([], { JOEFLUX_URL: preview.url, JOEFLUX_TOKEN: preview.token }), headers = { 'x-joeflux-token': preview.token, 'content-type': 'application/json' };
  try {
    const stream = await fetch(new URL('/api/events', preview.url), { headers, signal: controller.signal }), reader = stream.body.getReader(), decoder = new TextDecoder();
    const result = await client.callTool({ name: 'scene_update', arguments: { id: 'tour', patch: { durationFrames: 30 } } });
    assert.equal(result.isError, undefined);
    let text = '';
    while (!text.includes('"tool":"scene_update"')) text += decoder.decode((await reader.read()).value);
    assert.match(text, /"source":"tool"/);
    const history = await (await fetch(new URL('/api/tools/history_list', preview.url), { method: 'POST', headers, body: '{}' })).json();
    assert.deepEqual(history.entries.map((entry) => entry.summary), ['Edit tour']);
    const bad = await client.callTool({ name: 'scene_update', arguments: { id: 'tour', patch: { durationFrames: -2 } } });
    assert.equal(bad.isError, true); assert.match(bad.content[0].text, /durationFrames/);
  } finally { controller.abort(); await client.close(); await preview.close(); }
});

test('setup registers the server for each client and keeps other entries', async () => {
  const harness = await mkdtemp(path.join(tmpdir(), 'harness setup ')), project = path.join(harness, 'projects', 'demo');
  await mkdir(path.join(harness, '.codex'), { recursive: true });
  await writeFile(path.join(harness, '.codex', 'config.toml'), 'model = "x"\n');
  await writeFile(path.join(harness, '.mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'x' } } }));
  for (const client of ['claude', 'codex', 'copilot']) { await setupMcp(harness, { project, client }); await setupMcp(harness, { project, client }); }
  const claude = JSON.parse(await readFile(path.join(harness, '.mcp.json'), 'utf8'));
  assert.deepEqual(Object.keys(claude.mcpServers).sort(), ['joeflux', 'other']);
  assert.deepEqual(claude.mcpServers['joeflux'].args, [path.join(harness, 'packages/mcp/src/server.js'), project]);
  const codex = await readFile(path.join(harness, '.codex', 'config.toml'), 'utf8');
  assert.equal(codex.match(/\[mcp_servers\.joeflux\]/g).length, 1); assert.match(codex, /^model = "x"/);
  const vscode = JSON.parse(await readFile(path.join(harness, '.vscode', 'mcp.json'), 'utf8'));
  assert.equal(vscode.servers['joeflux'].type, 'stdio');
  await assert.rejects(setupMcp(harness, { project, client: 'other' }), /claude, codex or copilot/);
});
