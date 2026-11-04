#!/usr/bin/env node
import { mediaTool } from '../../core/src/runtime.js';
import { cp, mkdir, readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProject } from '../../core/src/index.js';
import { loadProject, writeJson } from '../../core/src/io.js';
import { renderProject } from '../../renderer/src/render.js';
import { assembleProject, createContactSheet } from '../../assembly/src/assemble.js';
import { startPreview } from '../../preview-server/src/index.js';
import { createProjectTools } from '../../tools/src/index.js';
import { setupMcp } from '../../mcp/src/setup.js';
import { detectAgents } from '../../agents/src/index.js';
import { setupResolve, resolveDoctor, createResolveSyncPlan } from '../../../integrations/resolve/adapter/index.js';
import { normalizeScriptArguments, previewCommand } from './arguments.js';
import { createBrandKit, loadBrandKits, summarizeKit, syncBrandKits } from '../../presets/src/brand-kit-sync.js';

const HARNESS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const [command, ...argumentsList] = normalizeScriptArguments(process.argv.slice(2));

try {
  const result = await run(command, argumentsList);
  if (result !== undefined) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}

async function run(name, args) {
  if (name === 'init') return initProject(args[0]);
  if (name === 'doctor') return args[0] === 'resolve' ? resolveDoctor(HARNESS_ROOT) : doctor();
  if (name === 'validate') return validate(args[0]);
  if (name === 'tool') return runTool(args);
  if (name === 'preview') return preview(requiredProject(args), option(args, '--port'), args.includes('--classic') ? 'classic' : 'studio');
  if (name === 'render') return renderProject(requiredProject(args), { onlyScene: option(args, '--scene'), force: args.includes('--force'), onProgress: progress });
  if (name === 'assemble') return assembleProject(requiredProject(args));
  if (name === 'review') return createContactSheet(requiredProject(args));
  if (name === 'setup' && args[0] === 'mcp') return setupMcp(HARNESS_ROOT, { project: args.slice(1).find((argument) => !argument.startsWith('--') && argument !== option(args, '--client')), client: option(args, '--client') ?? 'claude' });
  if (name === 'setup' && args[0] === 'resolve') return setupResolve(HARNESS_ROOT, { client: option(args, '--client') ?? 'codex' });
  if (name === 'resolve' && args[0] === 'sync') return syncResolve(args[1]);
  if (name === 'brand') return brand(args);
  return usage();
}

async function brand([action, id, ...rest]) {
  if (action === 'sync') return syncBrandKits(HARNESS_ROOT).catch((error) => { throw new Error([error.message, ...(error.issues ?? [])].join('\n')); });
  if (action === 'new') { if (!id) throw new Error('A kit id is required.'); return createBrandKit(HARNESS_ROOT, id, option(rest, '--name') ?? id); }
  if (action === 'list') { const { kits, errors } = await loadBrandKits(HARNESS_ROOT); return { kits: kits.map(summarizeKit), errors }; }
  return usage();
}

async function runTool([projectPath, toolName, input]) {
  const tools = createProjectTools(required(projectPath, 'A project directory is required.'));
  if (!toolName) return tools.list().map(({ name, description }) => ({ name, description }));
  try { return await tools.call(toolName, input ? JSON.parse(input) : {}); }
  catch (error) { throw new Error([error.message, ...(error.issues ?? [])].join('\n')); }
}

async function initProject(destination = 'projects/new-video') {
  const target = path.resolve(destination);
  try { await stat(target); throw new Error(`Destination already exists: ${target}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(path.dirname(target), { recursive: true });
  await cp(path.join(HARNESS_ROOT, 'templates', 'project'), target, { recursive: true });
  const manifestPath = path.join(target, 'project.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.name = path.basename(target).replaceAll('-', ' ');
  await writeJson(manifestPath, manifest);
  return { created: target, next: previewCommand(target) };
}

async function validate(projectPath) {
  const project = await loadProject(required(projectPath, 'A project directory is required.'));
  const result = validateProject(project);
  if (!result.valid) throw new Error(result.errors.join('\n'));
  return { valid: true, project: project.name, scenes: project.scenes.length };
}

async function preview(projectPath, port, app) {
  const server = await startPreview(projectPath, Number(port ?? 4173), { app });
  process.stdout.write(`${app === 'studio' ? 'Studio' : 'Classic preview'} running at ${server.url}\n`);
  await new Promise((resolve) => process.once('SIGINT', resolve));
  await server.close();
}

async function syncResolve(projectPath) {
  const project = await loadProject(required(projectPath, 'A project directory is required.'));
  return createResolveSyncPlan(project);
}

function doctor() {
  return {
    node: check('node', ['--version']),
    ffmpeg: check(mediaTool('ffmpeg'), ['-version']),
    ffprobe: check(mediaTool('ffprobe'), ['-version']),
    agents: detectAgents(),
    audioPolicy: 'Silent only: every render and assembly command uses -an.',
  };
}

function check(command, args) {
  const process = spawnSync(command, args, { encoding: 'utf8' });
  return { available: process.status === 0, version: process.status === 0 ? (process.stdout || process.stderr).split('\n')[0] : null };
}

function progress({ scene, frame, frames, index, total }) { if (frame === frames || frame % 24 === 0) process.stderr.write(`${scene ?? 'render'} ${frame ?? 0}/${frames ?? 0}${index === undefined ? '' : ` (${index + 1}/${total})`}\n`); }
function option(args, name) { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; }
function requiredProject(args) { return required(args.find((argument) => !argument.startsWith('--'))); }
function required(value, message = 'A value is required.') { if (!value) throw new Error(message); return path.resolve(value); }
function usage() { throw new Error('Usage: init [destination] | doctor [resolve] | validate <project> | preview <project> [--port 4173] [--classic] | render <project> [--scene id] [--force] | tool <project> [name] [json] | assemble <project> | review <project> | setup mcp <project> [--client claude|codex|copilot] | setup resolve [--client codex|claude] | resolve sync <project> | brand sync | brand list | brand new <id> [--name "Name"]'); }
