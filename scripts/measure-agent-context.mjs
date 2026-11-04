// Measures what the AI director receives and writes website/src/data/context-budget.json.
// Token counts are estimates: characters / 4.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DIRECTOR_TOOLSETS, SYSTEM_PROMPT } from '../packages/agents/src/index.js';
import { GROUPED_INSTRUCTIONS, INSTRUCTIONS, groupedTools } from '../packages/mcp/src/server.js';
import { createProjectTools } from '../packages/tools/src/index.js';

const tokens = (text) => Math.round(String(text).length / 4);
const json = (value) => JSON.stringify(value);
const imageTokens = (width, height) => Math.round((width * height) / 750);
const tools = createProjectTools(path.resolve('projects/motion-showcase'));

const definitions = tools.list().map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
const listed = async (groups) => tokens(json((await groupedTools(tools, groups).list()).map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))));
const perTool = definitions.map((tool) => ({ label: tool.name, value: tokens(json(tool)) })).sort((a, b) => b.value - a.value);

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat();
}
const skillFiles = (await files('skills')).filter((file) => file.endsWith('.md'));
const skillText = await Promise.all(skillFiles.map((file) => readFile(file, 'utf8')));
const entrySkills = skillFiles.filter((file) => file.endsWith('SKILL.md'));
const largestSkill = Math.max(...await Promise.all(entrySkills.map(async (file) => tokens(await readFile(file, 'utf8')))));

const project = await tools.call('project_get', { detail: 'full' });
const scene = project.scenes.map(({ fingerprint, ...item }) => item).sort((a, b) => json(b).length - json(a).length)[0];
const patch = { id: scene.id, patch: { params: { title: 'One view of every service.' } } };
const kits = await tools.call('brand_kit_list'), kit = await tools.call('brand_kit_get', { id: 'example' });
const catalogs = {
  templateList: tokens(json(await tools.call('template_list'))),
  templateCategory: tokens(json(await tools.call('template_list', { category: 'Transitions' }))),
  templatePreview: tokens(json(await tools.call('template_list', { preview: true }))),
  catalog: tokens(json(await tools.call('catalog'))),
  catalogWithSchema: tokens(json(await tools.call('catalog', { include: ['screenScene'] }))),
};

const budget = {
  method: 'Estimated tokens = characters / 4. Image tokens = width × height / 750. Measured on projects/motion-showcase.',
  fixed: {
    systemPrompt: tokens(SYSTEM_PROMPT),
    mcpInstructions: tokens(INSTRUCTIONS),
    toolCount: definitions.length,
    toolDefinitions: tokens(json(definitions)),
    groupedInstructions: tokens(GROUPED_INSTRUCTIONS),
    coreTools: await listed([]),
    directorTools: await listed(DIRECTOR_TOOLSETS.split(',').filter((group) => group !== 'core')),
  },
  largestTools: perTool.slice(0, 8),
  skills: {
    catalog: tokens(json(await tools.call('skill_list'))),
    largestSkill,
    everything: tokens(skillText.join('\n')),
    files: skillFiles.length,
  },
  edits: { fullScene: tokens(json(scene)), mergePatch: tokens(json(patch)) },
  results: { prettyProject: tokens(JSON.stringify(project, null, 2)), compactProject: tokens(json(project)), summaryProject: tokens(json(await tools.call('project_get'))) },
  brand: { list: tokens(json(kits)), detail: tokens(json(kit)) },
  catalogs,
  images: { renderFrame: imageTokens(960, 540), qualityReview: 3 * imageTokens(640, 360), fullResolution: imageTokens(1568, 882) },
};
await writeFile('website/src/data/context-budget.json', `${JSON.stringify(budget, null, 2)}\n`);
console.log(JSON.stringify(budget, null, 2));
