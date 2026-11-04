import { useEffect, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Typography } from '@wso2/oxygen-ui';
import { Film } from '@wso2/oxygen-ui-icons-react';
import { callTool, sceneLabel } from './api.js';
import { useStudio } from './studio-context.jsx';

const name = (type) => type.replaceAll('-', ' ').replace(/^./, (letter) => letter.toUpperCase());
const secs = (frames, fps) => `${(frames / fps).toFixed(2).replace(/\.?0+$/, '')} s`;

// Renders the boundary through the export's own FFmpeg transition, so the overlap is exact.
export function TransitionPreview({ open, onClose, scene, next }) {
  const { project, jobs } = useStudio();
  const [result, setResult] = useState(null), [error, setError] = useState(null), [attempt, retry] = useState(0), [job, setJob] = useState(null);
  useEffect(() => {
    if (!open) return undefined;
    // Closing the dialog or rendering again cancels this render on the server.
    const controller = new AbortController(), id = crypto.randomUUID();
    setResult(null); setError(null); setJob(id);
    const live = () => !controller.signal.aborted;
    callTool('transition_preview', { id: scene.id }, { signal: controller.signal, job: id }).then((value) => { if (live()) setResult(value); }, (reason) => { if (live()) setError(reason.message); });
    return () => controller.abort();
  }, [open, scene.id, attempt]);
  const fps = result?.fps ?? project.output.fps, active = jobs.get(job);
  // Any change to the shots it was rendered from, or to their order, makes the clip out of date.
  const stale = result && (result.manifestFingerprint !== project.manifestFingerprint || result.next !== next?.id || Object.entries(result.sources).some(([id, fingerprint]) => project.scenes.find((item) => item.id === id)?.fingerprint !== fingerprint));
  const percent = active?.frames ? active.frame / active.frames * 100 : null;
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" className="variation-dialog" aria-labelledby="transition-title">
    <DialogTitle id="transition-title"><Box className="template-dialog-heading"><Film size={20} /><Box><Typography variant="h6">Transition preview</Typography><Typography variant="caption" color="text.secondary">{sceneLabel(scene)} → {next ? sceneLabel(next) : 'end'}</Typography></Box></Box></DialogTitle>
    <DialogContent dividers>
      {!result && !error && <Box role="status" sx={{ py: 4 }}><Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Rendering the boundary with the export transition…</Typography><LinearProgress variant={percent === null ? 'indeterminate' : 'determinate'} value={percent ?? 0} aria-label="Rendering transition preview" /></Box>}
      {error && <Alert severity="error" action={<Button color="inherit" onClick={() => retry((value) => value + 1)}>Retry</Button>}>{error}</Alert>}
      {stale && <Alert severity="warning" sx={{ mb: 2 }}>These shots changed after this preview was rendered. Render it again to check the current version.</Alert>}
      {result && <>
        <video className="transition-video" style={{ '--ar': result.width / result.height }} src={result.url} controls autoPlay loop muted playsInline aria-label={`Transition from ${sceneLabel(scene)} to ${next ? sceneLabel(next) : 'the end'}`} />
        <Typography variant="body2" sx={{ mt: 1.5 }}>{result.transition === 'cut' ? `A cut at ${secs(result.startFrame, fps)}.` : `${name(result.transition)} over ${result.overlapFrames} frames (${secs(result.overlapFrames, fps)}), starting at ${secs(result.startFrame, fps)}.`}</Typography>
        <Typography variant="caption" color="text.secondary" className="hint">Joined by the same FFmpeg transition as the final export, with up to a second of each shot around it. The overlap shortens the video by the transition length.</Typography>
      </>}
    </DialogContent>
    <DialogActions><Button onClick={() => retry((value) => value + 1)} disabled={!result && !error}>Render again</Button><Button onClick={onClose}>Close</Button></DialogActions>
  </Dialog>;
}
