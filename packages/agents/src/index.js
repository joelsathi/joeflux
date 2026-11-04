import { nodeSubprocessEnvironment } from '../../core/src/runtime.js';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';

const MCP_SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../mcp/src/server.js');
const PREFIX = 'mcp__joeflux__';
// The groups the system prompt relies on; composition and media load through toolset_enable.
export const DIRECTOR_TOOLSETS = 'core,screen,brief,review';
// A tool reached through toolset_call is reported under its own name.
const unwrapCall = (event) => event.type === 'tool_call' && event.name === 'toolset_call' ? { ...event, name: event.input?.name ?? event.name, input: event.input?.input ?? {} } : event;

export const SYSTEM_PROMPT = `Direct silent videos through joeflux MCP tools. Start project_get and brief_get. Preserve settled answers, dependencies and locks; ask unresolved questions with recommendations. Save provenance and reopen reasons via brief_* tools.
If project.brand names a kit, read brand_kit_get once and follow its guidelines. For animation requests, read skill_get animation-engines and let the user choose an engine before applying it; skill_list has other guidance. Start brief_interview_start only on explicit request; follow pinned skills and finish with shared understanding.
Use typed edits. After edits, quality_review, inspect frames and review_clip/boundaries, then validate. Tests are not creative approval. Use knowledge_search; unviewed patterns stay hypotheses. Separate taste/performance in review_record. Save style preferences. Reply with changes and evidence.`;

const textOf = (content) => Array.isArray(content) ? content.map((part) => part.text ?? '').join('\n') : typeof content === 'string' ? content : '';
const innerMessage = (message = '') => { try { return JSON.parse(message).error?.message ?? message; } catch { return message; } };

// Each adapter turns one prompt into CLI arguments and its output lines into
// normalized events: session | text | tool_call | tool_result | error | done.
export const AGENTS = {
  claude: {
    label: 'Claude Code', command: 'claude', login: ['auth', 'login'],
    status: { args: ['auth', 'status', '--json'], parse: (output) => { const status = JSON.parse(output); return { signedIn: Boolean(status.loggedIn), account: status.email ?? status.authMethod ?? null }; } },
    async args({ prompt, session, model, server, dir, system }) {
      const config = path.join(dir, 'mcp.json');
      await writeFile(config, JSON.stringify({ mcpServers: { 'joeflux': server } }));
      return ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--mcp-config', config, '--strict-mcp-config', '--allowedTools', `${PREFIX}*`, '--append-system-prompt', system, ...(model ? ['--model', model] : []), ...(session ? ['--resume', session] : [])];
    },
    parser() {
      const calls = new Set();
      return (line) => {
        const event = JSON.parse(line), content = Array.isArray(event.message?.content) ? event.message.content : [];
        if (event.type === 'system' && event.subtype === 'init') return [{ type: 'session', id: event.session_id }];
        if (event.type === 'assistant') return content.flatMap((part) => {
          if (part.type === 'text' && part.text.trim()) return [{ type: 'text', text: part.text }];
          if (part.type === 'tool_use' && part.name.startsWith(PREFIX)) { calls.add(part.id); return [{ type: 'tool_call', id: part.id, name: part.name.slice(PREFIX.length), input: part.input }]; }
          return [];
        });
        if (event.type === 'user') return content.filter((part) => part.type === 'tool_result' && calls.has(part.tool_use_id)).map((part) => ({ type: 'tool_result', id: part.tool_use_id, ok: !part.is_error, text: textOf(part.content) }));
        if (event.type === 'result') return [...(event.is_error ? [{ type: 'error', message: String(event.result ?? event.subtype) }] : []), { type: 'done', ok: !event.is_error }];
        return [];
      };
    },
  },
  codex: {
    label: 'Codex', command: 'codex', login: ['login'],
    status: { args: ['login', 'status'], parse: (output, code) => ({ signedIn: code === 0 && !/not logged in/i.test(output), account: output.match(/logged in using (.+)/i)?.[1]?.trim() ?? null }) },
    args({ prompt, session, model, server, project, system }) {
      const env = Object.entries(server.env).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(', ');
      // exec resume has no -C option; runAgent already supplies cwd for both modes.
      const options = ['--json', '--skip-git-repo-check', ...(!session ? ['-C', project] : []), '-c', `mcp_servers.joeflux.command=${JSON.stringify(server.command)}`, '-c', `mcp_servers.joeflux.args=${JSON.stringify(server.args)}`, '-c', `mcp_servers.joeflux.env={${env}}`, ...(model ? ['-m', model] : [])];
      const directedPrompt = system ? `${system}\n\n${prompt}` : prompt;
      return session ? ['exec', 'resume', ...options, session, directedPrompt] : ['exec', ...options, directedPrompt];
    },
    parser() {
      return (line) => {
        const event = JSON.parse(line), item = event.item ?? {};
        if (event.type === 'thread.started') return [{ type: 'session', id: event.thread_id }];
        if (item.type === 'mcp_tool_call' && event.type === 'item.started') return [{ type: 'tool_call', id: item.id, name: item.tool, input: item.arguments }];
        if (item.type === 'mcp_tool_call' && event.type === 'item.completed') return [{ type: 'tool_result', id: item.id, ok: !item.error && item.status !== 'failed', text: textOf(item.result?.content) || item.error?.message || '' }];
        if (item.type === 'agent_message' && event.type === 'item.completed') return [{ type: 'text', text: item.text }];
        if (event.type === 'error') return [{ type: 'error', message: innerMessage(event.message) }];
        if (event.type === 'turn.failed') return [{ type: 'done', ok: false }];
        if (event.type === 'turn.completed') return [{ type: 'done', ok: true }];
        return [];
      };
    },
  },
  // Copilot CLI prints plain text in prompt mode, so its tool calls are not itemized.
  copilot: {
    label: 'GitHub Copilot', command: 'copilot',
    args({ prompt, model, server, system }) {
      return ['-p', `${system}\n\n${prompt}`, '--allow-tool', 'joeflux', '--additional-mcp-config', JSON.stringify({ mcpServers: { 'joeflux': { type: 'local', ...server, tools: ['*'] } } }), ...(model ? ['--model', model] : [])];
    },
    parser: () => (line) => [{ type: 'text', text: line }],
  },
};

