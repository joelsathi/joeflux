import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { loadProject } from '../../core/src/io.js';
import { briefState, getBrief, updateBrief, setDecision, briefPatchSchema, decisionSchema, questionSchema, provenanceSchema, INTERVIEW_SOURCE } from '../../director/src/brief.js';
import { defineTool, ToolError } from './runner.js';
import { sceneFingerprint } from '../../renderer/src/render.js';

// The rendered state each reviewed shot had, so later turns can tell unchanged shots from edited ones.
async function shotFingerprints(project, shotIds) {
  const entries = [];
  for (const id of shotIds) {
    const scene = project.scenes.find((item) => item.id === id);
    if (scene) try { entries.push([id, await sceneFingerprint(project, scene)]); } catch { /* A shot with missing media has no stable fingerprint. */ }
  }
  return Object.fromEntries(entries);
}
import { getKnowledge, searchKnowledge, referenceSchema, patternSchema, reviewSchema, validatePatternEvidence, validateReviewEvidence } from '../../director/src/knowledge.js';

const mutation = (name, description, input, update) => defineTool({ name, description, input, mutates: true, summary: () => description, async run({ tx }, args) {
  const project = await tx.readJson('project.json');
  try { project.brief = await update(project, args); } catch (error) { throw new ToolError(error.message); }
  tx.writeJson('project.json', project);
  return briefState(project);
} });

export const DIRECTOR_TOOLS = [
  defineTool({ name: 'brief_get', description: 'Resume the persistent quick brief, settled decisions and only answerable unresolved questions. Reading never starts an interview.', async run({ root }) { return briefState(await loadProject(root)); } }),
  mutation('brief_update', 'Update brief fields while preserving settled decisions', z.object({ patch: briefPatchSchema, provenance: provenanceSchema }), (project, { patch, provenance }) => updateBrief(project, patch, provenance)),
  mutation('brief_decision_set', 'Record an approved or delegated decision with provenance', z.object({ decision: decisionSchema, reopenReason: z.string().min(1).optional() }), (project, { decision, reopenReason }) => setDecision(project, decision, reopenReason)),
  mutation('brief_question_set', 'Record an unresolved question and its decision prerequisites', z.object({ question: questionSchema }), (project, { question }) => { const brief = getBrief(project); return { ...brief, questions: [...brief.questions.filter(q => q.id !== question.id), question] }; }),
  defineTool({ name: 'brief_interview_start', description: 'Explicitly invoke Grill this concept using the reviewed pinned MIT source. Resume existing answers, ask frontier rounds with recommendations, discover facts yourself and wait for shared understanding.', input: z.object({ mode: z.literal('deep') }), mutates: true, summary: () => 'Start deep concept interview', async run({ tx }) {
    const project = await tx.readJson('project.json'), brief = getBrief(project);
    project.brief = { ...brief, interview: brief.interview?.status === 'active' ? brief.interview : { mode: 'deep', status: 'active', source: INTERVIEW_SOURCE } };
    const instructions = await readFile(new URL('../../../vendor/mattpocock-skills/grilling/SKILL.md', import.meta.url), 'utf8');
    tx.writeJson('project.json', project);
    return { ...briefState(project), source: INTERVIEW_SOURCE, instructions };
  } }),
  mutation('brief_interview_finish', 'Confirm shared understanding after the deep interview choices are resolved', z.object({ sharedUnderstandingConfirmed: z.literal(true) }), project => {
    const state = briefState(project);
    if (state.brief.interview?.status !== 'active') throw new Error('No deep interview is active.');
    if (state.questions.length || state.blockedQuestions.length) throw new Error('The interview still has unresolved questions or prerequisites.');
    return { ...state.brief, interview: { ...state.brief.interview, status: 'complete', sharedUnderstandingConfirmed: true } };
  }),
  defineTool({ name: 'knowledge_search', description: 'Retrieve original pattern hypotheses and source evidence by communication purpose, constraints and text. No media is downloaded and no performance is inferred.', input: z.object({ purpose: z.string().optional(), tags: z.array(z.string()).optional(), query: z.string().optional(), limit: z.number().int().min(1).max(100).optional() }), async run({ root }, input) { return searchKnowledge(await loadProject(root), input); } }),
  ...[['reference', referenceSchema], ['pattern', patternSchema]].map(([kind, schema]) => defineTool({ name: `knowledge_${kind}_set`, description: `Save a structured ${kind} with source evidence and permissions as an undoable project change`, input: z.object({ [kind]: schema }), mutates: true, summary: () => `Save knowledge ${kind}`, async run({ tx }, input) {
    const project = await tx.readJson('project.json'), record = input[kind];
    if (kind === 'pattern') try { validatePatternEvidence(record, getKnowledge(project)); } catch (error) { throw new ToolError(error.message); }
    const key = `${kind}s`, saved = project.knowledge ?? { version: 1, references: [], patterns: [] };
    project.knowledge = { ...saved, [key]: [...(saved[key] ?? []).filter(item => item.id !== record.id), record] };
    if (kind === 'reference') try { const knowledge = getKnowledge(project); for (const pattern of knowledge.patterns) validatePatternEvidence(pattern, knowledge); } catch (error) { throw new ToolError(error.message); }
    tx.writeJson('project.json', project); return { [kind]: record };
  } })),
  defineTool({ name: 'review_record', description: 'Save timecoded severity findings with observed evidence, unverified dimensions, taste feedback and separate contextual performance records. Stores each reviewed shot\'s fingerprint', input: z.object({ review: reviewSchema }), mutates: true, summary: () => 'Record evidence-backed review', async run({ tx, root }, { review }) {
    try { validateReviewEvidence(review); } catch (error) { throw new ToolError(error.message); }
    const stored = { ...review, fingerprints: await shotFingerprints(await loadProject(root), review.shotIds) };
    const project = await tx.readJson('project.json'); project.reviews = [...(project.reviews ?? []).filter(item => item.id !== review.id), stored];
    tx.writeJson('project.json', project); return { review: stored };
  } }),
  defineTool({ name: 'review_get', description: 'Read recorded findings, affected shots and boundaries, evidence and dimensions still unverified. changedShots lists reviewed shots edited since', async run({ root }) {
    const project = await loadProject(root);
    return { reviews: await Promise.all((project.reviews ?? []).map(async (review) => {
      if (!review.fingerprints) return review;
      const now = await shotFingerprints(project, Object.keys(review.fingerprints));
      return { ...review, changedShots: Object.keys(review.fingerprints).filter((id) => now[id] !== review.fingerprints[id]) };
    })) };
  } }),
];
