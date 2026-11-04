# Brief, knowledge and review foundations

The director uses data rather than an implicit chat history. `brief.js` exposes
the eight brief fields, input schemas, `getBrief`, `briefState`, `updateBrief`
and `setDecision`. `knowledge.js` exposes reference/evidence/pattern/review
schemas, `getKnowledge`, `searchKnowledge`, `validatePatternEvidence` and
`validateReviewEvidence`.

`packages/tools/src/director-tools.js` exports `DIRECTOR_TOOLS`; the ordinary
tool runner registers them for Studio, CLI and MCP. Every write reads and writes
`project.json` through a transaction and is undoable. Reads never initiate an
interview or modify the project.

## Brief

`brief_get` returns `brief`, the currently answerable `questions`,
`blockedQuestions` and the selected project brand. `brief_update` takes a
`patch` and `provenance` for audience, message, evidence, format, duration in
seconds, tone, CTA and brand identity. Empty fields remain unresolved. Entering
a brand identity in the brief does not silently activate a brand pack.

`brief_decision_set` takes a `decision` with id, optional brief field, answer,
confidence (confirmed/provisional/delegated), scope (project/brand/general),
dependencies and provenance. Provenance requires source, actor and timestamp;
reviewed artifact and version are optional. A changed answer requires
`reopenReason`; previous answers remain in history. Changed upstream choices
mark dependent decisions stale without erasing the old answers. Records of
brand/general preference are scoped provenance, not automatic cross-project
preference synchronization.

`brief_question_set` stores questions with options, recommendation, reason and
prerequisites. `briefState` returns only the answerable frontier. Settled choices
are omitted on resume; stale choices become unresolved again.

`brief_interview_start` requires `mode: "deep"` and returns the reviewed pinned
upstream instructions and source metadata. The default quick brief is our own
adaptation. The explicit deep interview is performed by the director; these
tools persist the tree and answers rather than substituting a fixed generated
questionnaire for a conversation. `brief_interview_finish` requires
`sharedUnderstandingConfirmed: true` and an empty unresolved frontier including
blocked questions. Vendored source and MIT notice are in
`vendor/mattpocock-skills`.

## Knowledge and review

`knowledge_search` takes optional `purpose`, `tags`, `query` and `limit`.
Purpose and tags constrain retrieval before text relevance; it returns pattern
cards with their supporting reference evidence. Seeds are original report notes
and original sketches, labeled hypotheses. No media is included or processed.

`knowledge_reference_set` stores a reference with canonical URL, creator/client,
publication date (null when unknown), access date, access state, selection reason
and evidence. Access states are reference-only, analysis-authorized and
reuse-authorized. They record permission; they do not infer permission from a
URL or run a downloader. Evidence types are text, still, frames, playback,
human and performance. Timecodes use inclusive `start`/`end` seconds; only
actually observed media/human evidence may carry them.

`knowledge_pattern_set` stores communicative job, purposes, applicability,
prerequisites, original sketch, phases, parameters, boundary contract, evidence
links and failure modes. A specimen-reviewed or template-ready card needs an
approved original specimen whose artifact is identified by inspected review
evidence. This is a provenance gate, not automatic creative approval. Reference
changes that would orphan a pattern's evidence are rejected.

`review_record` stores affected shot ids and optional adjacent-shot boundary,
findings with severity and suggested repair, evidence, unverified dimensions,
taste and separate performance records. A finding's timecodes must be covered
by its linked observed evidence. Performance records require objective,
placement, audience, date range, metric definition, sample, context, experiment
design and performance evidence. Preference is never promoted to advertising
success. `review_get` reads saved reviews. These are data foundations; they do
not automatically play clips, assess comprehension or generate findings.

Studio's brief panel also exposes a purpose-first reference shelf and a compact
timecoded finding form. Preview interval renders an affected interval through
`review_clip`; Preview outgoing boundary uses `transition_preview`. The user
must explicitly attest inspection before saving a finding. Playback never
automatically changes evidence state, and taste notes are recorded separately.
