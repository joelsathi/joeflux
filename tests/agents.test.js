import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AGENTS, DIRECTOR_TOOLSETS, SYSTEM_PROMPT, detectAgents, loginAgent, runAgent } from '../packages/agents/src/index.js';
import { startPreview } from '../packages/preview-server/src/index.js';

const fake = { ...AGENTS.claude, status: undefined, login: undefined, label: 'Fake', command: process.execPath, args: async (options) => [path.resolve('tests/fixtures/fake-agent.mjs'), ...await AGENTS.claude.args(options)] };
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'harness agents '));
  await mkdir(path.join(root, 'scenes'));
  await writeFile(path.join(root, 'scenes', 'title.json'), JSON.stringify({ id: 'title', preset: 'text-settle', durationFrames: 24, params: { title: 'Hi' } }));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ name: 'Agents', version: 1, output: { width: 320, height: 180, fps: 24, audio: false }, assets: {}, scenes: [{ id: 'title', file: 'scenes/title.json' }] }));
  return root;
}
const collect = async (events) => { const all = []; for await (const event of events) all.push(event); return all; };
const parse = (agent, lines) => { const parser = AGENTS[agent].parser(); return lines.flatMap((line) => parser(JSON.stringify(line))); };

test('Claude Code stream-json becomes normalized events and hides its internal tools', () => {
  const events = parse('claude', [
    { type: 'system', subtype: 'init', session_id: 's1' },
    { type: 'rate_limit_event' },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'a', name: 'ToolSearch', input: {} }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'a', content: [{ type: 'tool_reference' }] }] } },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'Checking.' }, { type: 'tool_use', id: 'b', name: 'mcp__joeflux__catalog', input: {} }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'b', content: [{ type: 'text', text: '{"themes":[]}' }] }] } },
    { type: 'result', subtype: 'success', is_error: false, result: '12' },
  ]);
  assert.deepEqual(events, [
    { type: 'session', id: 's1' }, { type: 'text', text: 'Checking.' },
    { type: 'tool_call', id: 'b', name: 'catalog', input: {} }, { type: 'tool_result', id: 'b', ok: true, text: '{"themes":[]}' },
    { type: 'done', ok: true },
  ]);
  assert.deepEqual(parse('claude', [{ type: 'result', subtype: 'error_max_turns', is_error: true }]), [{ type: 'error', message: 'error_max_turns' }, { type: 'done', ok: false }]);
});

test('Codex exec JSON becomes normalized events, including nested API errors', () => {
  const events = parse('codex', [
    { type: 'thread.started', thread_id: 't1' },
    { type: 'item.completed', item: { id: 'item_0', type: 'error', message: 'Model metadata not found.' } },
    { type: 'item.started', item: { id: 'item_1', type: 'mcp_tool_call', server: 'joeflux', tool: 'scene_update', arguments: { id: 'x' }, status: 'in_progress' } },
    { type: 'item.completed', item: { id: 'item_1', type: 'mcp_tool_call', server: 'joeflux', tool: 'scene_update', result: { content: [{ type: 'text', text: 'ok' }] }, error: null, status: 'completed' } },
    { type: 'item.completed', item: { id: 'item_2', type: 'agent_message', text: 'Updated.' } },
    { type: 'turn.completed', usage: {} },
  ]);
  assert.deepEqual(events, [
    { type: 'session', id: 't1' }, { type: 'tool_call', id: 'item_1', name: 'scene_update', input: { id: 'x' } },
    { type: 'tool_result', id: 'item_1', ok: true, text: 'ok' }, { type: 'text', text: 'Updated.' }, { type: 'done', ok: true },
  ]);
  const failed = parse('codex', [{ type: 'error', message: JSON.stringify({ type: 'error', status: 400, error: { message: 'The model requires a newer version of Codex.' } }) }, { type: 'turn.failed', error: { message: 'x' } }]);
  assert.deepEqual(failed, [{ type: 'error', message: 'The model requires a newer version of Codex.' }, { type: 'done', ok: false }]);
});

