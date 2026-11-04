import { useEffect, useRef, useState } from 'react';
import { Box, Button, Checkbox, FormControlLabel, MenuItem, TextField, Typography } from '@wso2/oxygen-ui';
import { callTool } from './api.js';
import { useStudio } from './studio-context.jsx';
import { BRIEF_FIELDS, briefState } from '../../../packages/director/src/brief.js';
import { REVIEW_DIMENSIONS } from '../../../packages/director/src/knowledge.js';
import { BRAND_KITS, brandUrl, getBrandKit } from '../../../packages/presets/src/brand-kits.js';

const LABELS = { audience: 'Audience', message: 'Main message', evidence: 'Visible evidence', format: 'Format / placement', duration: 'Duration (seconds)', tone: 'Tone', cta: 'Call to action', brand: 'Brand / identity' };
const provenance = () => ({ source: 'studio-quick-brief', actor: 'creator', at: new Date().toISOString() });

export function GuidePanel({ onPrompt, ready }) {
  const { project, run } = useStudio();
  return <>{BRAND_KITS.length > 0 && <BrandKitPanel project={project} run={run} />}<QuickBriefPanel project={project} run={run} onPrompt={onPrompt} ready={ready} /></>;
}

function BrandKitPanel({ project, run }) {
  const [busy, setBusy] = useState(false), kit = getBrandKit(project.brand);
  const change = async (name, input) => { setBusy(true); try { await run(name, input); } catch { /* shared context reports the error */ } finally { setBusy(false); } };
  const current = role => project.scenes.find(scene => scene.id === `brand-${role}`)?.screen?.asset;
  return <Box className="guide brand-kit" aria-label="Brand kit">
    <Box className="guide-heading"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Brand kit</Typography><Typography variant="caption" color="text.secondary">Adds the logo overlay, kit themes, backgrounds and bookends.</Typography></Box>
    <TextField select size="small" fullWidth label="Kit" value={kit?.id ?? 'none'} disabled={busy} onChange={event => change('project_update', { brand: event.target.value })}>
      <MenuItem value="none">None</MenuItem>
      {BRAND_KITS.map(item => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
    </TextField>
    {kit && <Box className="guide-body">
      <Box className="brand-kit-logos">{['onDark', 'onLight'].filter(mode => kit.logos[mode]).map(mode => <img key={mode} className={`brand-kit-logo is-${mode}`} src={brandUrl(kit.id, kit.logos[mode])} alt={`${kit.name} logo ${mode === 'onDark' ? 'on dark' : 'on light'}`} />)}</Box>
      <Typography variant="caption" color="text.secondary">{kit.themes.length} themes · {kit.backgrounds.length} backgrounds. Pick them in the inspector under Theme and Background gallery.</Typography>
      {['intro', 'outro'].map(role => kit.bookends.some(item => item.role === role) && <Box key={role} className="brand-kit-bookend"><Typography variant="caption" sx={{ textTransform: 'capitalize', fontWeight: 700 }}>{role}</Typography><Box>
        {[...kit.bookends.filter(item => item.role === role), { id: 'none', label: 'None' }].map(item => <Button key={item.id} size="small" disabled={busy} variant={(current(role) ?? 'none') === (item.id === 'none' ? 'none' : `${kit.id}-${item.id}`) ? 'contained' : 'outlined'} onClick={() => change('brand_bookend_apply', { role, bookend: item.id })}>{item.label}</Button>)}
      </Box></Box>)}
    </Box>}
  </Box>;
}

function QuickBriefPanel({ project, run, onPrompt, ready }) {
  const state = briefState(project), [draft, setDraft] = useState(state.brief), [busy, setBusy] = useState(false), [reopenReason, setReopenReason] = useState('');
  const saved = useRef(state.brief), savedKey = JSON.stringify(state.brief);
  // Take in saved changes while keeping fields the creator is still editing.
  useEffect(() => {
    const previous = saved.current; saved.current = state.brief;
    setDraft(current => ({ ...state.brief, ...Object.fromEntries(BRIEF_FIELDS.filter(field => current[field] !== previous[field]).map(field => [field, current[field]])) }));
  }, [savedKey]);
  const perform = async (action) => { setBusy(true); try { return await action(); } catch { /* shared context reports the error */ } finally { setBusy(false); } };
  const revisedDecisions = state.brief.decisions.filter(decision => decision.field && draft[decision.field] !== state.brief[decision.field]);
  const save = () => perform(async () => {
    const patch = Object.fromEntries(BRIEF_FIELDS.filter(field => draft[field] !== state.brief[field]).map(field => [field, draft[field] === '' ? null : draft[field]]));
    for (const saved of revisedDecisions) {
      const { id, field, confidence, scope, dependencies } = saved;
      await run('brief_decision_set', { decision: { id, field, confidence, scope, dependencies, answer: draft[field], provenance: provenance() }, reopenReason });
      delete patch[field];
    }
    if (Object.keys(patch).length) await run('brief_update', { patch, provenance: provenance() });
    setReopenReason('');
  });
  const startInterview = () => perform(async () => {
    await run('brief_interview_start', { mode: 'deep' });
    onPrompt('Grill this concept. Retrieve the pinned interview instructions, resume saved decisions, ask the answerable frontier with recommendations, and wait for shared understanding before acting.');
  });
  return <Box className="guide" aria-label="Quick video brief">
    <Box className="guide-heading"><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Start with the brief</Typography><Typography variant="caption" color="text.secondary">Save the audience, message and proof. The director resumes these choices.</Typography></Box>
    <Box className="guide-body" sx={{ gap: 1 }}>
      {BRIEF_FIELDS.map(field => <TextField key={field} size="small" label={LABELS[field]} type={field === 'duration' ? 'number' : 'text'} value={draft[field] ?? ''} disabled={busy} onChange={event => setDraft(previous => ({ ...previous, [field]: field === 'duration' && event.target.value !== '' ? Number(event.target.value) : event.target.value }))} slotProps={field === 'duration' ? { htmlInput: { min: 1, step: 1 } } : undefined} />)}
      {revisedDecisions.length > 0 && <TextField size="small" label="Reason to revisit saved choices" helperText="Explain the new evidence or changed requirement." value={reopenReason} onChange={event => setReopenReason(event.target.value)} />}
      <Button size="small" variant="outlined" disabled={busy || revisedDecisions.length > 0 && !reopenReason.trim()} onClick={save}>Save brief</Button>
      {state.brief.decisions.length > 0 && <Box aria-label="Saved decisions">{state.brief.decisions.map(decision => <Typography key={decision.id} variant="caption" component="p">{decision.id}: {String(decision.answer)} · {decision.confidence} · {decision.scope}</Typography>)}</Box>}
      {state.questions.filter(question => state.brief.questions.some(item => item.id === question.id)).map(question => <Box key={question.id}><Typography variant="body2">{question.question}</Typography><Typography variant="caption">Recommended: {question.recommendation}. {question.reason}</Typography>{question.options.map(answer => <Button key={answer} size="small" disabled={busy} onClick={() => perform(() => run('brief_decision_set', { decision: { id: question.id, ...(question.field ? { field: question.field } : {}), answer, confidence: 'confirmed', scope: 'project', dependencies: question.dependencies, provenance: provenance() } }))}>{answer}</Button>)}</Box>)}
      <Button size="small" disabled={!ready || busy} onClick={() => onPrompt('Resume the saved quick brief. Inspect project assets and facts, then ask only high-impact unresolved questions with recommendations. Preserve settled choices and delegated taste decisions.')}>Discuss unresolved choices</Button>
      <Button size="small" disabled={!ready || busy} onClick={startInterview}>Grill this concept</Button>
      {state.blockedQuestions.length > 0 && <Typography variant="caption">{state.blockedQuestions.length} questions are waiting on earlier decisions.</Typography>}
      {state.brief.interview?.status === 'active' && <><Typography variant="caption">Deep interview in progress · saved decisions will be resumed.</Typography><Button size="small" disabled={busy || state.questions.length > 0 || state.blockedQuestions.length > 0} onClick={() => perform(() => run('brief_interview_finish', { sharedUnderstandingConfirmed: true }))}>Confirm shared understanding</Button></>}
      <EvidenceAndReview />
    </Box>
  </Box>;
}

const PURPOSES = ['product-proof', 'brand-reveal', 'compare-before-after', 'explain-workflow', 'explain-state-change', 'brand-recall'];
function EvidenceAndReview() {
  const { project, selectedId, run } = useStudio();
  const [panel, setPanel] = useState(null), [purpose, setPurpose] = useState('product-proof'), [query, setQuery] = useState('');
  const [knowledge, setKnowledge] = useState(null), [reviews, setReviews] = useState([]), [error, setError] = useState(null), [busy, setBusy] = useState(false), [clip, setClip] = useState(null);
  const [form, setForm] = useState({ message: '', repair: '', note: '', start: '', end: '', inspected: false, evidenceType: 'playback', dimension: 'timing-readability', severity: 'major', taste: '' });
  const sceneVersion = JSON.stringify([selectedId, project.scenes, project.assets, project.output]);
  const latestVersion = useRef(sceneVersion); latestVersion.current = sceneVersion;
  const update = (key, value) => {
    if (['start','end'].includes(key)) setClip(null);
    setForm(previous => ({ ...previous, [key]: value, ...(['start','end'].includes(key) ? {inspected:false} : {}) }));
  };
  useEffect(() => { setClip(null); setForm(previous=>({...previous,inspected:false})); }, [sceneVersion]);
  useEffect(() => {
    if (!panel) return;
    let active = true; setError(null);
    const request = panel === 'references' ? callTool('knowledge_search', { purpose, query }) : callTool('review_get');
    request.then(result => { if (active) panel === 'references' ? setKnowledge(result) : setReviews(result.reviews); }).catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [panel, purpose, project.reviews]);
  const search = async () => { setBusy(true); setError(null); try { setKnowledge(await callTool('knowledge_search', { purpose, query })); } catch (cause) { setError(cause.message); } finally { setBusy(false); } };
  const valid = selectedId && !clip?.stale && form.inspected && form.message.trim() && form.repair.trim() && form.note.trim() && form.start !== '' && form.end !== '' && Number(form.start) >= 0 && Number(form.end) >= Number(form.start);
  const previewable = selectedId && form.start !== '' && form.end !== '' && Number(form.start) >= 0 && Number(form.end) > Number(form.start) && Number(form.end) - Number(form.start) <= 10;
  const previewInterval = async () => {
    setBusy(true); setError(null);
    try {
      const result=await run('review_clip', { id: selectedId, startFrame: Math.floor(Number(form.start) * project.output.fps), endFrame: Math.ceil(Number(form.end) * project.output.fps), width: 480 });
      if(latestVersion.current!==sceneVersion)throw new Error('The shot changed during review rendering. Preview it again.');
      setClip(result); setForm(previous=>({...previous,inspected:false}));
    }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  };
  const nextShot = project.scenes[project.scenes.findIndex(scene => scene.id === selectedId) + 1];
  const previewBoundary = async () => {
    setBusy(true); setError(null);
    try {
      const result=await run('transition_preview', { id: selectedId, width: 480 });
      if(latestVersion.current!==sceneVersion)throw new Error('The boundary changed during review rendering. Preview it again.');
      setForm(previous=>({...previous,start:'0',end:String(result.frames/result.fps),inspected:false}));
      setClip(result);
    }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  };
  const record = async () => {
    setBusy(true); setError(null);
    const id = `review-${crypto.randomUUID()}`, timecodes = [{ start: Number(form.start), end: Number(form.end) }];
    try {
      await run('review_record', { review: {
        id, shotIds: clip?.next ? [selectedId,clip.next] : [selectedId], ...(clip?.next ? {boundary:{from:selectedId,to:clip.next}} : {}), evidence: [{ id: 'inspection', type: form.evidenceType, observation: form.note, observed: true, timecodes, artifact: clip?.next ? clip.url : `scene:${selectedId}`, ...(clip?.fingerprint ? { source: `Inspected preview version ${clip.fingerprint}` } : {}) }],
        findings: [{ id: 'finding', severity: form.severity, dimension: form.dimension, message: form.message, suggestedRepair: form.repair, timecodes, evidenceIds: ['inspection'] }],
        unverifiedDimensions: REVIEW_DIMENSIONS.filter(dimension => dimension !== form.dimension), taste: form.taste.trim() ? [{ note: form.taste, provenance: provenance() }] : [], performance: [],
      } });
      setForm(previous => ({ ...previous, message: '', repair: '', note: '', inspected: false, taste: '' }));
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  };
  return <Box sx={{ width: '100%' }}>
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: .5 }}><Button size="small" aria-expanded={panel === 'references'} onClick={() => setPanel(panel === 'references' ? null : 'references')}>Reference shelf</Button><Button size="small" aria-expanded={panel === 'reviews'} onClick={() => setPanel(panel === 'reviews' ? null : 'reviews')}>Timecoded review</Button></Box>
    {error && <Typography role="alert" variant="caption" color="error">{error}</Typography>}
    {panel === 'references' && <Box aria-label="Reference shelf results" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <TextField select size="small" label="Communication purpose" value={purpose} onChange={event => setPurpose(event.target.value)}>{PURPOSES.map(value => <MenuItem key={value} value={value}>{value.replaceAll('-', ' ')}</MenuItem>)}</TextField>
      <TextField size="small" label="Search notes" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') search(); }} />
      <Button size="small" disabled={busy} onClick={search}>Search references</Button>
      {knowledge?.patterns.map(pattern => <Box key={pattern.id} sx={{ border: '1px solid', borderColor: 'divider', p: 1, borderRadius: 1 }}><Typography variant="body2">{pattern.communicativeJob}</Typography><Typography variant="caption" component="p">{pattern.status === 'hypothesis' ? 'hypothesis · specimen review pending' : pattern.status}</Typography><Typography variant="caption" component="p">Needs: {pattern.prerequisites.join('; ')}</Typography><Typography variant="caption" component="p">Failure modes: {pattern.failureModes.join('; ')}</Typography><Typography variant="caption" component="p">{pattern.limitation}</Typography></Box>)}
      {knowledge?.references.map(reference => <Box key={reference.id} sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 1 }}>
        <Typography variant="body2" component="a" href={/^https?:\/\//.test(reference.canonicalURL) ? reference.canonicalURL : undefined} target="_blank" rel="noopener noreferrer">{reference.title}</Typography><Typography variant="caption" component="p">{reference.creator}{reference.client ? ` · ${reference.client}` : ''}</Typography><Typography variant="caption" component="p">{reference.accessState} · {reference.publicationDate ?? 'publication date unknown'}</Typography>
        {reference.evidence.map(evidence => <Typography key={evidence.id} variant="caption" component="p">{evidence.type} · {evidence.observed ? 'inspected' : 'unviewed media / note only'}: {evidence.observation} {evidence.limitation}</Typography>)}
      </Box>)}
      {knowledge && !knowledge.patterns.length && !knowledge.references.length && <Typography variant="caption">No evidence matched this purpose and query.</Typography>}
      <Typography variant="caption">Notes support craft and intent. Advertising performance is unknown.</Typography>
    </Box>}
    {panel === 'reviews' && <Box aria-label="Timecoded review records" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="caption">Selected shot: {selectedId ?? 'choose a shot'}. Record what you inspected; a finding is not creative approval.</Typography>
      <TextField size="small" label="Review observation" value={form.message} onChange={event => update('message', event.target.value)} />
      <TextField size="small" label="Suggested repair" value={form.repair} onChange={event => update('repair', event.target.value)} />
      <TextField select size="small" label="Review dimension" value={form.dimension} onChange={event => update('dimension', event.target.value)}>{REVIEW_DIMENSIONS.map(value => <MenuItem key={value} value={value}>{value.replaceAll('-', ' ')}</MenuItem>)}</TextField>
      <TextField select size="small" label="Finding severity" value={form.severity} onChange={event => update('severity', event.target.value)}>{['blocker', 'major', 'minor', 'info'].map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
      <TextField select size="small" label="Inspection evidence" value={form.evidenceType} onChange={event => update('evidenceType', event.target.value)}>{['playback', 'frames', 'still', 'human'].map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
      <TextField size="small" label="Evidence note" value={form.note} onChange={event => update('note', event.target.value)} />
      <Box sx={{ display: 'flex', gap: 1 }}>{['start', 'end'].map(key => <TextField key={key} disabled={busy} size="small" type="number" label={`${key === 'start' ? 'Start' : 'End'} (seconds)`} value={form[key]} onChange={event => update(key, event.target.value)} slotProps={{ htmlInput: { min: 0, step: .01 } }} />)}</Box>
      <Button size="small" disabled={busy || !previewable} onClick={previewInterval}>Preview interval</Button>
      {nextShot && <Button size="small" disabled={busy || !selectedId} onClick={previewBoundary}>Preview outgoing boundary</Button>}
      <Typography variant="caption">Preview up to 10 seconds. Playback alone does not record an inspection or approval.</Typography>
      {clip?.url && <Box component="video" aria-label="Affected review interval" src={clip.url} controls muted playsInline sx={{ width: '100%' }} />}
      {clip?.next && <Typography variant="caption">Boundary {selectedId} → {clip.next}. Times refer to this preview clip.</Typography>}
      {clip?.stale && <Typography role="alert" variant="caption" color="error">This preview is stale. Render the interval again before recording evidence.</Typography>}
      <FormControlLabel control={<Checkbox disabled={busy} checked={form.inspected} onChange={event => update('inspected', event.target.checked)} />} label="I inspected this interval" />
      <TextField size="small" label="Taste feedback (optional)" helperText="Preference is saved separately from performance." value={form.taste} onChange={event => update('taste', event.target.value)} />
      <Button size="small" disabled={busy || !valid} onClick={record}>Save review finding</Button>
      {reviews.map(review => <Box key={review.id} sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 1 }}><Typography variant="caption" component="p">Shots: {review.shotIds.join(', ')}{review.boundary ? ` · boundary ${review.boundary.from} → ${review.boundary.to}` : ''}</Typography>{review.findings.map(finding => <Box key={finding.id}><Typography variant="body2">{finding.message}</Typography><Typography variant="caption" component="p">{finding.severity} · {finding.dimension} · {(finding.timecodes ?? []).map(range => `${range.start}–${range.end}s`).join(', ')}</Typography><Typography variant="caption" component="p">Repair: {finding.suggestedRepair}</Typography></Box>)}<Typography variant="caption" component="p">Unverified: {review.unverifiedDimensions.join(', ') || 'See evidence for inspected dimensions'}</Typography>{review.taste.map((feedback, index) => <Typography key={index} variant="caption" component="p">Taste: {feedback.note}</Typography>)}<Typography variant="caption" component="p">{review.performance.length ? 'Performance context recorded separately' : 'Performance unknown'}</Typography></Box>)}
    </Box>}
  </Box>;
}
