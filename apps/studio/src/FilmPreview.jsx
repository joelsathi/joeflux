import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Slider, Typography } from '@wso2/oxygen-ui';
import { callTool, sceneLabel } from './api.js';
import { useStudio } from './studio-context.jsx';

export function FilmPreview({ open, onClose, fromId = null }) {
  const { project, jobs } = useStudio();
  const video = useRef(null);
  const [result, setResult] = useState(null), [error, setError] = useState(null), [attempt, retry] = useState(0), [job, setJob] = useState(null);
  const [dependencyStale, setDependencyStale] = useState(false), [playing, setPlaying] = useState(false), [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController(), id = crypto.randomUUID();
    setResult(null); setError(null); setDependencyStale(false); setPlaying(false); setFrame(0); setJob(id);
    callTool('film_preview', {}, { signal: controller.signal, job: id }).then(value => {
      if (!controller.signal.aborted) { setResult(value); setDependencyStale(value.stale); }
    }, reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [open, attempt]);
  useEffect(() => {
    if (!open || !result) return undefined;
    const controller = new AbortController();
    const check = () => callTool('film_preview_status', { fingerprint: result.fingerprint }, { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted && !value.current) setDependencyStale(true);
    }, () => { if (!controller.signal.aborted) setDependencyStale(true); });
    const id = setInterval(check, 5000);
    window.addEventListener('focus', check);
    check();
    return () => { controller.abort(); clearInterval(id); window.removeEventListener('focus', check); };
  }, [open, result, project.manifestFingerprint]);
  const stale = result && (dependencyStale || Object.entries(result.sources).some(([id, hash]) => project.scenes.find(scene => scene.id === id)?.fingerprint !== hash));
  const active = jobs.get(job), percent = active?.frames ? active.frame / active.frames * 100 : null;
  const start = fromId ? result?.startOffsets[fromId] ?? 0 : 0;
  const seek = next => { if (!video.current || !result) return; video.current.pause(); video.current.currentTime = next / result.fps; setFrame(next); setPlaying(false); };
  const play = () => {
    if (playing) { video.current?.pause(); return; }
    if (video.current?.ended) seek(start);
    video.current?.play().catch(reason => setError(reason.message));
  };
  const seconds = result ? `${(frame / result.fps).toFixed(2)} / ${(result.totalFrames / result.fps).toFixed(2)} s` : '';
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" aria-labelledby="film-preview-title">
    <DialogTitle id="film-preview-title">{fromId ? `Play from ${sceneLabel(project.scenes.find(scene => scene.id === fromId) ?? { id: fromId })}` : 'Play film'}</DialogTitle>
    <DialogContent dividers>
      {!result && !error && <Box role="status" sx={{ py: 4 }}><Typography variant="body2" sx={{ mb: 1.5 }}>Rendering a silent film preview with the saved transitions…</Typography><LinearProgress variant={percent === null ? 'indeterminate' : 'determinate'} value={percent ?? 0} aria-label="Rendering film preview" /></Box>}
      {error && <Alert severity="error" action={<Button color="inherit" onClick={() => retry(value => value + 1)}>Retry</Button>}>{error}</Alert>}
      {stale && <Alert severity="warning" sx={{ mb: 2 }}>The film changed after this preview was rendered. Render again to review the current version.</Alert>}
      {result && <>
        <video ref={video} src={result.url} muted playsInline aria-label="Film review" style={{ width: '100%', aspectRatio: result.width / result.height, background: '#111' }}
          onLoadedMetadata={() => { if (video.current) { video.current.currentTime = start / result.fps; setFrame(start); video.current.play().catch(reason => setError(reason.message)); } }}
          onTimeUpdate={() => setFrame(Math.min(result.totalFrames - 1, Math.floor((video.current?.currentTime ?? 0) * result.fps)))}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => setError('The film preview could not be played. Render again to retry.')} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
          <Button onClick={play} aria-label={playing ? 'Pause film' : 'Resume film'}>{playing ? 'Pause' : 'Play'}</Button>
          <Button onClick={() => seek(start)}>Back to review start</Button>
          <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>{seconds}</Typography>
          <Slider size="small" aria-label="Scrub film" min={0} max={Math.max(1, result.totalFrames - 1)} value={frame} onChange={(_, next) => seek(next)} />
        </Box>
        <Typography variant="caption" color="text.secondary">{result.totalFrames} frames · {result.width}×{result.height} review · Actual transition overlaps. Playback remains unreviewed until you inspect it.</Typography>
      </>}
    </DialogContent>
    <DialogActions><Button disabled={!result && !error} onClick={() => retry(value => value + 1)}>Render again</Button><Button onClick={onClose}>{result || error ? 'Close' : 'Cancel'}</Button></DialogActions>
  </Dialog>;
}
