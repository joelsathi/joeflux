import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createToolRunner } from '../packages/tools/src/runner.js';

const reference = { id: 'proof-demo', title: 'Original supplied proof', canonicalURL: 'https://example.test/proof', creator: 'Creator', client: 'Product', publicationDate: null, accessDate: '2026-10-07', accessState: 'analysis-authorized', audience: 'Developers', platform: 'Web', selectionReason: 'Inspect a real result', tags: ['product-proof'], evidence: [{ id: 'clip-review', type: 'playback', observation: 'The result is visible after the interaction', observed: true, timecodes: [{ start: 2, end: 4 }] }] };
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'harness-knowledge-')); t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ version: 1, name: 'Knowledge', output: { width: 1920, height: 1080, fps: 24, audio: false }, assets: {}, scenes: [] }));
  const { DIRECTOR_TOOLS } = await import('../packages/tools/src/director-tools.js');
  return createToolRunner(root, DIRECTOR_TOOLS);
}

test('purpose-first retrieval returns substantiated notes and labels unviewed video hypotheses', async t => {
  const runner = await fixture(t), found = await runner.call('knowledge_search', { purpose: 'product-proof' });
  assert.ok(found.patterns.some(p => p.id === 'proof-focal-world'));
  assert.equal(found.patterns.every(p => p.status === 'hypothesis'), true);
  assert.equal(found.references.every(r => r.accessState === 'reference-only'), true);
  assert.equal(found.references.every(r => r.publicationDate === null && r.evidence.every(e => e.type === 'text' && !e.timecodes?.length)), true);
  assert.equal((await runner.call('knowledge_search', { purpose: 'unsupported-purpose', query: 'gradient' })).patterns.length, 0);
});

test('references persist permissions and observed timecodes, reject invented timings and undo', async t => {
  const runner = await fixture(t);
  await runner.call('knowledge_reference_set', { reference });
  const found = await runner.call('knowledge_search', { query: 'supplied' });
  assert.equal(found.references[0].evidence[0].timecodes[0].start, 2);
  await assert.rejects(runner.call('knowledge_reference_set', { reference: { ...reference, evidence: [{ id: 'text', type: 'text', observation: 'Published intent', observed: false, timecodes: [{ start: 1, end: 2 }] }] } }), error => error.issues.some(issue => /observed|timecodes/.test(issue)));
  await runner.undo();
  assert.equal((await runner.call('knowledge_search', { query: 'supplied' })).references.length, 0);
});

test('pattern promotion requires an approved original specimen and inspected evidence', async t => {
  const runner = await fixture(t);
  await runner.call('knowledge_reference_set', { reference });
  const pattern = { id: 'original-result', communicativeJob: 'Show a result', purposes: ['product-proof'], tags: ['restrained'], applicability: 'Product proof', prerequisites: ['Truthful result'], originalSketch: 'Neutral original panel resolves to result', phases: ['establish', 'resolve', 'hold'], parameters: ['hold'], boundaryContract: 'Stable output', evidence: [{ referenceId: 'proof-demo', evidenceId: 'clip-review' }], failureModes: ['Unreadable result'], status: 'template-ready' };
  await assert.rejects(runner.call('knowledge_pattern_set', { pattern }), /original specimen/);
  const reviewed = { ...pattern, originalSpecimen: { id: 'specimen-1', artifact: 'renders/original-result.mp4', original: true, review: { status: 'approved', evidence: [{ referenceId: 'proof-demo', evidenceId: 'clip-review' }] } } };
  await assert.rejects(runner.call('knowledge_pattern_set', { pattern: reviewed }), /specimen artifact/);
  await runner.call('knowledge_reference_set', { reference: { ...reference, evidence: [{ ...reference.evidence[0], artifact: 'renders/original-result.mp4' }] } });
  await runner.call('knowledge_pattern_set', { pattern: reviewed });
  assert.equal((await runner.call('knowledge_search', { purpose: 'product-proof', query: 'neutral' })).patterns[0].id, 'original-result');
});

test('changing reference evidence cannot silently orphan a stored pattern', async t => {
  const runner = await fixture(t);
  const seeded = (await runner.call('knowledge_search', { purpose: 'product-proof' })).references.find(r => r.id === 'webflow-ecommerce');
  await assert.rejects(runner.call('knowledge_reference_set', { reference: { ...seeded, evidence: [] } }), /missing reference or evidence/);
});

test('review records preserve unverified dimensions and keep taste distinct from performance', async t => {
  const runner = await fixture(t);
  const review = { id: 'review-1', shotIds: ['proof'], boundary: { from: 'proof', to: 'cta' }, evidence: [{ id: 'frames', type: 'frames', observation: 'CTA crop inspected', observed: true, timecodes: [{ start: 4, end: 4 }] }], findings: [{ id: 'cta-small', severity: 'major', dimension: 'composition-text', message: 'CTA is too small', suggestedRepair: 'Increase CTA size', timecodes: [{ start: 4, end: 4 }], evidenceIds: ['frames'] }], unverifiedDimensions: ['timing-readability', 'message-proof'], taste: [{ note: 'Creator preferred restrained version', provenance: { source: 'user', actor: 'creator', at: '2026-10-07T00:00:00Z' } }], performance: [] };
  await runner.call('review_record', { review });
  const resumed = await runner.call('review_get');
  assert.deepEqual(resumed.reviews[0].unverifiedDimensions, ['timing-readability', 'message-proof']);
  assert.equal(resumed.reviews[0].performance.length, 0);
  await assert.rejects(runner.call('review_record', { review: { ...review, performance: [{ note: 'Preferred means converts better' }] } }), /Invalid input/);
  await assert.rejects(runner.call('review_record', { review: { ...review, findings: [{ ...review.findings[0], evidenceIds: ['missing'] }] } }), /evidence/);
});

test('performance measurements require observed performance evidence', async t => {
  const runner = await fixture(t);
  const review = { id: 'campaign-review', shotIds: ['proof'], evidence: [{ id: 'analytics', type: 'performance', observation: 'Campaign analytics export', observed: false }], findings: [], unverifiedDimensions: ['message-proof'], taste: [], performance: [{ objective: 'Measure CTA response', placement: 'Homepage', audience: 'Product evaluators', dates: { start: '2026-10-01', end: '2026-10-07' }, metricDefinition: 'Click-through rate', sample: '100 impressions', context: 'Homepage campaign', experimentDesign: 'Single campaign observation', evidenceIds: ['analytics'], value: 0.5 }] };
  await assert.rejects(runner.call('review_record', { review }), /observed performance evidence/);
  assert.deepEqual((await runner.call('review_get')).reviews, []);
  await runner.call('review_record', { review: { ...review, evidence: [{ ...review.evidence[0], observed: true }] } });
  assert.equal((await runner.call('review_get')).reviews[0].performance[0].value, 0.5);
});
