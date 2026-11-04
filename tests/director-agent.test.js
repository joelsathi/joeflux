import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENTS, SYSTEM_PROMPT } from '../packages/agents/src/index.js';

test('Codex receives the general brief instructions when resuming', () => {
  const args = AGENTS.codex.args({ prompt: 'Continue the proof film', session: 'saved-session', system: SYSTEM_PROMPT, server: { command: 'node', args: [], env: {} }, project: '/tmp/project' });
  const received = args.at(-1);
  assert.match(received, /brief_get/);
  assert.match(received, /only.*explicit/i);
  assert.match(received, /Continue the proof film$/);
});
