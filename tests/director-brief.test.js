import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createToolRunner } from '../packages/tools/src/runner.js';

const provenance = { source: 'user', actor: 'creator', at: '2026-10-07T00:00:00Z', artifact: 'rough-cut', version: '1' };
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'harness-brief-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ version: 1, name: 'Neutral', output: { width: 1920, height: 1080, fps: 24, audio: false }, assets: {}, scenes: [] }));
  const { DIRECTOR_TOOLS } = await import('../packages/tools/src/director-tools.js');
  return { root, runner: createToolRunner(root, DIRECTOR_TOOLS) };
}

test('brief patches persist across resume, retain approved decisions, and undo exactly', async t => {
  const { root, runner } = await fixture(t);
  const original = await readFile(path.join(root, 'project.json'), 'utf8');
  await runner.call('brief_decision_set', { decision: { id: 'audience', field: 'audience', answer: 'Developers', confidence: 'confirmed', scope: 'project', dependencies: [], provenance } });
  await runner.call('brief_update', { patch: { message: 'Ship reliably', duration: 20 }, provenance });
  const { DIRECTOR_TOOLS } = await import('../packages/tools/src/director-tools.js');
  const resumed = await createToolRunner(root, DIRECTOR_TOOLS).call('brief_get');
  assert.equal(resumed.brief.audience, 'Developers');
  assert.equal(resumed.brief.message, 'Ship reliably');
  assert.equal(resumed.brief.decisions[0].provenance.artifact, 'rough-cut');
  assert.equal(resumed.questions.some(q => q.field === 'audience' || q.field === 'message' || q.field === 'duration'), false);
  assert.equal(resumed.brief.interview, null);
  await assert.rejects(runner.call('brief_update', { patch: { audience: 'Executives' }, provenance }), /settled/);
  await runner.undo(); await runner.undo();
  assert.equal(await readFile(path.join(root, 'project.json'), 'utf8'), original);
});

test('changed upstream decisions mark dependent choices stale rather than repeating approved answers', async t => {
  const { runner } = await fixture(t);
  await runner.call('brief_decision_set', { decision: { id: 'audience', field: 'audience', answer: 'Developers', confidence: 'confirmed', scope: 'project', dependencies: [], provenance } });
  await runner.call('brief_decision_set', { decision: { id: 'tone', field: 'tone', answer: 'Technical', confidence: 'confirmed', scope: 'project', dependencies: ['audience'], provenance } });
  await runner.call('brief_decision_set', { decision: { id: 'audience', field: 'audience', answer: 'Executives', confidence: 'confirmed', scope: 'project', dependencies: [], provenance }, reopenReason: 'The actual placement targets executives' });
  const resumed = await runner.call('brief_get');
  assert.equal(resumed.brief.decisions.find(d => d.id === 'tone').status, 'stale');
  assert.equal(resumed.questions.some(q => q.field === 'tone'), true);
  assert.equal(resumed.brief.tone, 'Technical', 'retain the old choice until reviewed');
});

test('a first decision that revises a quick-brief field invalidates its dependent choices', async t => {
  const { runner } = await fixture(t);
  await runner.call('brief_update', { patch: { audience: 'Developers' }, provenance });
  await runner.call('brief_decision_set', { decision: { id: 'tone', field: 'tone', answer: 'Technical', confidence: 'confirmed', scope: 'project', dependencies: ['audience'], provenance } });
  await runner.call('brief_decision_set', { decision: { id: 'copy-style', field: 'message', answer: 'Inspect the API', confidence: 'confirmed', scope: 'project', dependencies: ['tone'], provenance } });
  const before = await runner.call('brief_get');
  await runner.call('brief_decision_set', { decision: { id: 'target-audience', field: 'audience', answer: 'Executives', confidence: 'confirmed', scope: 'project', dependencies: [], provenance } });
  const resumed = await runner.call('brief_get');
  assert.equal(resumed.brief.audience, 'Executives');
  assert.equal(resumed.brief.decisions.find(d => d.id === 'tone').status, 'stale');
  assert.equal(resumed.brief.decisions.find(d => d.id === 'copy-style').status, 'stale');
  assert.equal(resumed.questions.some(q => q.field === 'tone'), true);
  await runner.undo();
  assert.deepEqual(await runner.call('brief_get'), before);
});

test('decision changes require a reason and retain the reviewed choice history', async t => {
  const { runner } = await fixture(t);
  const decision = { id: 'message', field: 'message', answer: 'Ship', confidence: 'confirmed', scope: 'project', dependencies: [], provenance };
  await runner.call('brief_decision_set', { decision });
  await assert.rejects(runner.call('brief_decision_set', { decision: { ...decision, answer: 'Scale' } }), /reopenReason/);
  await runner.call('brief_decision_set', { decision: { ...decision, answer: 'Scale' }, reopenReason: 'New product evidence changes the claim' });
  const result = await runner.call('brief_get');
  assert.equal(result.brief.message, 'Scale');
  assert.equal(result.brief.decisions[0].history[0].answer, 'Ship');
  assert.equal(result.brief.decisions[0].reopenReason, 'New product evidence changes the claim');
});

test('deep interviews are explicit and ask only the settled-prerequisite frontier', async t => {
  const { runner } = await fixture(t);
  await runner.call('brief_question_set', { question: { id: 'treatment', question: 'Reveal or explain?', recommendation: 'Explain', reason: 'The viewer needs context', dependencies: ['audience'], provenance } });
  assert.equal((await runner.call('brief_get')).questions.some(q => q.id === 'treatment'), false);
  await runner.call('brief_decision_set', { decision: { id: 'audience', field: 'audience', answer: 'New developers', confidence: 'confirmed', scope: 'project', dependencies: [], provenance } });
  assert.equal((await runner.call('brief_get')).questions.some(q => q.id === 'treatment'), true);
  await assert.rejects(runner.call('brief_interview_start', {}), /Invalid input/);
  const started = await runner.call('brief_interview_start', { mode: 'deep' });
  assert.equal(started.brief.interview.mode, 'deep');
  assert.match(started.instructions, /frontier/);
  assert.match(started.source.revision, /^[a-f0-9]{40}$/);
  assert.equal(started.brief.decisions[0].answer, 'New developers');
});

test('deep interview completes only after unresolved choices and shared understanding are confirmed', async t => {
  const { runner } = await fixture(t);
  await runner.call('brief_interview_start', { mode: 'deep' });
  await assert.rejects(runner.call('brief_interview_finish', { sharedUnderstandingConfirmed: true }), /unresolved/);
  await runner.call('brief_update', { patch: { audience: 'Developers', message: 'Ship reliably', evidence: 'Supplied UI', format: '16:9 Web', duration: 20, tone: 'Restrained', cta: 'Try it', brand: 'Neutral' }, provenance });
  await assert.rejects(runner.call('brief_interview_finish', { sharedUnderstandingConfirmed: false }), /Invalid input/);
  const finished = await runner.call('brief_interview_finish', { sharedUnderstandingConfirmed: true });
  assert.equal(finished.brief.interview.status, 'complete');
  const restarted = await runner.call('brief_interview_start', { mode: 'deep' });
  assert.equal(restarted.brief.interview.status, 'active'); assert.equal(restarted.brief.audience, 'Developers');
});
