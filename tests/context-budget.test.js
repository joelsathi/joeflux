import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { DIRECTOR_TOOLSETS, SYSTEM_PROMPT } from '../packages/agents/src/index.js';
import { GROUPED_INSTRUCTIONS, INSTRUCTIONS, groupedTools } from '../packages/mcp/src/server.js';
import { createProjectTools } from '../packages/tools/src/index.js';
import { TOOL_GROUPS } from '../packages/tools/src/groups.js';

// Estimated tokens, as in scripts/measure-agent-context.mjs. Raise a budget only deliberately:
// every agent turn or catalog call pays for the growth.
const tokens = (value) => Math.round((typeof value === 'string' ? value : JSON.stringify(value)).length / 4);
const tools = createProjectTools(path.resolve('projects/motion-showcase'));
const within = (label, actual, budget) => assert.ok(actual <= budget, `${label}: ${actual} tokens exceeds the ${budget}-token budget`);

const definitions = (list) => tokens(list.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })));

test('the fixed context of every agent turn stays within budget', async () => {
  within('all tool definitions', definitions(tools.list()), 11500);
  within('core tools listed to Claude Code', definitions(await groupedTools(tools, []).list()), 4000);
  within('tools listed to the director', definitions(await groupedTools(tools, DIRECTOR_TOOLSETS.split(',').filter((group) => group !== 'core')).list()), 9500);
  within('system prompt and MCP instructions', tokens(SYSTEM_PROMPT) + tokens(INSTRUCTIONS) + tokens(GROUPED_INSTRUCTIONS), 600);
});

test('every tool belongs to exactly one group', () => {
  const grouped = Object.values(TOOL_GROUPS).flatMap((group) => group.tools);
  assert.deepEqual(grouped.filter((name, index) => grouped.indexOf(name) !== index), [], 'listed twice');
  assert.deepEqual(tools.list().map((tool) => tool.name).filter((name) => !grouped.includes(name)), [], 'add new tools to packages/tools/src/groups.js');
  assert.deepEqual(grouped.filter((name) => !tools.list().some((tool) => tool.name === name)), [], 'no such tool');
});

test('default read and catalog results stay summaries', async () => {
  within('template_list', tokens(await tools.call('template_list')), 4000);
  within('catalog', tokens(await tools.call('catalog')), 1000);
  within('project_get', tokens(await tools.call('project_get')), 1000);
  within('skill_list', tokens(await tools.call('skill_list')), 500);
  within('brand_kit_get', tokens(await tools.call('brand_kit_get', { id: 'example' })), 600);
});

test('each skill entry point stays small enough to load on demand', async () => {
  for (const name of await readdir('skills')) within(`skills/${name}/SKILL.md`, tokens(await readFile(path.join('skills', name, 'SKILL.md'), 'utf8')), 1200);
});
