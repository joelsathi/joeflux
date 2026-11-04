import { z } from 'zod';
import { provenanceSchema } from './brief.js';
import { SEED_REFERENCES, SEED_PATTERNS } from '../../../library/knowledge/seed.js';

const text = z.string().min(1), ids = z.array(text);
export const timecodeSchema = z.object({ start: z.number().nonnegative(), end: z.number().nonnegative() }).strict().refine(t => t.end >= t.start, 'timecodes end must be at or after start (seconds)');
export const evidenceSchema = z.object({ id: text, type: z.enum(['text', 'still', 'frames', 'playback', 'human', 'performance']), observation: text, observed: z.boolean(), timecodes: z.array(timecodeSchema).optional(), source: z.string().optional(), artifact: z.string().optional(), limitation: z.string().optional() }).strict().refine(e => !e.timecodes?.length || (e.observed && ['still', 'frames', 'playback', 'human'].includes(e.type)), 'timecodes require actually observed media evidence');
export const referenceSchema = z.object({ id: text, title: text, canonicalURL: z.url(), creator: text, client: z.string().nullable(), publicationDate: z.iso.date().nullable(), accessDate: z.iso.date(), accessState: z.enum(['reference-only', 'analysis-authorized', 'reuse-authorized']), audience: z.string().nullable(), platform: z.string().nullable(), selectionReason: text, tags: ids, evidence: z.array(evidenceSchema) }).strict();
const evidenceLink = z.object({ referenceId: text, evidenceId: text }).strict();
export const patternSchema = z.object({ id: text, communicativeJob: text, purposes: ids.min(1), tags: ids, applicability: text, prerequisites: ids.min(1), originalSketch: text, phases: ids.min(1), parameters: ids, boundaryContract: text, evidence: z.array(evidenceLink).min(1), failureModes: ids.min(1), status: z.enum(['hypothesis', 'specimen-reviewed', 'template-ready']), limitation: z.string().optional(), originalSpecimen: z.object({ id: text, artifact: text, original: z.literal(true), review: z.object({ status: z.enum(['approved', 'rejected']), evidence: z.array(evidenceLink).min(1) }).strict() }).strict().optional() }).strict();
export const REVIEW_DIMENSIONS = ['message-proof', 'composition-text', 'timing-readability', 'motion-continuity', 'brand-platform', 'originality', 'technical-delivery', 'reproducibility'];
const dimension = z.enum(REVIEW_DIMENSIONS);
const performanceSchema = z.object({ objective: text, placement: text, audience: text, dates: z.object({ start: z.iso.date(), end: z.iso.date() }).strict(), metricDefinition: text, sample: text, context: text, experimentDesign: text, evidenceIds: ids.min(1), value: z.number().optional() }).strict();
export const reviewSchema = z.object({ id: text, shotIds: ids.min(1), boundary: z.object({ from: text, to: text }).strict().optional(), evidence: z.array(evidenceSchema), findings: z.array(z.object({ id: text, severity: z.enum(['blocker', 'major', 'minor', 'info']), dimension, message: text, suggestedRepair: text, timecodes: z.array(timecodeSchema).optional(), evidenceIds: ids.min(1) }).strict()), unverifiedDimensions: z.array(dimension), taste: z.array(z.object({ note: text, provenance: provenanceSchema }).strict()), performance: z.array(performanceSchema) }).strict();

const merge = (seed, project) => [...new Map([...seed, ...(project ?? [])].map(item => [item.id, item])).values()];
export function getKnowledge(project) { return { version: 1, references: merge(SEED_REFERENCES, project.knowledge?.references), patterns: merge(SEED_PATTERNS, project.knowledge?.patterns) }; }
const words = value => String(value ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const includes = (haystack, query) => words(query).every(word => words(haystack).includes(word));
export function searchKnowledge(project, { purpose = '', tags = [], query = '', limit = 20 } = {}) {
  const knowledge = getKnowledge(project);
  const matches = (record, purposes) => (!purpose || purposes.some(item => includes(item, purpose))) && tags.every(tag => record.tags.includes(tag)) && (!query || includes(JSON.stringify(record), query));
  const rank = (records, label) => records.sort((a, b) => Number(includes(b[label], query)) - Number(includes(a[label], query)) || a.id.localeCompare(b.id)).slice(0, limit);
  const patterns = rank(knowledge.patterns.filter(p => matches(p, p.purposes)), 'communicativeJob');
  const linked = new Set(patterns.flatMap(p => p.evidence.map(e => e.referenceId)));
  const references = rank(knowledge.references.filter(r => linked.has(r.id) || matches(r, r.tags)), 'title');
  return { patterns, references, evidenceLimits: 'Published notes support intent, not observed video timing or conversion. Inspect an original specimen before promoting a hypothesis.' };
}
export function validatePatternEvidence(pattern, knowledge) {
  const resolve = link => knowledge.references.find(r => r.id === link.referenceId)?.evidence.find(e => e.id === link.evidenceId);
  if (pattern.evidence.some(link => !resolve(link))) throw new Error('Pattern evidence refers to a missing reference or evidence item.');
  if (pattern.status !== 'hypothesis') {
    const specimen = pattern.originalSpecimen;
    if (!specimen?.original || specimen.review.status !== 'approved') throw new Error('Pattern promotion requires an approved original specimen review.');
    if (specimen.review.evidence.some(link => !resolve(link))) throw new Error('Original specimen review refers to missing evidence.');
    if (!specimen.review.evidence.some(link => { const evidence = resolve(link); return evidence.artifact === specimen.artifact && evidence.observed && ['frames', 'playback', 'human', 'still'].includes(evidence.type); })) throw new Error('Original specimen review requires inspected media or human evidence identifying the specimen artifact.');
  }
}
export function validateReviewEvidence(review) {
  const resolve = id => review.evidence.find(e => e.id === id);
  for (const finding of review.findings) {
    if (finding.evidenceIds.some(id => !resolve(id))) throw new Error('Review finding refers to missing evidence.');
    for (const range of finding.timecodes ?? []) if (!finding.evidenceIds.some(id => { const e = resolve(id); return e.observed && e.timecodes?.some(t => t.start <= range.start && t.end >= range.end); })) throw new Error('Finding timecodes must be supported by observed evidence timecodes.');
  }
  for (const record of review.performance) if (record.evidenceIds.some(id => { const evidence = resolve(id); return evidence?.type !== 'performance' || !evidence.observed; })) throw new Error('Performance records require observed performance evidence, not taste feedback or uninspected metrics.');
}
