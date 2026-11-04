import { z } from 'zod';

export const BRIEF_FIELDS = ['audience', 'message', 'evidence', 'format', 'duration', 'tone', 'cta', 'brand'];
export const provenanceSchema = z.object({ source: z.string().min(1), actor: z.string().min(1), at: z.iso.datetime({ offset: true }), artifact: z.string().optional(), version: z.string().optional() }).strict();
const fieldSchema = z.enum(BRIEF_FIELDS);
const answerSchema = z.union([z.string().min(1), z.number().positive(), z.array(z.string().min(1)).min(1)]);
export const briefPatchSchema = z.object({ audience: z.string().nullable().optional(), message: z.string().nullable().optional(), evidence: z.string().nullable().optional(), format: z.string().nullable().optional(), duration: z.number().positive().nullable().optional(), tone: z.string().nullable().optional(), cta: z.string().nullable().optional(), brand: z.string().nullable().optional() }).strict();
export const decisionSchema = z.object({ id: z.string().min(1), field: fieldSchema.optional(), answer: answerSchema, confidence: z.enum(['confirmed', 'provisional', 'delegated']), scope: z.enum(['project', 'brand', 'general']), dependencies: z.array(z.string()).default([]), provenance: provenanceSchema }).strict();
export const questionSchema = z.object({ id: z.string().min(1), field: fieldSchema.optional(), question: z.string().min(1), options: z.array(z.string()).default([]), recommendation: z.string().min(1), reason: z.string().min(1), dependencies: z.array(z.string()).default([]), provenance: provenanceSchema }).strict();

export function getBrief(project) {
  return { version: 1, ...Object.fromEntries(BRIEF_FIELDS.map(field => [field, null])), decisions: [], questions: [], fieldProvenance: {}, interview: null, ...structuredClone(project.brief ?? {}) };
}

const hasAnswer = value => value !== null && value !== undefined && value !== '';
export function briefState(project) {
  const brief = getBrief(project), settled = new Set(brief.decisions.filter(d => d.status !== 'stale').map(d => d.id));
  for (const field of BRIEF_FIELDS) if (hasAnswer(brief[field]) && (!brief.decisions.some(d => d.field === field && d.status === 'stale') || brief.decisions.some(d => d.field === field && d.status === 'settled'))) settled.add(field);
  const custom = brief.questions.filter(q => !settled.has(q.id) && !(q.field && settled.has(q.field)));
  const covered = new Set(custom.map(q => q.field));
  const missing = BRIEF_FIELDS.filter(field => !settled.has(field) && !covered.has(field)).map(field => ({
    id: field, field, question: `What ${field} should guide this video?`, options: [], recommendation: 'Inspect existing project choices and propose an answer', reason: 'Resolve only the choices needed to direct this silent video.', dependencies: [], provenance: { source: 'quick-brief-adaptation', actor: 'harness', at: '2026-10-07T00:00:00Z' },
  }));
  const questions = [...custom, ...missing].filter(q => q.dependencies.every(id => settled.has(id)));
  return { brief, questions, blockedQuestions: custom.filter(q => !q.dependencies.every(id => settled.has(id))), selectedBrand: project.brand ?? 'none' };
}

export function updateBrief(project, patch, provenance) {
  const brief = getBrief(project);
  for (const [field, value] of Object.entries(patch)) {
    if (brief.decisions.some(d => d.field === field && d.status !== 'stale') && JSON.stringify(value) !== JSON.stringify(brief[field])) throw new Error(`The ${field} choice is settled; use brief_decision_set with a reopenReason.`);
    if (JSON.stringify(value) !== JSON.stringify(brief[field])) markDependentsStale(brief, [field], `Brief ${field} changed`);
    brief[field] = value;
    brief.fieldProvenance[field] = provenance;
  }
  return brief;
}

function markDependentsStale(brief, upstream, reason) {
  const changed = new Set(upstream);
  let again = true;
  while (again) {
    again = false;
    brief.decisions = brief.decisions.map(decision => {
      if (changed.has(decision.id) || !decision.dependencies.some(id => changed.has(id))) return decision;
      changed.add(decision.id); if (decision.field) changed.add(decision.field); again = true;
      return { ...decision, status: 'stale', staleReason: reason };
    });
  }
}

export function setDecision(project, choice, reopenReason) {
  // Option buttons submit text; the duration field stores seconds as a number.
  const decision = choice.field === 'duration' && typeof choice.answer === 'string' && /^\d+(\.\d+)?$/.test(choice.answer.trim()) ? { ...choice, answer: Number(choice.answer) } : choice;
  const brief = getBrief(project), previous = brief.decisions.find(d => d.id === decision.id);
  const fieldChanged = decision.field && JSON.stringify(brief[decision.field]) !== JSON.stringify(decision.answer);
  if (previous && JSON.stringify(previous.answer) !== JSON.stringify(decision.answer) && !reopenReason) throw new Error('Changing a settled decision requires reopenReason with new evidence or an upstream change.');
  if (decision.field) {
    const parsed = briefPatchSchema.safeParse({ [decision.field]: decision.answer });
    if (!parsed.success) throw new Error(`Invalid answer for ${decision.field}.`);
    const conflicting = brief.decisions.find(d => d.id !== decision.id && d.field === decision.field && d.status !== 'stale');
    if (conflicting) throw new Error(`The ${decision.field} choice is already settled by ${conflicting.id}. Update that decision.`);
    brief[decision.field] = decision.answer; brief.fieldProvenance[decision.field] = decision.provenance;
  }
  const record = { ...decision, status: 'settled', history: previous?.history ?? [] };
  if (previous && reopenReason) { record.history = [...record.history, { ...previous, history: undefined }]; record.reopenReason = reopenReason; }
  brief.decisions = [...brief.decisions.filter(d => d.id !== record.id), record];
  if (fieldChanged || previous && JSON.stringify(previous.answer) !== JSON.stringify(decision.answer)) markDependentsStale(brief, [decision.id, ...(decision.field ? [decision.field] : [])], reopenReason ?? `Brief ${decision.field} changed`);
  return brief;
}

export const INTERVIEW_SOURCE = { revision: 'f3fc5632f401156837ee3872f14fe33ccf1024ea', canonicalURL: 'https://github.com/mattpocock/skills/blob/f3fc5632f401156837ee3872f14fe33ccf1024ea/skills/productivity/grilling/SKILL.md', license: 'MIT', accessDate: '2026-10-07' };
