// Claude Code PostToolUse hook: regenerates derived files after an agent edits their source.
// Reads the hook payload on stdin. Exit 2 sends a failure back to the agent.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncSkills } from './sync-skills.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let input = '';
for await (const chunk of process.stdin) input += chunk;
const payload = JSON.parse(input || '{}');
const file = payload.tool_input?.file_path ?? payload.tool_response?.filePath;
const relative = file ? path.relative(root, path.resolve(root, file)).split(path.sep).join('/') : '';

if (relative.startsWith('skills/')) {
  await syncSkills();
  process.stdout.write('Synchronized .agents/skills and .claude/skills from skills/.\n');
} else if (relative.startsWith('brand-kits/') && !['brand-kits/registry.json', 'brand-kits/README.md'].includes(relative)) {
  const result = spawnSync(process.execPath, [path.join(root, 'packages/cli/src/main.js'), 'brand', 'sync'], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) { process.stderr.write(`pnpm run brand -- sync failed after editing ${relative}:\n${result.stderr || result.stdout}`); process.exit(2); }
  process.stdout.write('Brand kits synchronized (brand-kits/registry.json).\n');
}
