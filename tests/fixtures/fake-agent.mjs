// A stand-in for `claude -p`: reads the prompt as {"tool","arguments"} JSON,
// calls it through the MCP config it was given, and prints stream-json events.
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const args = process.argv.slice(2), prompt = args[args.indexOf('-p') + 1], out = (event) => console.log(JSON.stringify(event));
if (prompt.includes('FAIL')) { console.error('fake agent failed'); process.exit(2); }
if (prompt.includes('SLOW')) await new Promise((resolve) => setTimeout(resolve, 60000));
const { tool, arguments: input } = JSON.parse(prompt.slice(prompt.indexOf('{')));
const server = JSON.parse(await readFile(args[args.indexOf('--mcp-config') + 1], 'utf8')).mcpServers['joeflux'];
const client = new Client({ name: 'fake', version: '1' });
await client.connect(new StdioClientTransport({ ...server, env: { ...process.env, ...server.env } }));
out({ type: 'system', subtype: 'init', session_id: 'fake-session' });
out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: `mcp__joeflux__${tool}`, input }] } });
const result = await client.callTool({ name: tool, arguments: input });
out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: result.content.filter((part) => part.type === 'text'), is_error: result.isError }] } });
out({ type: 'assistant', message: { content: [{ type: 'text', text: 'Done.' }] } });
out({ type: 'result', subtype: 'success', is_error: false, result: 'Done.' });
await client.close();
