import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { skillDrift } from '../scripts/sync-skills.mjs';

const root = path.resolve('.');
const read = (file) => readFile(path.join(root, file), 'utf8');
const skills = async () => (await readdir(path.join(root, 'skills'), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);

test('the Codex and Claude skill copies match skills/', async () => {
  assert.deepEqual(await skillDrift(), [], 'Run pnpm run skills:sync.');
});

test('each skill names itself, carries Codex metadata and refers to other skills by name', async () => {
  for (const name of await skills()) {
    const skill = await read(`skills/${name}/SKILL.md`);
    assert.match(skill, new RegExp(`^---\\nname: ${name}\\ndescription: .+\\n---`), name);
    assert.match(await read(`skills/${name}/agents/openai.yaml`), /display_name: .+\n\s+short_description: .+\n\s+default_prompt: ".*\$/, name);
    assert.doesNotMatch(skill, /skills\/[a-z-]+\/SKILL\.md/, name);
  }
});

test('the committed agent configuration points at files that exist', async () => {
  const server = JSON.parse(await read('.mcp.json')).mcpServers.joeflux;
  assert.ok(existsSync(server.args[0].replace('${CLAUDE_PROJECT_DIR:-.}', root)));
  assert.match(await read('CLAUDE.md'), /^@AGENTS\.md$/m);
  const settings = JSON.parse(await read('.claude/settings.json'));
  assert.deepEqual(settings.enabledMcpjsonServers, ['joeflux']);
  const hook = settings.hooks.PostToolUse[0].hooks[0].command.match(/\$CLAUDE_PROJECT_DIR\/([^"]+)/)[1];
  assert.ok(existsSync(path.join(root, hook)), hook);
  const { scripts } = JSON.parse(await read('package.json'));
  for (const name of ['skills:sync', 'skills:check', 'test:fast']) assert.ok(scripts[name], name);
});

test('every working state uses the template sections', async () => {
  const sections = ['## Current objective', '## Last change', '## Checks run', '## Open decisions', '## Next action'];
  const projects = (await readdir(path.join(root, 'projects'))).filter((name) => existsSync(path.join(root, 'projects', name, 'project.json')));
  for (const file of ['templates/project/WORKING_STATE.md', ...projects.map((name) => `projects/${name}/WORKING_STATE.md`)]) {
    const text = await read(file);
    assert.deepEqual(sections.filter((heading) => !text.includes(heading)), [], file);
  }
});