test('adapters pass the MCP server, system prompt, model and session to each CLI', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'harness adapter ')), server = { command: 'node', args: ['server.js', '/p'], env: { JOEFLUX_URL: 'http://127.0.0.1:1/' } };
  const claude = await AGENTS.claude.args({ prompt: 'hi', session: 's1', model: 'haiku', server, dir, system: SYSTEM_PROMPT });
  assert.deepEqual(claude.slice(claude.indexOf('--resume')), ['--resume', 's1']);
  assert.ok(claude.includes('--strict-mcp-config') && claude.includes('mcp__joeflux__*'));
  assert.deepEqual(JSON.parse(await readFile(claude[claude.indexOf('--mcp-config') + 1], 'utf8')).mcpServers['joeflux'], server);
  const codex = AGENTS.codex.args({ prompt: 'hi', session: 't1', model: 'm', server, project: '/p' });
  assert.deepEqual(codex.slice(0, 2), ['exec', 'resume']); assert.deepEqual(codex.slice(-2), ['t1', 'hi']);
  assert.equal(codex.includes('-C'), false, 'resume has no -C option; runAgent supplies the project cwd');
  assert.equal(codex[codex.indexOf('-m') + 1], 'm');
  assert.ok(codex.includes('mcp_servers.joeflux.env={JOEFLUX_URL="http://127.0.0.1:1/"}'));
  const copilot = AGENTS.copilot.args({ prompt: 'hi', server, system: 'SYS' });
  assert.equal(JSON.parse(copilot[copilot.indexOf('--additional-mcp-config') + 1]).mcpServers['joeflux'].type, 'local');
});

test('Codex follow-up runs in the project directory', async () => {
  const root = await fixture();
  const adapter = { ...AGENTS.codex, command: process.execPath, args(options) {
    const args = AGENTS.codex.args(options);
    return ['-e', `const args=process.argv.slice(1); if(args.includes('-C')) { console.error('unexpected argument -C'); process.exit(2); } console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:process.cwd()}})); console.log(JSON.stringify({type:'turn.completed'}));`, ...args];
  } };
  const events = await collect(runAgent({ agent: 'codex', agents: { codex: adapter }, prompt: 'Continue', session: 't1', project: root }));
  assert.deepEqual(events, [{ type: 'text', text: await realpath(root) }, { type: 'done', ok: true }]);
});

test('chat runs an agent that edits the project through the studio', async () => {
  const root = await fixture(), preview = await startPreview(root, 0, { agents: { fake } });
  const headers = { 'x-joeflux-token': preview.token, 'content-type': 'application/json' };
  try {
    const response = await fetch(new URL('/api/chat', preview.url), { method: 'POST', headers, body: JSON.stringify({ agent: 'fake', prompt: JSON.stringify({ tool: 'scene_update', arguments: { id: 'title', patch: { durationFrames: 36 } } }), context: 'Selected scene: title' }) });
    const events = (await response.text()).split('\n\n').filter((chunk) => chunk.startsWith('data: ')).map((chunk) => JSON.parse(chunk.slice(6)));
    assert.deepEqual(events.map((event) => event.type), ['session', 'tool_call', 'tool_result', 'text', 'done']);
    assert.equal(events[2].ok, true); assert.equal(events.at(-1).ok, true);
    assert.equal(JSON.parse(await readFile(path.join(root, 'scenes', 'title.json'), 'utf8')).durationFrames, 36);
    const history = await (await fetch(new URL('/api/tools/history_list', preview.url), { method: 'POST', headers, body: '{}' })).json();
    assert.deepEqual(history.entries.map((entry) => entry.summary), ['Edit title'], 'agent edits land in the studio history');
    assert.deepEqual(await (await fetch(new URL('/api/agents', preview.url), { headers })).json(), [{ id: 'fake', label: 'Fake', available: true, version: process.version, signedIn: null, account: null }]);
    assert.equal((await fetch(new URL('/api/chat', preview.url), { method: 'POST', headers, body: JSON.stringify({ agent: 'fake', prompt: ' ' }) })).status, 400);
    const unknown = await (await fetch(new URL('/api/chat', preview.url), { method: 'POST', headers, body: JSON.stringify({ agent: 'missing', prompt: 'hi' }) })).text();
    assert.match(unknown, /Unknown agent/);
  } finally { await preview.close(); }
});

test('the director lists its tool groups and reports toolset_call under the tool it ran', async () => {
  const root = await fixture();
  const prompt = JSON.stringify({ tool: 'toolset_call', arguments: { name: 'scene_update', input: { id: 'title', patch: { durationFrames: 36 } } } });
  const events = await collect(runAgent({ agent: 'fake', agents: { fake }, prompt, project: root }));
  const call = events.find((event) => event.type === 'tool_call');
  assert.equal(call.name, 'scene_update'); assert.deepEqual(call.input, { id: 'title', patch: { durationFrames: 36 } });
  assert.equal(events.find((event) => event.type === 'tool_result').ok, true);
  assert.equal(JSON.parse(await readFile(path.join(root, 'scenes', 'title.json'), 'utf8')).durationFrames, 36);
  assert.equal(DIRECTOR_TOOLSETS, 'core,screen,brief,review');
});

