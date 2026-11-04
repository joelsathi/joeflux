import { existsSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { writeJson } from '../../../packages/core/src/io.js';

export async function resolveDoctor(harnessRoot) {
  const vendorRoot = vendorPath(harnessRoot);
  const runtimePython = path.join(harnessRoot, 'integrations', 'resolve', '.runtime', 'venv', 'bin', 'python');
  const pin = await readVendorPin(harnessRoot);
  return {
    optional: true,
    vendorPin: `${pin.repository}@${pin.ref}`,
    vendorPresent: existsSync(path.join(vendorRoot, 'src', 'server.py')),
    vendorState: existsSync(path.join(vendorRoot, 'src', 'server.py')) ? 'Downloaded.' : 'Not downloaded. `pnpm run setup -- resolve` fetches the pinned source; it is never committed to this repository.',
    runtimePresent: existsSync(runtimePython),
    resolveApplicationPresent: existsSync('/Applications/DaVinci Resolve/DaVinci Resolve.app'),
    bridgeState: 'Not probed. Run `pnpm run doctor -- resolve` after `pnpm run setup -- resolve` and start the Resolve bridge from Workspace > Scripts.',
  };
}

function vendorPath(harnessRoot) {
  return path.join(harnessRoot, 'integrations', 'resolve', 'vendor', 'davinci-resolve-mcp');
}

async function readVendorPin(harnessRoot) {
  const manifest = path.join(harnessRoot, 'integrations', 'resolve', 'vendor.json');
  const pin = JSON.parse(await readFile(manifest, 'utf8'))['davinci-resolve-mcp'];
  if (!pin?.repository || !pin?.ref || !pin?.commit) throw new Error('integrations/resolve/vendor.json must pin repository, ref and commit.');
  return pin;
}

export async function ensureVendor(harnessRoot) {
  const vendorRoot = vendorPath(harnessRoot);
  if (existsSync(path.join(vendorRoot, 'src', 'server.py'))) return vendorRoot;
  const pin = await readVendorPin(harnessRoot);
  await mkdir(path.dirname(vendorRoot), { recursive: true });
  await rm(vendorRoot, { recursive: true, force: true });
  try {
    run('git', ['clone', '--depth', '1', '--branch', pin.ref, '--config', 'advice.detachedHead=false', pin.repository, vendorRoot]);
    const head = run('git', ['-C', vendorRoot, 'rev-parse', 'HEAD']).trim();
    if (head !== pin.commit) throw new Error(`${pin.ref} resolved to ${head}, not the pinned ${pin.commit}.`);
    if (!existsSync(path.join(vendorRoot, 'src', 'server.py'))) throw new Error('The downloaded source has no src/server.py.');
  } catch (error) {
    await rm(vendorRoot, { recursive: true, force: true });
    throw new Error(`Could not download the optional Resolve MCP source (${pin.repository}@${pin.ref}): ${error.message}`);
  }
  await rm(path.join(vendorRoot, '.git'), { recursive: true, force: true });
  return vendorRoot;
}

export async function setupResolve(harnessRoot, { client }) {
  const runtimeRoot = path.join(harnessRoot, 'integrations', 'resolve', '.runtime', 'venv');
  const python = path.join(runtimeRoot, 'bin', 'python');
  const vendorRoot = await ensureVendor(harnessRoot);
  if (!existsSync(python)) {
    await mkdir(path.dirname(runtimeRoot), { recursive: true });
    run('python3', ['-m', 'venv', runtimeRoot]);
    const requirements = path.join(vendorRoot, 'requirements.txt');
    if (existsSync(requirements)) run(python, ['-m', 'pip', 'install', '-r', requirements]);
  }
  const bridge = run(python, [path.join(vendorRoot, 'scripts', 'install_resolve_bridge.py')]);
  const server = path.join(vendorRoot, 'src', 'server.py');
  if (client === 'codex') await configureCodex(harnessRoot, python, server);
  else if (client === 'claude') await configureClaude(harnessRoot, python, server);
  else throw new Error('Resolve client must be codex or claude.');
  return { configuredClient: client, python, server, bridgeInstaller: bridge.split('\n').filter(Boolean).at(-1), next: 'Restart DaVinci Resolve, open Workspace > Scripts, run the Resolve bridge, then ask Codex or Claude to use the davinci-resolve MCP.' };
}

export async function createResolveSyncPlan(project) {
  const resolveRoot = path.join(project.root, '04_DaVinci_Resolve');
  const statePath = path.join(resolveRoot, 'sync-state.json');
  let prior = { version: 0, imported: {} };
  try { prior = JSON.parse(await readFile(statePath, 'utf8')); } catch { /* first optional Resolve handoff */ }
  const clips = project.scenes.map((scene) => ({ id: scene.id, path: path.join(project.root, 'exports', 'clips', `${scene.id}.mp4`), frames: scene.durationFrames }));
  const version = prior.version + 1;
  const plan = {
    version,
    project: project.name,
    timelineName: `${project.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}-v${version}`,
    silent: true,
    clips,
    imported: Object.fromEntries(clips.map((clip) => [clip.id, prior.imported?.[clip.id] ?? null])),
    mcpWorkflow: [
      'Use davinci-resolve media_pool to import only clips whose imported value is null.',
      'Use davinci-resolve timeline to create the named timeline in the listed order.',
      'Do not add audio tracks or audio clips.',
      'Record the Resolve media IDs and timeline ID in sync-state.json after the MCP calls succeed.',
    ],
  };
  await writeJson(path.join(resolveRoot, 'resolve-sync-plan.json'), plan);
  return { planPath: path.join(resolveRoot, 'resolve-sync-plan.json'), timelineName: plan.timelineName, requiresMcpClient: true, next: 'Open this plan through Codex or Claude after the optional Resolve MCP is active. The harness itself remains fully usable without Resolve.' };
}

async function configureCodex(harnessRoot, python, server) {
  const target = path.join(harnessRoot, '.codex', 'config.toml');
  let existing = ''; try { existing = await readFile(target, 'utf8'); } catch { /* project config does not exist yet */ }
  if (existing.includes('[mcp_servers.davinci-resolve]')) return;
  await mkdir(path.dirname(target), { recursive: true });
  await writeJson(path.join(harnessRoot, 'integrations', 'resolve', '.runtime', 'codex-mcp.json'), { command: python, args: [server], env: { DAVINCI_RESOLVE_BRIDGE: '1' } });
  const entry = `\n[mcp_servers.davinci-resolve]\ncommand = ${JSON.stringify(python)}\nargs = [${JSON.stringify(server)}]\nenv = { DAVINCI_RESOLVE_BRIDGE = "1" }\n`;
  const { writeFile } = await import('node:fs/promises'); await writeFile(target, `${existing.trimEnd()}${entry}`);
}

async function configureClaude(harnessRoot, python, server) {
  const target = path.join(harnessRoot, '.mcp.json');
  let config = { mcpServers: {} }; try { config = JSON.parse(await readFile(target, 'utf8')); } catch { /* create local client config */ }
  config.mcpServers['davinci-resolve'] = { command: python, args: [server], env: { DAVINCI_RESOLVE_BRIDGE: '1' } };
  await writeJson(target, config);
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}
