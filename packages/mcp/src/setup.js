import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const readJson = async (file, fallback) => { try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; } };
const write = async (file, text) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, text); };

// Register the joeflux MCP server with a client, keeping other entries.
export async function setupMcp(harnessRoot, { project, client }) {
  if (!project) throw new Error('A project directory is required.');
  const command = process.execPath, args = [path.join(harnessRoot, 'packages/mcp/src/server.js'), path.resolve(project)];
  if (client === 'claude') {
    const file = path.join(harnessRoot, '.mcp.json'), config = await readJson(file, {});
    config.mcpServers = { ...config.mcpServers, 'joeflux': { command, args } };
    await write(file, `${JSON.stringify(config, null, 2)}\n`);
    return { client, file };
  }
  if (client === 'copilot') {
    const file = path.join(harnessRoot, '.vscode', 'mcp.json'), config = await readJson(file, {});
    config.servers = { ...config.servers, 'joeflux': { type: 'stdio', command, args } };
    await write(file, `${JSON.stringify(config, null, 2)}\n`);
    return { client, file };
  }
  if (client === 'codex') {
    const file = path.join(harnessRoot, '.codex', 'config.toml');
    let existing = ''; try { existing = await readFile(file, 'utf8'); } catch { /* new project config */ }
    const entry = `[mcp_servers.joeflux]\ncommand = ${JSON.stringify(command)}\nargs = ${JSON.stringify(args)}\n`;
    const section = /\[mcp_servers\.joeflux\]\n(?:[^[\n].*\n?)*/;
    await write(file, section.test(existing) ? existing.replace(section, entry) : `${existing.trimEnd()}${existing.trim() ? '\n\n' : ''}${entry}`);
    return { client, file };
  }
  throw new Error('MCP client must be claude, codex or copilot.');
}