test('a failing agent reports its error and a cancelled one is stopped', async () => {
  const root = await fixture(), agents = { fake };
  const failed = await collect(runAgent({ agent: 'fake', agents, prompt: 'FAIL', project: root }));
  assert.deepEqual(failed, [{ type: 'error', message: 'fake agent failed' }, { type: 'done', ok: false }]);
  const controller = new AbortController(), started = Date.now();
  setTimeout(() => controller.abort(), 300);
  const cancelled = await collect(runAgent({ agent: 'fake', agents, prompt: 'SLOW', project: root, signal: controller.signal }));
  assert.deepEqual(cancelled, [{ type: 'done', ok: false, cancelled: true }]);
  assert.ok(Date.now() - started < 5000);
  assert.deepEqual(detectAgents({ none: { label: 'None', command: 'harness-missing-cli' } }), [{ id: 'none', label: 'None', available: false, version: null, signedIn: null, account: null }]);
});

test('sign-in status and login run through the CLI\'s own commands', async () => {
  const script = (code) => ['-e', code];
  const agent = (status, login) => ({ label: 'Vendor', command: process.execPath, status: { args: script(status), parse: AGENTS.codex.status.parse }, login: script(login) });
  const signedIn = agent('console.log("Logged in using ChatGPT")', 'console.log("Open https://example.test/login"); console.error("waiting"); setTimeout(()=>console.log("Signed in"),100)');
  assert.deepEqual(detectAgents({ vendor: signedIn }), [{ id: 'vendor', label: 'Vendor', available: true, version: process.version, signedIn: true, account: 'ChatGPT' }]);
  assert.deepEqual(detectAgents({ vendor: agent('console.log("Not logged in"); process.exit(1)', '') })[0].signedIn, false);
  assert.deepEqual(AGENTS.claude.status.parse('{"loggedIn":true,"authMethod":"claude.ai","email":"a@b.c"}'), { signedIn: true, account: 'a@b.c' });
  const events = await collect(loginAgent({ agent: 'vendor', agents: { vendor: signedIn } }));
  assert.deepEqual(events.map((event) => event.text ?? event.type).sort(), ['Open https://example.test/login', 'Signed in', 'done', 'waiting']);
  assert.equal(events.at(-1).ok, true);
  await assert.rejects(collect(loginAgent({ agent: 'copilot' })), /from a terminal/);
  const root = await fixture(), preview = await startPreview(root, 0, { agents: { vendor: signedIn } });
  try {
    const headers = { 'x-joeflux-token': preview.token, 'content-type': 'application/json' };
    const stream = await (await fetch(new URL('/api/agents/vendor/login', preview.url), { method: 'POST', headers, body: '{}' })).text();
    assert.match(stream, /example\.test\/login[\s\S]*"type":"done","ok":true/);
    assert.equal((await (await fetch(new URL('/api/agents?refresh', preview.url), { headers })).json())[0].signedIn, true);
  } finally { await preview.close(); }
});

test('desktop auth passes a key only to the selected CLI and redacts provider output', async () => {
  const key = 'sk-test-desktop-secret', root = await fixture();
  const adapter = { command: process.execPath, label: 'Probe', args: ({ server }) => ['-e', `
    if (process.env.CODEX_API_KEY !== ${JSON.stringify(key)}) throw Error('missing key');
    if (process.env.ANTHROPIC_API_KEY) throw Error('inherited wrong provider');
    console.log(JSON.stringify({type:'text',text:process.env.CODEX_API_KEY}));
    console.error(process.env.CODEX_API_KEY); process.exitCode=1;
  `], parser: () => JSON.parse.bind(JSON) };
  adapter.parser = () => line => [JSON.parse(line)];
  const previous = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'unrelated-inherited-key';
  try {
    const events = await collect(runAgent({ agent: 'codex', agents: { codex: adapter }, prompt: 'test', project: root, auth: { mode: 'api-key', key } }));
    assert.equal(events[0].text, '[REDACTED]');
    assert.equal(events[1].message, '[REDACTED]');
    assert.ok(!JSON.stringify(events).includes(key));
    assert.equal(process.env.ANTHROPIC_API_KEY, 'unrelated-inherited-key');
  } finally { if (previous === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = previous; }
});

test('desktop account detection ignores inherited API keys without changing the environment', () => {
  const previous = process.env.CODEX_API_KEY;
  process.env.CODEX_API_KEY = 'inherited';
  try {
    const adapter = { label: 'Probe', command: process.execPath, status: { args: ['-e', 'console.log(process.env.CODEX_API_KEY ? "API" : "Account")'], parse: output => ({ signedIn: true, account: output }) } };
    assert.equal(detectAgents({ codex: adapter }, { desktop: true })[0].account, 'Account');
    assert.equal(detectAgents({ codex: adapter })[0].account, 'API');
    assert.equal(process.env.CODEX_API_KEY, 'inherited');
  } finally { if (previous === undefined) delete process.env.CODEX_API_KEY; else process.env.CODEX_API_KEY = previous; }
});
