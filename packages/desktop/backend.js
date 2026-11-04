import { connectionClient } from './connection-client.js';
import { AGENTS } from '../agents/src/index.js';
import { startPreview } from '../preview-server/src/index.js';
import { createDesktopProject } from './project.js';

let server;
let closing = false;
async function stop() {
  if (closing) return;
  closing = true;
  await server?.close();
  process.exit(0);
}
process.on('message', message => { if (message?.type === 'stop') void stop(); });
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
process.on('disconnect', stop);
try {
  const [action, project] = process.argv.slice(2);
  if (action === 'create') await createDesktopProject(project);
  else if (action !== 'open') throw new Error('Choose a project to open.');
  server = await startPreview(project, 0, { production: true, agents: { claude: AGENTS.claude, codex: AGENTS.codex }, connections: connectionClient() });
  process.send?.({ type: 'ready', url: server.url });
} catch (error) {
  process.send?.({ type: 'error', message: error.message });
  process.exitCode = 1;
  process.disconnect?.();
}
