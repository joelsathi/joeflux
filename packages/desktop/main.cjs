const { app, BrowserWindow, Menu, dialog, ipcMain, shell, safeStorage } = require('electron');
const { spawn } = require('node:child_process');
const { existsSync, mkdirSync, createWriteStream } = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createConnections } = require('./connections.cjs');
const { desktopEnvironment } = require('./runtime.cjs');

const root = path.resolve(__dirname, '../..');
const welcomeFile = path.join(__dirname, 'welcome.html');
const welcomeUrl = pathToFileURL(welcomeFile).href;
let window, backend, activeProject, busy = false, quitting = false;
const children = new Set();
let connections;
const resources = () => app.isPackaged ? process.resourcesPath : path.join(root, '.desktop');
const report = error => dialog.showErrorBox('JoeFlux', error.message || String(error));

// Each backend owns a process group, including its browser and media subprocesses.
function killGroup(child) {
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already exited */ }
}
async function stopBackend() {
  const child = backend;
  backend = null;
  if (!child) return;
  await new Promise(resolve => {
    const finish = () => { killGroup(child); children.delete(child); resolve(); };
    child.once('exit', finish);
    if (child.exitCode !== null) finish();
    else if (child.connected) child.send({ type: 'stop' });
    else finish();
  });
}
function secureWindow(options = {}) {
  const result = new BrowserWindow({ width: 1480, height: 960, minWidth: 1060, minHeight: 700, backgroundColor: '#101216', ...options, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, ...options.webPreferences } });
  result.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  result.webContents.on('will-navigate', (event, url) => {
    const current = result.webContents.getURL();
    if (new URL(url).origin !== new URL(current).origin || url.startsWith('file:')) event.preventDefault();
  });
  result.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  result.on('closed', () => { if (window === result) window = null; });
  return result;
}
function showWelcome() {
  const previous = window;
  window = secureWindow({ width: 1100, height: 760, webPreferences: { preload: path.join(__dirname, 'preload.cjs') } });
  void window.loadFile(welcomeFile);
  previous?.destroy();
}
async function openProject(project, action = 'open') {
  if (busy) return;
  busy = true;
  let child;
  try {
    if (!existsSync(path.join(resources(), 'runtime/ffmpeg'))) throw new Error('The rendering tools are missing. Run pnpm run desktop:prepare before starting a development build.');
    const logs = path.join(app.getPath('logs'), 'backend.log');
    mkdirSync(path.dirname(logs), { recursive: true });
    const output = createWriteStream(logs, { flags: 'a' });
    child = spawn(process.execPath, [path.join(__dirname, 'backend.js'), action, project], {
      cwd: app.getPath('userData'), env: desktopEnvironment(resources()),
      detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    children.add(child);
    child.on('message', async message => {
      if (message?.type !== 'connection-request' || !children.has(child)) return;
      const { id, method, args } = message;
      if (!['status', 'action', 'key'].includes(method) || !Array.isArray(args)) return;
      try {
        const result = await connections[method](...args);
        if (child.connected) child.send({ type: 'connection-result', id, result }, () => {});
      } catch (error) {
        if (child.connected) child.send({ type: 'connection-result', id, error: error.message }, () => {});
      }
    });
    child.stdout.pipe(output, { end: false }); child.stderr.pipe(output, { end: false });
    child.once('exit', () => output.end());
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { reject(new Error(`The studio did not start. See ${logs}`)); }, 30000);
      const done = (error, value) => { clearTimeout(timer); error ? reject(error) : resolve(value); };
      child.once('error', error => done(error));
      child.once('exit', code => done(new Error(`The studio stopped (${code}). See ${logs}`)));
      child.on('message', message => {
        if (message.type === 'ready') done(null, message.url);
        if (message.type === 'error') done(new Error(message.message));
      });
    });
    await stopBackend();
    backend = child;
    activeProject = project;
    const previous = window;
    window = secureWindow({ title: `${path.basename(project)} — JoeFlux` });
    await window.loadURL(url);
    previous?.destroy();
    child.once('exit', () => {
      children.delete(child);
      if (backend === child && !quitting) { backend = null; report(new Error('The studio stopped unexpectedly. Open the project again from File → Open Project.')); }
    });
    app.addRecentDocument(path.join(project, 'project.json'));
  } catch (error) {
    if (child) { killGroup(child); children.delete(child); }
    report(error);
  } finally { busy = false; }
}
async function chooseProject(create) {
  if (busy) return;
  try {
    if (create) {
      const { canceled, filePath } = await dialog.showSaveDialog(window, { title: 'New Video Project', buttonLabel: 'Create project', defaultPath: path.join(app.getPath('documents'), 'My Video'), nameFieldLabel: 'Project folder:' });
      if (!canceled && filePath) await openProject(filePath, 'create');
    } else {
      const { canceled, filePaths } = await dialog.showOpenDialog(window, { title: 'Open Video Project Folder', properties: ['openDirectory'] });
      if (!canceled && filePaths[0]) await openProject(filePaths[0]);
    }
  } catch (error) { report(error); }
}
function installMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { label: 'File', submenu: [
      { label: 'New Project…', accelerator: 'CmdOrCtrl+N', click: () => chooseProject(true) },
      { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: () => chooseProject(false) },
      { label: 'Show Project in Finder', click: () => { if (activeProject) shell.showItemInFolder(path.join(activeProject, 'project.json')); } },
      { type: 'separator' }, { role: 'close' },
    ] },
    { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
  ]));
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window?.isMinimized()) window.restore(); window?.focus(); });
  app.whenReady().then(() => {
    mkdirSync(app.getPath('userData'), { recursive: true });
    connections = createConnections({ directory: path.join(app.getPath('userData'), 'connections'), safeStorage, confirm: options => dialog.showMessageBox(window, options) });
    installMenu();
    ipcMain.handle('desktop:project', (event, action) => {
      if (event.senderFrame?.url !== welcomeUrl || !['new', 'open'].includes(action)) throw new Error('Invalid request');
      return chooseProject(action === 'new');
    });
    showWelcome();
    const index = process.argv.indexOf('--project');
    if (index >= 0 && process.argv[index + 1]) void openProject(path.resolve(process.argv[index + 1]));
  }).catch(report);
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => {
    if (quitting) return;
    event.preventDefault(); quitting = true;
    void stopBackend().finally(() => { for (const child of children) killGroup(child); app.quit(); });
  });
}
