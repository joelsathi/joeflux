import { useState } from 'react';
import { Box, Button, Divider, IconButton, LinearProgress, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Clapperboard, Download, Film, Grid2x2, Layers, Redo2, Undo2 } from '@wso2/oxygen-ui-icons-react';
import { FilmPreview } from './FilmPreview.jsx';
import { useStudio } from './studio-context.jsx';

export function TopBar() {
  const { project, selectedId, history, run, progress: renderProgress, setNotice } = useStudio();
  const [filmOpen, setFilmOpen] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const [actionProgress, setActionProgress] = useState(null);
  const progress = renderProgress ?? actionProgress;
  const total = project.scenes.reduce((sum, scene, index) => sum + scene.durationFrames - (index < project.scenes.length - 1 && scene.transition?.type && scene.transition.type !== 'cut' ? scene.transition.frames : 0), 0), { width, height, fps } = project.output;
  const last = history.entries[history.cursor - 1], next = history.entries[history.cursor];
  const exportAction = async (label, name, input) => {
    setAnchor(null); setActionProgress({ label });
    try { const result = await run(name, input); setNotice({ severity: 'success', message: `${label} finished${result?.outputPath ? `: ${result.outputPath}` : ''}.` }); }
    catch { /* reported by run */ } finally { setActionProgress(null); }
  };
  const percent = progress?.frames ? (progress.frame / progress.frames) * 100 : null;
  return (
    <><Box component="header" className="topbar">
      <Box className="brand">
        <Box className="brand-mark"><Clapperboard size={18} /></Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap sx={{ fontWeight: 600, lineHeight: 1.2 }}>{project.name}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap>{project.scenes.length} shots · {(total / fps).toFixed(1)}s · {width}×{height} · {fps} fps</Typography>
        </Box>
      </Box>
      <Box className="topbar-actions">
        <Button size="small" startIcon={<Film size={16} />} disabled={!project.scenes.length} onClick={() => setFilmOpen(true)}>Play film</Button>
        <Tooltip title={last ? `Undo “${last.summary}” (⌘Z)` : 'Nothing to undo'}><span><IconButton aria-label="Undo" disabled={!last} onClick={() => run('history_undo', { entryId: last.id }).catch(() => {})}><Undo2 size={18} /></IconButton></span></Tooltip>
        <Tooltip title={next ? `Redo “${next.summary}” (⇧⌘Z)` : 'Nothing to redo'}><span><IconButton aria-label="Redo" disabled={!next} onClick={() => run('history_redo', { entryId: next.id }).catch(() => {})}><Redo2 size={18} /></IconButton></span></Tooltip>
        <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
        <Button variant="contained" size="small" startIcon={<Download size={16} />} onClick={(event) => setAnchor(event.currentTarget)} disabled={Boolean(progress)} sx={{ ml: 1 }}>Export</Button>
        <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
          <MenuItem disabled={!selectedId} onClick={() => exportAction('Render shot', 'render_scene', { id: selectedId, force: true })}><ListItemIcon><Film size={16} /></ListItemIcon><ListItemText primary="Render this shot" secondary="Silent MP4 clip" /></MenuItem>
          <MenuItem onClick={() => exportAction('Render all shots', 'render_scene', {})}><ListItemIcon><Layers size={16} /></ListItemIcon><ListItemText primary="Render all shots" secondary="Unchanged shots are reused" /></MenuItem>
          <MenuItem onClick={() => exportAction('Assemble video', 'assemble', {})}><ListItemIcon><Clapperboard size={16} /></ListItemIcon><ListItemText primary="Assemble video" secondary="Join rendered shots" /></MenuItem>
          <MenuItem onClick={() => exportAction('Contact sheet', 'review_contact_sheet', {})}><ListItemIcon><Grid2x2 size={16} /></ListItemIcon><ListItemText primary="Contact sheet" secondary="Review frames, confirm silence" /></MenuItem>
        </Menu>
      </Box>
      {progress && <LinearProgress className="topbar-progress" variant={percent === null ? 'indeterminate' : 'determinate'} value={percent ?? 0} aria-label={progress.label ?? 'Rendering'} />}
    </Box><FilmPreview open={filmOpen} onClose={() => setFilmOpen(false)} /></>
  );
}
