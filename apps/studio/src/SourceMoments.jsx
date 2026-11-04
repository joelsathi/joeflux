import { useEffect, useState } from 'react';
import { Alert, Box, Button, Slider, TextField, Typography } from '@wso2/oxygen-ui';
import { callTool } from './api.js';

const playBounds = (scene, fps) => {
  const p = scene.playback ?? {}, first = p.moments?.[0], last = p.moments?.at(-1), sourceFps = p.sourceFps ?? fps;
  const start = first ? first.startSeconds ?? first.sourceSeconds : p.startSeconds ?? (p.startFrame ?? 0) / sourceFps;
  const end = last ? last.endSeconds ?? last.sourceSeconds : p.endSeconds ?? (p.endFrame === undefined ? start + scene.durationFrames / fps : p.endFrame / sourceFps);
  return { start, end };
};

export function SourceMoments({ scene, project, run }) {
  const fps = project.output.fps, p = scene.playback ?? {}, asset = scene.screen?.asset ?? scene.params?.asset;
  const [start, setStart] = useState('0'), [end, setEnd] = useState('0'), [waitStart, setWaitStart] = useState('0'), [waitEnd, setWaitEnd] = useState('0'), [rate, setRate] = useState('4'), [holdFrames, setHoldFrames] = useState(String(fps));
  const [timeline, setTimeline] = useState(null), [sourceIndex, setSourceIndex] = useState(0), [error, setError] = useState(null), [busy, setBusy] = useState(false), [attempt, retry] = useState(0);
  const identity = JSON.stringify([scene.id, scene.playback, scene.durationFrames, project.assets?.[asset]]);
  useEffect(() => {
    const bounds = playBounds(scene, fps); setStart(String(bounds.start)); setEnd(String(bounds.end));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, fps]);
  useEffect(() => {
    const controller = new AbortController(); setTimeline(null); setError(null); setSourceIndex(0);
    callTool('source_timeline', { id: scene.id }, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setTimeline(value); }, reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [scene.id, asset, project.assets?.[asset], attempt]);
  const sourceSeconds = timeline?.timestamps[sourceIndex] ?? 0;
  const advanced = !p.moments && Boolean(p.segments?.length || p.holds?.length);
  const save = async (name, input) => {
    setBusy(true); setError(null);
    try { await run(name, { id: scene.id, ...input }); } catch (reason) { setError(reason.message); } finally { setBusy(false); }
  };
  const numberField = (label, value, setter, extra = {}) => <TextField size="small" type="number" label={label} value={value} onChange={event => setter(event.target.value)} slotProps={{ htmlInput: { min: 0, step: 1 / (timeline?.sourceFps ?? p.sourceFps ?? fps), ...extra } }} />;
  const disabled = busy || !timeline || advanced;
  return <Box className="source-moments" sx={{ mt: 2 }}>
    <Typography variant="subtitle2" sx={{ mb: 1 }}>Source moments</Typography>
    {error && <Alert severity="error" sx={{ mb: 1 }} action={<Button color="inherit" onClick={() => retry(value => value + 1)}>Retry</Button>}>{error}</Alert>}
    {advanced && <Alert severity="info" sx={{ mb: 1 }}>This shot already has speed ramps or freezes. Choose source bounds below to replace that timing and use these controls. Camera choices are preserved.</Alert>}
    {!timeline && !error && <Typography variant="caption">Reading source frames…</Typography>}
    {timeline && <>
      <img src={`/project-assets/source-frame?asset=${encodeURIComponent(asset)}&time=${sourceSeconds}`} alt={`Source frame ${sourceIndex} at ${sourceSeconds.toFixed(4)} seconds`} style={{ width: '100%', maxHeight: 180, objectFit: 'contain', background: '#111', borderRadius: 6 }} onError={() => setError('Could not decode the selected source frame. Retry source inspection.')} />
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1 }}><Button size="small" aria-label="Previous source frame" disabled={!sourceIndex} onClick={() => setSourceIndex(value => value - 1)}>−1 frame</Button><Typography variant="caption">{sourceIndex} · {sourceSeconds.toFixed(4)} s</Typography><Button size="small" aria-label="Next source frame" disabled={sourceIndex >= timeline.timestamps.length - 1} onClick={() => setSourceIndex(value => value + 1)}>+1 frame</Button></Box>
      <Slider size="small" aria-label="Source frame" min={0} max={Math.max(1, timeline.timestamps.length - 1)} value={sourceIndex} onChange={(_, index) => setSourceIndex(Math.min(index, timeline.timestamps.length - 1))} />
    </>}
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 1.5 }}>
      {numberField('Source start (seconds)', start, setStart)}{numberField('Source end (seconds)', end, setEnd)}
      <Button size="small" disabled={!timeline} onClick={() => setStart(String(sourceSeconds))}>Use frame as start</Button><Button size="small" disabled={!timeline} onClick={() => setEnd(String(sourceSeconds))}>Use frame as end</Button>
    </Box>
    {advanced ? <Button size="small" disabled={busy || !timeline || start === '' || end === ''} onClick={() => save('source_set_moments', { moments: [{ type: 'play', startSeconds: Number(start), endSeconds: Number(end) }] })}>Replace with trimmed playback</Button> : <Button size="small" disabled={disabled || start === '' || end === ''} onClick={() => save('source_trim', { startSeconds: Number(start), endSeconds: Number(end) })}>Apply source trim</Button>}
    <Typography variant="caption" display="block" sx={{ mt: 1.5, mb: 1 }}>Waiting range</Typography>
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>{numberField('Waiting start (seconds)', waitStart, setWaitStart)}{numberField('Waiting end (seconds)', waitEnd, setWaitEnd)}
      <Button size="small" disabled={!timeline} onClick={() => setWaitStart(String(sourceSeconds))}>Start waiting here</Button><Button size="small" disabled={!timeline} onClick={() => setWaitEnd(String(sourceSeconds))}>End waiting here</Button>
      {numberField('Waiting speed', rate, setRate, { min: 1.01, step: .5 })}<Button size="small" disabled={disabled} onClick={() => save('source_skip_wait', { startSeconds: Number(waitStart), endSeconds: Number(waitEnd), rate: Number(rate) })}>Shorten waiting</Button>
    </Box>
    <Button size="small" disabled={disabled} onClick={() => save('source_skip_wait', { startSeconds: Number(waitStart), endSeconds: Number(waitEnd) })}>Skip waiting</Button>
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1.5 }}>{numberField('Result hold (frames)', holdFrames, setHoldFrames, { min: 1, step: 1 })}<Button size="small" disabled={disabled} onClick={() => save('source_hold_result', { sourceSeconds, frames: Number(holdFrames) })}>Hold this result</Button></Box>
    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>Source frames use recording timestamps. Holds use {fps} output frames per second. Each edit is undoable.</Typography>
  </Box>;
}
