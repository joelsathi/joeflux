import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createConnections } = require('../packages/desktop/connections.cjs');

async function fixture(t, overrides = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "connections user's "));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const prompts = [], launches = [];
  const options = { directory, platform: 'darwin',
    safeStorage: { isEncryptionAvailable: () => true, encryptString: value => Buffer.from([...value].reverse().join('')), decryptString: value => [...value.toString()].reverse().join('') },
    confirm: async options => { prompts.push(options); return { response: 1 }; },
    find: command => command === 'brew' ? '/opt/homebrew/bin/brew' : `/opt/homebrew/bin/${command}`,
    launch: async file => launches.push(file), ...overrides };
  return { directory, prompts, launches, options, connections: createConnections(options) };
}
test('declining installation performs no installation and creates no command file', async t => {
  const f = await fixture(t, { confirm: async () => ({ response: 0 }) });
  assert.deepEqual(await f.connections.action('claude', 'install'), { cancelled: true });
  assert.deepEqual(f.launches, []);
  assert.deepEqual(await readdir(f.directory), []);
});
test('approved missing-Homebrew setup discloses both tools and runs only the selected cask', async t => {
  const f = await fixture(t, { find: () => null });
  await f.connections.action('claude', 'install');
  assert.match(f.prompts[0].detail, /Homebrew/);
  assert.match(f.prompts[0].detail, /Claude Code/);
  const script = await readFile(f.launches[0], 'utf8');
  assert.match(script, /raw.githubusercontent.com\/Homebrew\/install\/HEAD\/install.sh/);
  assert.match(script, /install --cask claude-code/);
  assert.doesNotMatch(script, /install --cask codex/);
  assert.equal((await stat(f.launches[0])).mode & 0o777, 0o700);
  await assert.rejects(f.connections.action('claude; touch bad', 'install'), /Unknown provider/);
  await assert.rejects(f.connections.action('claude', 'execute'), /Unknown action/);
});
test('official login uses Terminal and records completion without receiving credentials', async t => {
  const f = await fixture(t);
  await f.connections.action('codex', 'login');
  assert.match(await readFile(f.launches[0], 'utf8'), /codex' login/);
  assert.equal((await f.connections.status()).codex.task.state, 'running');
  await writeFile(path.join(path.dirname(f.launches[0]), 'exit-code'), '1');
  assert.equal((await f.connections.status()).codex.task.state, 'failed');
});
test('persistent keys are encrypted, private, never returned in status, and removable', async t => {
  const f = await fixture(t), key = 'sk-test-secret-123';
  await f.connections.action('claude', 'save-key', { key, remember: true });
  const files = await readdir(f.directory);
  const stored = files.find(name => name.endsWith('.key'));
  assert.ok(stored);
  assert.ok(!(await readFile(path.join(f.directory, stored))).includes(key));
  assert.equal((await stat(path.join(f.directory, stored))).mode & 0o777, 0o600);
  const reopened = createConnections(f.options);
  assert.equal(await reopened.key('claude'), key);
  assert.equal((await reopened.status()).claude.keyConfigured, true);
  assert.ok(!JSON.stringify(await reopened.status()).includes(key));
  await reopened.action('claude', 'remove-key');
  assert.equal(await reopened.key('claude'), null);
  assert.equal(await createConnections(f.options).key('claude'), null);
});
test('unavailable Keychain rejects persistent storage but supports session-only keys', async t => {
  const f = await fixture(t, { safeStorage: { isEncryptionAvailable: () => false } });
  await assert.rejects(f.connections.action('codex', 'save-key', { key: 'sk-test', remember: true }), /Keychain/);
  await f.connections.action('codex', 'save-key', { key: 'sk-test', remember: false });
  assert.equal(await f.connections.key('codex'), 'sk-test');
  assert.deepEqual(await readdir(f.directory), []);
  assert.equal(await createConnections(f.options).key('codex'), null);
});

test('CLI accounts require explicit session consent and removing a key revokes it', async t => {
  const f = await fixture(t);
  assert.equal((await f.connections.status()).codex.cliApproved, false);
  await f.connections.action('codex', 'approve-cli');
  assert.match(f.prompts[0].detail, /API.*billing/);
  assert.equal((await f.connections.status()).codex.cliApproved, true);
  assert.equal((await createConnections(f.options).status()).codex.cliApproved, false);
  await f.connections.action('codex', 'remove-key');
  assert.equal((await f.connections.status()).codex.cliApproved, false);
});

test('a stale Terminal task is preserved and cannot be retried without confirmation it was stopped', async t => {
  let time = 0, response = 1;
  const f = await fixture(t, { now: () => time, confirm: async () => ({ response }) });
  await f.connections.action('claude', 'install');
  const first = f.launches[0];
  time = 16 * 60 * 1000; response = 0;
  assert.deepEqual(await f.connections.action('claude', 'install'), { cancelled: true });
  assert.equal(f.launches.length, 1);
  await stat(first);
  response = 1;
  await f.connections.action('claude', 'install');
  assert.equal(f.launches.length, 2);
  await stat(first);
});

test('an account cannot be approved while login is running or its outcome is unresolved', async t => {
  let time = 0;
  const f = await fixture(t, { now: () => time });
  await f.connections.action('codex', 'login');
  await assert.rejects(f.connections.action('codex', 'approve-cli'), /Finish.*setup/);
  assert.equal((await f.connections.status()).codex.cliApproved, false);
  time = 16 * 60 * 1000;
  await assert.rejects(f.connections.action('codex', 'approve-cli'), /Finish.*setup/);
  await writeFile(path.join(path.dirname(f.launches[0]), 'exit-code'), '0');
  await f.connections.action('codex', 'approve-cli');
  assert.equal((await f.connections.status()).codex.cliApproved, true);
});
