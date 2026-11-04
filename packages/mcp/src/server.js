#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createProjectTools } from '../../tools/src/index.js';
import { TOOL_GROUPS, groupOf } from '../../tools/src/groups.js';

const HARNESS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export const INSTRUCTIONS = `Edit a silent video project. Call project_get first, and catalog for available moves and themes (include ["screenScene"] adds the screen-scene schema). skill_list and skill_get provide production guidance on demand; brand_kit_get provides the project's brand rules.
Screen recordings use kind "screen": change framing with camera_set_shots or camera_apply_move, how the camera moves (easing, flow, drift) with camera_style, and presentation with screen_set.
Use scene_update (JSON merge patch) for other edits. Every change is validated and undoable; mutating tools return _change {id, summary, details}, and history_undo {entryId} undoes exactly that change while it is still the latest.
After a visual change, call quality_review and inspect its three frames against the rubric yourself: its findings are heuristics, not visual approval. Iterate if needed, then validate. Check a transition with transition_preview. For user-requested choices call variation_generate and inspect its three preset posters.`;

export const HARNESS_INSTRUCTIONS = 'This server was started without a project: call project_open with a projects/<name> path before other tools, and again to switch projects.';

const PROJECT_OPEN = {
  name: 'project_open',
  description: 'Open the project that the other tools act on, or switch to another one. Without a project it returns the open project and the available projects.',
  inputSchema: { type: 'object', properties: { project: { type: 'string', description: 'Project directory relative to the harness root, such as projects/motion-showcase, or an absolute path.' } }, additionalProperties: false },
};

// Harness mode: one server for every project, so a committed client config needs no machine paths.
function harnessTools(root) {
  const definitions = createProjectTools(root).list();
  const available = async () => (await readdir(path.join(root, 'projects'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && existsSync(path.join(root, 'projects', entry.name, 'project.json')))
    .map((entry) => `projects/${entry.name}`).sort();
  let current = null, opened = null;
  return {
    list: async () => [PROJECT_OPEN, ...definitions],
    async call(name, input = {}) {
      if (name === 'project_open') {
        if (!input.project) return { open: opened, projects: await available() };
        const target = path.resolve(root, input.project), relative = path.relative(root, target);
        if (!existsSync(path.join(target, 'project.json'))) throw new Error(`No project.json in ${input.project}. Available: ${(await available()).join(', ')}`);
        current = createProjectTools(target); opened = relative.startsWith('..') ? target : relative;
        return { open: opened };
      }
      if (!current) throw new Error(`No project is open. Call project_open with one of: ${(await available()).join(', ')}`);
      return current.call(name, input);
    },
  };
}

const OPTIONAL_GROUPS = Object.keys(TOOL_GROUPS).filter((group) => group !== 'core');
export const GROUPED_INSTRUCTIONS = 'Only some tool groups are listed. toolset_enable adds a group and returns its tool definitions; screen recordings need the "screen" group.';
export const TOOLSET_TOOLS = [
  {
    name: 'toolset_enable',
    description: `Add tool groups and return their definitions. Call the new tools directly if they appear in your tool list, otherwise through toolset_call. Groups: ${OPTIONAL_GROUPS.map((group) => `${group} (${TOOL_GROUPS[group].summary})`).join('; ')}`,
    inputSchema: { type: 'object', properties: { groups: { type: 'array', items: { type: 'string', enum: OPTIONAL_GROUPS } } }, required: ['groups'] },
  },
  {
    name: 'toolset_call',
    description: 'Call any joeflux tool by name with its input, for tools your client has not listed yet.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, input: { type: 'object' } }, required: ['name'] },
  },
];

// Grouped mode: list the core tools and enable the rest on demand. Every tool stays callable,
// so clients that ignore list_changed (such as headless Claude Code) still reach them via toolset_call.
export function groupedTools(tools, groups, onChange = () => {}) {
  const unknown = groups.filter((group) => !TOOL_GROUPS[group]);
  if (unknown.length) throw new Error(`Unknown tool groups: ${unknown.join(', ')}. Use all or: ${Object.keys(TOOL_GROUPS).join(', ')}`);
  const enabled = new Set(['core', ...groups]), visible = (name) => enabled.has(groupOf(name) ?? 'core');
  return {
    list: async () => [...(await tools.list()).filter((tool) => visible(tool.name)), ...TOOLSET_TOOLS],
    async call(name, input = {}) {
      if (name !== 'toolset_enable') return tools.call(name, input);
      const requested = input.groups ?? [], invalid = requested.filter((group) => !OPTIONAL_GROUPS.includes(group));
      if (invalid.length) throw new Error(`Unknown tool groups: ${invalid.join(', ')}. Use: ${OPTIONAL_GROUPS.join(', ')}`);
      const added = requested.filter((group) => !enabled.has(group));
      for (const group of added) enabled.add(group);
      if (added.length) await onChange();
      const definitions = (await tools.list()).filter((tool) => requested.includes(groupOf(tool.name))).map(({ name: tool, description, inputSchema }) => ({ name: tool, description, inputSchema }));
      return { enabled: [...enabled], tools: definitions };
    },
  };
}

// Proxy mode: forward to a running studio so its history, queue and live events see every change.
function remoteTools(base, token) {
  const request = async (pathname, body) => {
    const headers = { 'x-joeflux-token': token, ...(body === undefined ? {} : { 'content-type': 'application/json' }) };
    const response = await fetch(new URL(pathname, base), body === undefined ? { headers } : { method: 'POST', headers, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error), { issues: result.issues ?? [] });
    return result;
  };
  return { list: () => request('/api/tools'), call: (name, input) => request(`/api/tools/${encodeURIComponent(name)}`, input) };
}

export async function toolResult(tools, name, input) {
  if (name === 'toolset_call') return toolResult(tools, input?.name, input?.input);
  try {
    const result = await tools.call(name, input ?? {});
    const content = [{ type: 'text', text: JSON.stringify(result) }];
    if (name === 'render_frame') content.push({ type: 'image', mimeType: 'image/png', data: (await readFile(result.path)).toString('base64') });
    if (name === 'quality_review' || name === 'variation_generate') for (const item of name === 'quality_review' ? result.images : result) content.push({ type: 'image', mimeType: 'image/png', data: (await readFile(item.path)).toString('base64') });
    return { content };
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: [error.message, ...(error.issues ?? [])].join('\n') }] };
  }
}

