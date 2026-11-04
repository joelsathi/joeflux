import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@wso2/oxygen-ui';
import { Sparkles } from '@wso2/oxygen-ui-icons-react';
import { callTool } from './api.js';
import { useStudio } from './studio-context.jsx';

const HINTS = { original: 'Your current composition', cinematic: 'Dark theme, cinematic grade, soft focus and glow', editorial: 'Light theme, neutral grade and a spotlight', warm: 'Warm orange accent', cool: 'Cool violet accent', mint: 'Fresh mint accent' };

export function VariationDialog({ open, onClose, scene }) {
  const { run } = useStudio();
  const [variants, setVariants] = useState([]), [busy, setBusy] = useState(false);
  const [error, setError] = useState(null), [loading, setLoading] = useState(false), [attempt, retry] = useState(0);
  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    setVariants([]); setError(null); setLoading(true);
    callTool('variation_generate', { id: scene.id }).then((items) => {
      if (!live) return;
      if (!items.length) throw new Error('No looks were returned. Try again.');
      setVariants(items);
    }).catch((reason) => { if (live) setError(reason.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [open, scene.id, attempt]);
  // Looks are whole-scene snapshots: once the shot changes, applying one would discard that edit.
  const stale = variants.length > 0 && scene.fingerprint !== variants[0].baseFingerprint;
  const pick = async (variant) => {
    setBusy(true);
    try { await run('scene_replace', { id: scene.id, scene: variant.scene, fingerprint: variant.baseFingerprint }); onClose(); }
    catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  };
  const refresh = <Button color="inherit" onClick={() => retry((value) => value + 1)}>{variants.length ? 'Refresh looks' : 'Retry'}</Button>;
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" className="variation-dialog" aria-labelledby="variation-title">
    <DialogTitle id="variation-title"><Box className="template-dialog-heading"><Sparkles size={20} /><Box><Typography variant="h6">Explore directions</Typography><Typography variant="caption" color="text.secondary">Directions rendered from this shot. Choose one to apply.</Typography></Box></Box></DialogTitle>
    <DialogContent dividers>
      {stale && <Alert severity="warning" sx={{ mb: 2 }} action={refresh}>This shot changed after these looks were rendered. Refresh them to keep that change.</Alert>}
      <Box className="variation-grid">{variants.map((variant) => <Button key={variant.id} className="variation-card" onClick={() => pick(variant)} disabled={busy || stale}>
        <img src={variant.url} alt={`${variant.label} poster`} /><Box><Typography variant="subtitle2">{variant.label}</Typography><Typography variant="caption" color="text.secondary">{HINTS[variant.id]}</Typography></Box>
      </Button>)}</Box>
      {loading && <Box sx={{ py: 5, display: 'flex', gap: 1.5, justifyContent: 'center', alignItems: 'center' }} role="status"><CircularProgress size={16} /><Typography variant="body2" color="text.secondary">Rendering directions…</Typography></Box>}
      {error && <Alert severity="error" sx={{ mt: 2 }} action={refresh}>{error}</Alert>}
    </DialogContent>
    <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
  </Dialog>;
}
