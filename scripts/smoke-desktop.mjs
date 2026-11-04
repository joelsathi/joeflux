import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, readdir, readlink, access } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { _electron } from '@playwright/test';

const appPath = path.resolve(process.argv[2] || `out/JoeFlux-darwin-${process.arch}/JoeFlux.app`);
const resources = path.join(appPath, 'Contents/Resources');
const executablePath = path.join(appPath, 'Contents/MacOS/JoeFlux');
const runtime = path.join(resources, 'runtime');
// A successful render on the build machine can hide broken absolute links.
async function verifyLinks(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      assert.equal(path.isAbsolute(await readlink(target)), false, `Nonportable link: ${target}`);
      await access(target);
    } else if (entry.isDirectory()) await verifyLinks(target);
  }
}
await verifyLinks(appPath);
await assert.rejects(access(path.join(resources, 'app/projects')));
const project = await mkdtemp(path.join(tmpdir(), 'JoeFlux packaged smoke '));
const artifactDir = path.resolve('.runtime/desktop-smoke');
await mkdir(artifactDir, { recursive: true });
await mkdir(path.join(project, 'scenes')); await mkdir(path.join(project, 'assets'));
execFileSync(path.join(runtime, 'ffmpeg'), ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=24:d=3', '-an', '-c:v', 'libx264', path.join(project, 'assets/source.mp4')]);
await writeFile(path.join(project, 'project.json'), JSON.stringify({ version: 1, name: 'Packaged app verification', output: { width: 320, height: 180, fps: 24, audio: false }, assets: { screen: 'assets/source.mp4' }, scenes: [{ id: 'title', file: 'scenes/title.json' }, { id: 'screen', file: 'scenes/screen.json' }] }));
await writeFile(path.join(project, 'scenes/title.json'), JSON.stringify({ id: 'title', preset: 'text-settle', durationFrames: 36, params: { title: 'Desktop ready' } }));
await writeFile(path.join(project, 'scenes/screen.json'), JSON.stringify({ id: 'screen', kind: 'screen', durationFrames: 36, screen: { asset: 'screen' }, camera: { shots: [{ at: 0 }, { at: 1 }] } }));
// No Node, pnpm or Homebrew binaries on PATH. The installed application must provide its tools.
const env = { ...process.env, PATH: '/usr/bin:/bin' }; delete env.ELECTRON_RUN_AS_NODE;
const electron = await _electron.launch({ executablePath, args: ['--project', project], env, cwd: tmpdir(), timeout: 60000 });
let origin;
try {
  let studio;
  const deadline = Date.now() + 45000;
  while (!studio && Date.now() < deadline) {
    studio = electron.windows().find(page => page.url().startsWith('http://127.0.0.1:'));
    if (!studio) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(studio, 'Installed app opened a studio window');
  const errors = []; studio.on('pageerror', error => errors.push(error.message));
  await studio.getByRole('button', { name: 'Export', exact: true }).waitFor();
  origin = new URL(studio.url()).origin;
  const call = (name, input = {}) => studio.evaluate(async ({ name, input }) => {
    const response = await fetch(`/api/tools/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-joeflux-token': sessionStorage.getItem('joeflux-token') }, body: JSON.stringify(input) });
    const result = await response.json(); if (!response.ok) throw new Error(JSON.stringify(result)); return result;
  }, { name, input });
  // Exercise the native host bridge without installing software or touching real credentials.
  await studio.getByRole('button', { name: 'Connections', exact: true }).waitFor();
  await electron.evaluate(({ dialog }) => {
    globalThis.__setupPrompts = [];
    dialog.showMessageBox = async (_window, options) => { globalThis.__setupPrompts.push(options); return { response: 0 }; };
  });
  const setup = await studio.evaluate(async () => {
    const headers = { 'content-type': 'application/json', 'x-joeflux-token': sessionStorage.getItem('joeflux-token') };
    const agents = await (await fetch('/api/agents', { headers })).json();
    const cancelled = await (await fetch('/api/connections/claude/install', { method: 'POST', headers, body: '{}' })).json();
    return { agents, cancelled };
  });
  assert.deepEqual(setup.agents.map(item => item.id), ['claude', 'codex']);
  assert.ok(setup.agents.every(item => item.connection.desktop));
  assert.deepEqual(setup.cancelled, { cancelled: true });
  assert.match((await electron.evaluate(() => globalThis.__setupPrompts))[0].message, /Install Claude Code/);
  const templates = await call('template_list');
  assert.ok(templates.length > 0, 'Packaged templates are available');
  await call('render_scene');
  await call('assemble');
  await call('review_contact_sheet');
  const probe = JSON.parse(execFileSync(path.join(runtime, 'ffprobe'), ['-v', 'error', '-show_streams', '-of', 'json', path.join(project, 'exports/final.mp4')], { encoding: 'utf8' }));
  assert.equal(probe.streams.length, 1); assert.equal(probe.streams[0].codec_type, 'video');
  assert.equal(probe.streams[0].nb_frames, '72');
  assert.equal(probe.streams[0].width, 320); assert.equal(probe.streams[0].height, 180);
  assert.deepEqual(errors, []);
  await studio.screenshot({ path: path.join(artifactDir, 'studio.png') });
  // Exercise the real native menu/IPC lifecycle with deterministic dialog answers.
  const created = path.join(project, 'New Desktop Project');
  await electron.evaluate(({ dialog, Menu }, destination) => {
    globalThis.__desktopSmokeErrors = [];
    dialog.showErrorBox = (_title, message) => globalThis.__desktopSmokeErrors.push(message);
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination });
    Menu.getApplicationMenu().items.find(item => item.label === 'File').submenu.items.find(item => item.label === 'New Project…').click();
  }, created);
  const waitForProjectWindow = async previous => {
    const until = Date.now() + 30000;
    while (Date.now() < until) {
      const failures = await electron.evaluate(() => globalThis.__desktopSmokeErrors);
      assert.deepEqual(failures, [], 'Desktop reported a project-opening error');
      const next = electron.windows().find(page => !page.isClosed() && page !== previous && page.url().startsWith('http://127.0.0.1:'));
      if (next) { await next.getByRole('button', { name: 'Export', exact: true }).waitFor(); return next; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Project switch did not open a studio window');
  };
  const newStudio = await waitForProjectWindow(studio);
  assert.equal(JSON.parse(await readFile(path.join(created, 'project.json'), 'utf8')).name, 'New Desktop Project');
  await assert.rejects(fetch(`${origin}/api/session`));
  origin = new URL(newStudio.url()).origin;
  await electron.evaluate(({ dialog, Menu }, existing) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [existing] });
    Menu.getApplicationMenu().items.find(item => item.label === 'File').submenu.items.find(item => item.label === 'Open Project…').click();
  }, project);
  const reopened = await waitForProjectWindow(newStudio);
  await assert.rejects(fetch(`${origin}/api/session`));
  origin = new URL(reopened.url()).origin;
  console.log('Native New/Open Project and project switching passed.');
  await writeFile(path.join(artifactDir, 'result.json'), JSON.stringify({ appPath, project, frames: 72, audioStreams: 0, errors }, null, 2));
  console.log(`Packaged app passed: 72 frames, 320×180, no audio. Artifacts: ${artifactDir}`);
} finally {
  await electron.close();
}
if (origin) await assert.rejects(fetch(`${origin}/api/session`));
console.log('Application quit released its backend port.');