// Desktop account mode ignores inherited API credentials to avoid accidental API billing.
function agentEnvironment(auth, agent) {
  const env = { ...process.env };
  if (auth) {
    for (const name of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'CODEX_API_KEY', 'OPENAI_API_KEY']) delete env[name];
    if (auth.mode === 'api-key') {
      if (!auth.key || !['claude', 'codex'].includes(agent)) throw new Error('API key is unavailable. Open Connections to configure it.');
      env[agent === 'claude' ? 'ANTHROPIC_API_KEY' : 'CODEX_API_KEY'] = auth.key;
    }
  }
  return env;
}

export function detectAgents(agents = AGENTS, { desktop = false } = {}) {
  const env = agentEnvironment(desktop ? { mode: 'cli' } : undefined);
  return Object.entries(agents).map(([id, agent]) => {
    const result = spawnSync(agent.command, ['--version'], { env, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    const available = result.status === 0 && !/install/i.test(output);
    return { id, label: agent.label, available, version: available ? output.split('\n')[0] : null, ...(available && agent.status ? signInStatus(agent, env) : { signedIn: null, account: null }) };
  });
}

function signInStatus(agent, env) {
  const result = spawnSync(agent.command, agent.status.args, { env, encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] });
  try { return agent.status.parse(`${result.stdout ?? ''}${result.stderr ?? ''}`.trim(), result.status); } catch { return { signedIn: false, account: null }; }
}

// Start the CLI's own sign-in (it opens the vendor's browser page); credentials stay with the CLI.
export async function* loginAgent({ agent, agents = AGENTS, signal }) {
  const adapter = agents[agent];
  if (!adapter?.login) throw new Error(`Sign in to ${adapter?.label ?? agent} from a terminal; the studio can't start it.`);
  const child = spawn(adapter.command, adapter.login, { stdio: ['ignore', 'pipe', 'pipe'] });
  const abort = () => child.kill('SIGTERM');
  signal?.addEventListener('abort', abort, { once: true });
  const exited = new Promise((resolve) => { child.once('error', (error) => resolve({ error })); child.once('close', (code) => resolve({ code })); });
  const output = new PassThrough();
  let open = 2;
  for (const stream of [child.stdout, child.stderr]) { stream.pipe(output, { end: false }); stream.once('end', () => { if (--open === 0) output.end(); }); }
  for await (const line of createInterface({ input: output })) if (line.trim()) yield { type: 'text', text: line };
  const { code, error } = await exited;
  signal?.removeEventListener('abort', abort);
  if (error) yield { type: 'error', message: error.message };
  yield { type: 'done', ok: !error && code === 0, cancelled: signal?.aborted || undefined };
}

// Run one prompt through an agent CLI. The agent reaches the project through the
// joeflux MCP server; with studioUrl it proxies to the running studio.
export async function* runAgent({ agent, agents = AGENTS, prompt, session, model, context, project, studioUrl, studioToken, signal, auth }) {
  if (signal?.aborted) return;
  const adapter = agents[agent];
  if (!adapter) throw new Error(`Unknown agent "${agent}". Use one of: ${Object.keys(agents).join(', ')}.`);
  const env = agentEnvironment(auth, agent);
  const redact = value => auth?.key ? JSON.parse(JSON.stringify(value).replaceAll(JSON.stringify(auth.key).slice(1, -1), '[REDACTED]')) : value;
  const dir = await mkdtemp(path.join(tmpdir(), 'harness-agent-')), tokenFile = path.join(dir, 'token');
  // A private file keeps the session token out of CLI arguments, which other local users can list.
  const server = { command: process.execPath, args: [MCP_SERVER, project], env: { ...nodeSubprocessEnvironment(), JOEFLUX_TOOLSETS: DIRECTOR_TOOLSETS, ...(auth ? { ANTHROPIC_API_KEY: '', CODEX_API_KEY: '', OPENAI_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '', CLAUDE_CODE_OAUTH_TOKEN: '' } : {}), ...(studioUrl ? { JOEFLUX_URL: studioUrl, ...(studioToken ? { JOEFLUX_TOKEN_FILE: tokenFile } : {}) } : {}) } };
  let child;
  try {
    if (studioUrl && studioToken) await writeFile(tokenFile, studioToken, { mode: 0o600 });
    const args = await adapter.args({ prompt: context ? `${context}\n\n${prompt}` : prompt, session, model, server, dir, project, system: SYSTEM_PROMPT });
    if (signal?.aborted) return;
    child = spawn(adapter.command, args, { cwd: project, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const abort = () => child.kill('SIGTERM');
    signal?.addEventListener('abort', abort, { once: true });
    let stderr = '', done = false;
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    const exited = new Promise((resolve) => { child.once('error', (error) => resolve({ error })); child.once('close', (code, exitSignal) => resolve({ code, exitSignal })); });
    const parse = adapter.parser();
    for await (const line of createInterface({ input: child.stdout })) {
      if (!line.trim()) continue;
      let events;
      try { events = parse(line); } catch { events = [{ type: 'text', text: line }]; }
      for (const event of events.map(unwrapCall)) { if (event.type === 'done') done = true; yield redact(event); }
    }
    const { code, error, exitSignal } = await exited;
    signal?.removeEventListener('abort', abort);
    if (signal?.aborted) { yield { type: 'done', ok: false, cancelled: true }; return; }
    if (error || (!done && code !== 0)) yield redact({ type: 'error', message: error?.message ?? (stderr.trim().split('\n').slice(-3).join('\n') || `${adapter.label} exited with ${exitSignal ?? `code ${code}`}.`) });
    if (!done) yield { type: 'done', ok: !error && code === 0 };
  } finally {
    if (child && child.exitCode === null) child.kill('SIGTERM');
    await rm(dir, { recursive: true, force: true });
  }
}