export async function startMcpServer({ project = process.env.JOEFLUX_PROJECT, url = process.env.JOEFLUX_URL, toolsets = process.env.JOEFLUX_TOOLSETS } = {}) {
  // The per-run file wins over an exported token, which may belong to an earlier studio run.
  const token = process.env.JOEFLUX_TOKEN_FILE ? (await readFile(process.env.JOEFLUX_TOKEN_FILE, 'utf8')).trim() : process.env.JOEFLUX_TOKEN;
  if (url && !token) throw new Error('Proxy mode needs the studio session token in JOEFLUX_TOKEN or JOEFLUX_TOKEN_FILE.');
  const base = url ? remoteTools(url, token) : project ? createProjectTools(path.resolve(project)) : harnessTools(HARNESS_ROOT);
  // JOEFLUX_TOOLSETS lists the groups to show (core is always shown); unset or "all" lists every tool.
  const groups = !toolsets || toolsets === 'all' ? null : toolsets.split(',').map((group) => group.trim()).filter(Boolean);
  let server;
  const tools = groups ? groupedTools(base, groups, () => server.sendToolListChanged()) : base;
  const instructions = [INSTRUCTIONS, ...(url || project ? [] : [HARNESS_INSTRUCTIONS]), ...(groups ? [GROUPED_INSTRUCTIONS] : [])].join('\n');
  server = new Server({ name: 'joeflux', version: '0.1.0' }, { capabilities: { tools: { listChanged: true } }, instructions });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: (await tools.list()).map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) }));
  server.setRequestHandler(CallToolRequestSchema, ({ params }) => toolResult(tools, params.name, params.arguments));
  await server.connect(new StdioServerTransport());
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  // server.js [project] [--toolsets=core,screen]; the flag keeps client configs free of env blocks.
  const args = process.argv.slice(2), flag = args.find((arg) => arg.startsWith('--toolsets='));
  startMcpServer({ project: args.find((arg) => !arg.startsWith('--')) ?? process.env.JOEFLUX_PROJECT, toolsets: flag?.slice('--toolsets='.length) ?? process.env.JOEFLUX_TOOLSETS }).catch((error) => { process.stderr.write(`${error.message}\n`); process.exit(1); });
}
