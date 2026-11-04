import { useEffect } from 'react';
import { Alert, Box, CircularProgress, Snackbar, Typography } from '@wso2/oxygen-ui';
import { useStudio } from './studio-context.jsx';
import { TopBar } from './TopBar.jsx';
import { Stage } from './Stage.jsx';
import { ShotStrip } from './ShotStrip.jsx';
import { Inspector } from './Inspector.jsx';
import { ChatPanel } from './ChatPanel.jsx';

export function Studio() {
  const { project, notice, setNotice, loadError, history, run } = useStudio();
  useEffect(() => {
    const onKey = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z' || event.target.closest('input, textarea, [contenteditable]')) return;
      event.preventDefault();
      // Guard by the entry shown, so a change that lands meanwhile is not undone instead.
      const redo = event.shiftKey, entry = history.entries[redo ? history.cursor : history.cursor - 1];
      if (entry) run(redo ? 'history_redo' : 'history_undo', { entryId: entry.id }).catch(() => {});
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history, run]);
  if (!project) return (
    <Box className="studio-loading">{loadError ? <Alert severity="error">{loadError}</Alert> : <><CircularProgress size={28} /><Typography color="text.secondary">Opening project…</Typography></>}</Box>
  );
  return (
    <Box className="studio">
      <TopBar />
      <ChatPanel />
      <Stage />
      <ShotStrip />
      <Inspector />
      <Snackbar open={Boolean(notice)} autoHideDuration={notice?.severity === 'error' ? 8000 : 3000} onClose={() => setNotice(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {notice ? <Alert severity={notice.severity} onClose={() => setNotice(null)} variant="filled" sx={{ maxWidth: 560 }}>
          {notice.message}{notice.issues?.length ? <Box component="ul" sx={{ m: 0, pl: 2 }}>{notice.issues.slice(0, 4).map((issue) => <li key={issue}>{issue}</li>)}</Box> : null}
        </Alert> : <span />}
      </Snackbar>
    </Box>
  );
}
