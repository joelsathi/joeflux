const { access, mkdir, mkdtemp, readFile, writeFile, rename, rm } = require('node:fs/promises');
const { constants } = require('node:fs');
const { execFile } = require('node:child_process');
const path = require('node:path');
const { homedir } = require('node:os');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const PROVIDERS = Object.freeze({ claude: { label: 'Claude Code', cask: 'claude-code', login: 'auth login --claudeai' }, codex: { label: 'Codex', cask: 'codex', login: 'login' } });
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
async function findExecutable(command) {
  for (const directory of [...(process.env.PATH ?? '').split(path.delimiter).filter(Boolean), path.join(homedir(), '.local/bin'), path.join(homedir(), '.npm-global/bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']) {
    const target = path.join(directory, command);
    try { await access(target, constants.X_OK); return target; } catch { /* try next location */ }
  }
  return null;
}

// Native host only. The renderer can ask for actions and status, never retrieve keys.
function createConnections({ directory, safeStorage, confirm, platform = process.platform, now = Date.now, find = findExecutable, launch = file => exec('/usr/bin/open', ['-a', 'Terminal', file]) }) {
  const memory = new Map(), tasks = new Map(), locks = new Set(), approved = new Set();
  const provider = id => { if (!Object.hasOwn(PROVIDERS, id)) throw new Error('Unknown provider'); return PROVIDERS[id]; };
  const keyFile = id => path.join(directory, `${id}.key`);
  async function key(id) {
    provider(id);
    if (memory.has(id)) return memory.get(id);
    let encrypted;
    try { encrypted = await readFile(keyFile(id)); } catch (error) { if (error.code === 'ENOENT') return null; throw new Error('Cannot read saved API key. Remove it and try again.'); }
    if (!safeStorage.isEncryptionAvailable()) throw new Error('macOS Keychain is unavailable. Remove the saved key or unlock Keychain.');
    try { return safeStorage.decryptString(encrypted); } catch { throw new Error('Cannot unlock the saved API key. Remove it and save it again.'); }
  }
  async function taskStatus(id) {
    const task = tasks.get(id);
    if (!task) return null;
    try {
      const code = (await readFile(path.join(task.directory, 'exit-code'), 'utf8')).trim();
      if (/^\d+$/.test(code)) return { action: task.action, state: code === '0' ? 'completed' : 'failed' };
    } catch { /* Terminal is still working or was closed */ }
    return { action: task.action, state: now() - task.started > 15 * 60 * 1000 ? 'timed-out' : 'running' };
  }
  async function status() {
    const result = {};
    for (const id of Object.keys(PROVIDERS)) {
      let configured = memory.has(id), error;
      if (!configured) { try { configured = Boolean(await key(id)); } catch (e) { error = e.message; } }
      result[id] = { desktop: true, cliApproved: approved.has(id), keyConfigured: configured, keyError: error, keyStorage: configured ? memory.has(id) ? 'session' : 'keychain' : null, canRememberKey: safeStorage.isEncryptionAvailable(), task: await taskStatus(id) };
    }
    return result;
  }
  async function action(id, action, body = {}) {
    const vendor = provider(id);
    if (platform !== 'darwin') throw new Error('Automatic setup is available on macOS only.');
    if (!['install', 'login', 'device-login', 'save-key', 'remove-key', 'approve-cli'].includes(action)) throw new Error('Unknown action');
    if (locks.has(id)) throw new Error('A setup action is already in progress.');
    locks.add(id);
    try {
      if (action === 'approve-cli') {
        if (['running', 'timed-out'].includes((await taskStatus(id))?.state)) throw new Error('Finish the previous setup in Terminal before approving this account.');
        const { response } = await confirm({ type: 'question', title: `Connect ${vendor.label}`, message: `Use ${vendor.label}'s current account?`, detail: 'Requests follow this CLI account and its configuration, including subscription limits or separate API/cloud billing. Check your provider account if unsure. This consent lasts until you quit JoeFlux or change the connection.', buttons: ['Cancel', 'Use this account'], defaultId: 0, cancelId: 0 });
        if (response !== 1) return { cancelled: true };
        approved.add(id);
        return { approved: true };
      }
      if (action === 'remove-key') {
        await rm(keyFile(id), { force: true }); memory.delete(id); approved.delete(id);
        return { removed: true };
      }
      if (action === 'save-key') {
        const value = typeof body.key === 'string' ? body.key.trim() : '';
        if (!value || value.length > 4096 || /\s/.test(value)) throw new Error('Enter a valid API key without spaces.');
        if (body.remember === true) {
          if (!safeStorage.isEncryptionAvailable()) throw new Error('macOS Keychain is unavailable. Use a session-only key instead.');
          await mkdir(directory, { recursive: true, mode: 0o700 });
          const temporary = `${keyFile(id)}.tmp`;
          await writeFile(temporary, safeStorage.encryptString(value), { mode: 0o600 });
          await rename(temporary, keyFile(id)); memory.delete(id);
        } else {
          await rm(keyFile(id), { force: true }); memory.set(id, value);
        }
        approved.delete(id);
        return { configured: true };
      }
      const previousState = (await taskStatus(id))?.state;
      if (previousState === 'running') return { started: true, alreadyRunning: true };
      if (previousState === 'timed-out') {
        const { response } = await confirm({ type: 'warning', title: 'Previous setup may still be running', message: 'Stop the previous setup in Terminal before retrying.', detail: 'Long installations can still be working. Only continue after stopping the previous command and closing its Terminal window. Its files will be preserved.', buttons: ['Cancel', 'I stopped it — retry'], defaultId: 0, cancelId: 0 });
        if (response !== 1) return { cancelled: true };
      }
      let command;
      if (action === 'install') {
        const brew = await find('brew');
        const { response } = await confirm({ type: 'question', title: `Install ${vendor.label}?`, message: `Install ${vendor.label} on this Mac?`, detail: `${brew ? 'Homebrew will install' : 'This will install Homebrew and then'} ${vendor.label}. This downloads software and changes this Mac. Terminal may ask for your Mac password or Apple's command-line tools. JoeFlux never receives your password. Claude Desktop does not include the Claude Code CLI.`, buttons: ['Cancel', 'Install'], defaultId: 0, cancelId: 0 });
        if (response !== 1) return { cancelled: true };
        command = brew ? `${quote(brew)} install --cask ${vendor.cask}` : `/usr/bin/curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh -o "$SETUP_DIR/homebrew.sh"\n/bin/bash "$SETUP_DIR/homebrew.sh"\nif [ -x /opt/homebrew/bin/brew ]; then BREW=/opt/homebrew/bin/brew; else BREW=/usr/local/bin/brew; fi\n"$BREW" install --cask ${vendor.cask}`;
      } else {
        if (action === 'device-login' && id !== 'codex') throw new Error('Device sign-in is available for Codex only.');
        const executable = await find(id);
        if (!executable) throw new Error(`Install ${vendor.label} before signing in.`);
        command = `${quote(executable)} ${action === 'device-login' ? 'login --device-auth' : vendor.login}`;
      }
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const old = tasks.get(id);
      if (old && previousState !== 'timed-out') await rm(old.directory, { recursive: true, force: true });
      const work = await mkdtemp(path.join(directory, 'setup-'));
      const file = path.join(work, 'JoeFlux Setup.command');
      const script = `#!/bin/bash\nset -e\numask 077\nexport PATH="$HOME/.local/bin:$HOME/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"\nSETUP_DIR=${quote(work)}\ntrap 'code=$?; printf "%s" "$code" > "$SETUP_DIR/exit-code"; if [ "$code" -eq 0 ]; then echo "Setup finished. Return to JoeFlux."; else echo "Setup did not finish. Return to JoeFlux to retry."; fi' EXIT\necho ${quote(`${vendor.label}: ${action}. Follow the official prompts below.`)}\n${command}\n`;
      await writeFile(file, script, { mode: 0o700 });
      approved.delete(id);
      await launch(file);
      tasks.set(id, { directory: work, action, started: now() });
      return { started: true };
    } finally { locks.delete(id); }
  }
  return { status, action, key };
}
module.exports = { createConnections };
