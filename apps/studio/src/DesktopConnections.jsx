import { useEffect, useState } from 'react';
import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, TextField, Typography } from '@wso2/oxygen-ui';
import { apiFetch } from './api.js';

const PROVIDERS = {
  claude: { signIn: 'Sign in with Claude', keys: 'https://platform.claude.com/settings/keys' },
  codex: { signIn: 'Sign in with ChatGPT', keys: 'https://platform.openai.com/api-keys' },
};

export function DesktopConnections({ agents, onRefresh, onClose }) {
  const [busy, setBusy] = useState(null), [notice, setNotice] = useState(null), [editing, setEditing] = useState(null), [key, setKey] = useState(''), [remember, setRemember] = useState(false);
  const pending = agents.some(item => item.connection?.task?.state === 'running');
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(onRefresh, 4000);
    return () => clearTimeout(timer);
  }, [agents, pending, onRefresh]);
  const perform = async (id, action, body = {}) => {
    setBusy(id); setNotice(null);
    try {
      const response = await apiFetch(`/api/connections/${id}/${action}`, { body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Setup failed. Try again.');
      if (action === 'save-key') { setKey(''); setEditing(null); }
      setNotice({ severity: 'info', text: result.cancelled ? action === 'install' ? 'Installation cancelled. Nothing was installed.' : 'Connection cancelled.' : result.started ? 'Continue in Terminal. Sign-in opens the provider’s browser page. Return here when finished.' : action === 'approve-cli' ? 'CLI account connected for this session.' : action === 'save-key' ? 'API key configured. The provider will validate it on your first request.' : 'API key removed. Confirm your CLI account to use it.' });
      await onRefresh();
    } catch (error) { setNotice({ severity: 'error', text: error.message }); }
    finally { setBusy(null); }
  };
  return <Box className="sign-in desktop-connections" style={{ justifyContent: 'flex-start', minHeight: 0 }}>
    <Typography variant="h6">Connect your AI director</Typography>
    <Typography variant="body2" color="text.secondary">Choose a provider. We’ll help install its CLI, then open its official sign-in. An eligible account or API key is required.</Typography>
    {notice && <Alert severity={notice.severity}>{notice.text}</Alert>}
    {agents.filter(item => PROVIDERS[item.id]).map(item => {
      const connection = item.connection ?? {}, vendor = PROVIDERS[item.id], task = connection.task;
      return <Box key={item.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography variant="subtitle2">{item.label}</Typography>
        <Typography variant="caption" color="text.secondary">{!item.available ? 'CLI not installed' : connection.keyConfigured ? `API key configured · ${connection.keyStorage === 'keychain' ? 'saved with Keychain encryption' : 'this session only'} · validated on first request` : item.cliSignedIn ? `${connection.cliApproved ? 'Connected' : 'Ready to connect'} using CLI account${item.account ? ` · ${item.account}` : ''}` : 'Installed · sign-in required'}</Typography>
        {item.id === 'claude' && <Typography variant="caption" color="text.secondary">Claude Desktop alone is not enough. Claude Code is installed separately. Claude controls which plans and third-party uses are eligible.</Typography>}
        {connection.keyError && <Alert severity="error">{connection.keyError}</Alert>}
        {item.available && item.cliSignedIn && !connection.cliApproved && !connection.keyConfigured && <Button variant="contained" disabled={Boolean(busy) || ['running', 'timed-out'].includes(task?.state)} onClick={() => perform(item.id, 'approve-cli')}>Use this {item.label} account</Button>}
        {!item.available
          ? <Button variant="contained" disabled={Boolean(busy) || task?.state === 'running'} onClick={() => perform(item.id, 'install')}>Install {item.label}</Button>
          : !connection.keyConfigured && <Button variant={item.cliSignedIn ? 'outlined' : 'contained'} disabled={Boolean(busy) || task?.state === 'running'} onClick={() => perform(item.id, 'login')}>{item.cliSignedIn ? `Change ${item.label} account` : vendor.signIn}</Button>}
        {item.available && item.id === 'codex' && !connection.keyConfigured && !item.cliSignedIn && <Button size="small" disabled={Boolean(busy) || task?.state === 'running'} onClick={() => perform(item.id, 'device-login')}>Use a device code instead</Button>}
        {task && <Typography role="status" variant="caption">{task.state === 'running' ? `${task.action === 'install' ? 'Installation' : 'Sign-in'} is open in Terminal. Follow its prompts, then check again.` : task.state === 'completed' ? 'Terminal finished. Check your connection status below.' : 'Setup did not finish or timed out. Check Terminal for details, then retry.'}</Typography>}
        {busy === item.id && <CircularProgress size={18} aria-label="Setting up connection" />}
        {connection.keyConfigured || connection.keyError
          ? <Button size="small" disabled={Boolean(busy)} onClick={() => perform(item.id, 'remove-key')}>Remove {item.label} API key</Button>
          : editing !== item.id && <Button size="small" disabled={Boolean(busy)} onClick={() => { setEditing(item.id); setKey(''); setRemember(false); }}>Use {item.label} API key</Button>}
        {editing === item.id && <Box component="form" onSubmit={event => { event.preventDefault(); perform(item.id, 'save-key', { key, remember }); }} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Alert severity="info">API usage is billed separately from your subscription. The app never switches to paid API usage automatically.</Alert>
          <Button component="a" href={vendor.keys} target="_blank" rel="noreferrer" size="small">Get a {item.label} API key</Button>
          <TextField type="password" label={`${item.label} API key`} size="small" autoComplete="off" value={key} onChange={event => setKey(event.target.value)} />
          <FormControlLabel control={<Checkbox size="small" checked={remember} disabled={!connection.canRememberKey} onChange={event => setRemember(event.target.checked)} />} label={<Typography variant="caption">Remember securely on this Mac</Typography>} />
          <Typography variant="caption" color="text.secondary">{connection.canRememberKey ? 'Unchecked: kept in memory until you quit the app.' : 'Keychain is unavailable. The key can only be used for this session.'}{!item.available ? ' You’ll still need to install the CLI.' : ''}</Typography>
          <Button type="submit" variant="contained" disabled={Boolean(busy) || !key.trim()}>Save {item.label} API key</Button>
          <Button size="small" disabled={Boolean(busy)} onClick={() => { setKey(''); setEditing(null); }}>Cancel</Button>
        </Box>}
      </Box>;
    })}
    <Button disabled={Boolean(busy)} onClick={onRefresh}>Check again</Button>
    {onClose && <Button onClick={onClose}>Back to director</Button>}
  </Box>;
}
