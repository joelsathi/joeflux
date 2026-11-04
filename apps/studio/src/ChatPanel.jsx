import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, ButtonBase, Chip, CircularProgress, Collapse, IconButton, MenuItem, TextField, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ArrowUp, Camera, Check, CircleAlert, Eye, Film, LogIn, MessageSquarePlus, MonitorPlay, Pencil, Plus, Sparkles, Square, Terminal, Trash2, Undo2 } from '@wso2/oxygen-ui-icons-react';
import { apiFetch, postEvents, sceneKind, sceneLabel, seconds } from './api.js';
import { useStudio } from './studio-context.jsx';
import { GuidePanel } from './GuidePanel.jsx';
import { DesktopConnections } from './DesktopConnections.jsx';

const TOOL = {
  project_get: ['Read the project', Eye], scene_get: ['Read a shot', Eye], catalog: ['Checked the options', Eye], toolset_enable: ['Loaded more tools', Eye], validate: ['Validated', Check],
  camera_set_shots: ['Set the camera path', Camera], camera_apply_move: ['Applied a camera move', Camera], screen_set: ['Restyled the screen', MonitorPlay],
  scene_update: ['Edited a shot', Pencil], scene_replace: ['Saved a shot', Pencil], scene_create: ['Added a shot', Plus], scene_duplicate: ['Duplicated a shot', Plus],
  scene_delete: ['Deleted a shot', Trash2], scene_reorder: ['Reordered shots', Pencil], project_update: ['Updated the project', Pencil],
  history_undo: ['Undid a change', Undo2], history_redo: ['Redid a change', Undo2], render_frame: ['Looked at a frame', Eye], render_scene: ['Rendered', Film], assemble: ['Assembled the video', Film],
  skill_list: ['Checked guidance', Eye], skill_get: ['Read guidance', Eye], brand_kit_list: ['Checked brand kits', Eye], brand_kit_get: ['Read the brand guidelines', Eye], brand_bookend_apply: ['Set an intro or outro', Film],
  quality_review: ['Checked frames and heuristics', Eye], variation_generate: ['Rendered preset looks', Sparkles], transition_preview: ['Previewed a transition', Film],
};
const SUGGESTIONS = ['Help me shape the story', 'Suggest better animation for this shot', 'Review the current cut'];
const VENDOR = { claude: { action: 'Sign in with Claude', install: 'npm install -g @anthropic-ai/claude-code' }, codex: { action: 'Sign in with ChatGPT', install: 'npm install -g @openai/codex' }, copilot: { action: 'Sign in with GitHub Copilot', install: 'npm install -g @github/copilot' } };
const linkify = (text) => text.split(/(https?:\/\/\S+)/g).map((part, index) => /^https?:/.test(part) ? <a key={index} href={part} target="_blank" rel="noreferrer">{part}</a> : part);

// Mutating tools return _change: a summary, readable details and the history entry id.
const changeOf = (part) => {
  try { const change = part.ok ? JSON.parse(part.text)?._change : null; return typeof change?.id === 'string' && Array.isArray(change.details) ? change : null; } catch { return null; }
};

function ChangeSummary({ change }) {
  const { history, run } = useStudio(), [busy, setBusy] = useState(false);
  const index = history.entries.findIndex((entry) => entry.id === change.id);
  const undo = () => { setBusy(true); run('history_undo', { entryId: change.id }).catch(() => {}).finally(() => setBusy(false)); };
  const state = index < 0 ? null : index === history.cursor - 1 ? 'latest' : index >= history.cursor ? 'undone' : 'earlier';
  return (
    <Box className="change-summary">
      <Typography variant="caption" sx={{ fontWeight: 600 }}>{change.summary}</Typography>
      <Box component="ul">{change.details.slice(0, 4).map((detail) => <li key={detail}>{detail}</li>)}{change.details.length > 4 && <li>…{change.details.length - 4} more</li>}</Box>
      {state === 'latest' && <Button size="small" startIcon={<Undo2 size={14} />} disabled={busy} onClick={undo}>Undo this change</Button>}
      {state === 'undone' && <Typography variant="caption" color="text.secondary">Undone</Typography>}
      {state === 'earlier' && <Typography variant="caption" color="text.secondary">Later changes follow. Undo those first.</Typography>}
    </Box>
  );
}

function ToolCard({ part }) {
  const [open, setOpen] = useState(false), [label, Icon] = TOOL[part.name] ?? [part.name.replaceAll('_', ' '), Terminal], change = changeOf(part);
  const status = part.ok === undefined ? <CircularProgress size={12} aria-label="Running" /> : part.ok ? <Check size={14} className="ok" aria-label="Done" /> : <CircleAlert size={14} className="fail" aria-label="Failed" />;
  return (
    <Box className={`tool-card${part.ok === false ? ' is-failed' : ''}`}>
      <ButtonBase className="tool-card-head" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <Icon size={14} aria-hidden="true" /><Typography variant="caption" sx={{ flex: 1, textAlign: 'left', fontWeight: 500 }}>{label}{part.input?.id ? ` · ${part.input.id}` : ''}</Typography>{status}
      </ButtonBase>
      {change && <ChangeSummary change={change} />}
      <Collapse in={open}><Box component="pre" className="tool-card-body">{JSON.stringify(part.input ?? {}, null, 2)}{part.text ? `\n\n${part.text.slice(0, 1200)}` : ''}</Box></Collapse>
    </Box>
  );
}

function SignIn({ agents, agent, onDone }) {
  const [lines, setLines] = useState([]), [busy, setBusy] = useState(null);
  const login = async (id) => {
    setBusy(id); setLines([]);
    try { for await (const event of postEvents(`/api/agents/${id}/login`)) if (event.type === 'text' || event.type === 'error') setLines((all) => [...all, event.text ?? event.message]); }
    catch (error) { setLines((all) => [...all, error.message]); }
    setBusy(null); onDone();
  };
  return (
    <Box className="sign-in">
      <Box className="sign-in-mark"><Sparkles size={24} /></Box>
      <Typography variant="h6" sx={{ fontWeight: 600 }}>Connect your AI director</Typography>
      <Typography variant="body2" color="text.secondary">Sign in through your installed CLI using an eligible account. Authentication and subscription eligibility are managed by the provider.</Typography>
      <Box className="sign-in-actions">
        {agents.filter((item) => VENDOR[item.id]).map((item) => item.available
          ? <Button key={item.id} fullWidth variant={item.id === agent ? 'contained' : 'outlined'} startIcon={busy === item.id ? <CircularProgress size={14} color="inherit" /> : item.signedIn ? <Check size={16} /> : <LogIn size={16} />} disabled={Boolean(busy) || item.signedIn} onClick={() => login(item.id)}>{item.signedIn ? `${item.label} connected` : VENDOR[item.id].action}</Button>
          : <Box key={item.id} className="install-hint"><Typography variant="caption" color="text.secondary">{item.label} isn't installed. Install it with</Typography><code>{VENDOR[item.id].install}</code></Box>)}
      </Box>
      {lines.length > 0 && <Box className="sign-in-log" role="log">{lines.map((line, index) => <div key={index}>{linkify(line)}</div>)}</Box>}
    </Box>
  );
}

export function ChatPanel() {
  const { project, scene } = useStudio();
  const [agents, setAgents] = useState(null), [agent, setAgent] = useState(() => { try { return localStorage.getItem('studio-agent'); } catch { return null; } });
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [messages, setMessages] = useState([]), [input, setInput] = useState(''), [running, setRunning] = useState(null), [sessions, setSessions] = useState({});
  const listRef = useRef(null);
  const loadAgents = (refresh) => apiFetch(`/api/agents${refresh ? '?refresh' : ''}`).then((response) => response.json()).then((list) => {
    setAgents(list);
    setAgent((current) => list.some((item) => item.id === current && item.available) ? current : (list.find((item) => item.available && item.signedIn !== false) ?? list.find((item) => item.available) ?? list[0])?.id);
  }).catch(() => setAgents([]));
  useEffect(() => { loadAgents(false); }, []);
  useEffect(() => { try { if (agent) localStorage.setItem('studio-agent', agent); } catch { /* per-browser convenience only */ } }, [agent]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);
  const desktop = agents?.some(item => item.connection?.desktop);
  const current = agents?.find((item) => item.id === agent), ready = current?.available && current.signedIn !== false;
  const updateLast = (change) => setMessages((all) => [...all.slice(0, -1), change(all.at(-1))]);
  const send = async (text = input) => {
    const prompt = text.trim();
    if (!prompt || running || !ready) return;
    const controller = new AbortController();
    setInput(''); setRunning(controller);
    setMessages((all) => [...all, { role: 'user', text: prompt }, { role: 'assistant', parts: [] }]);
    const context = `${scene ? `The user is looking at shot "${scene.id}" (${sceneKind(scene)}, ${seconds(scene.durationFrames, project.output.fps)}) in project "${project.name}".` : `Project "${project.name}".`} Resume the persistent general brief using brief_get.`;
    try {
      for await (const event of postEvents('/api/chat', { agent, prompt, context, session: sessions[agent] }, controller.signal)) {
        if (event.type === 'session') setSessions((all) => ({ ...all, [agent]: event.id }));
        else if (event.type === 'text') updateLast((message) => ({ ...message, parts: [...message.parts, { type: 'text', text: event.text }] }));
        else if (event.type === 'tool_call') updateLast((message) => ({ ...message, parts: [...message.parts, { ...event, type: 'tool' }] }));
        else if (event.type === 'tool_result') updateLast((message) => ({ ...message, parts: message.parts.map((part) => part.id === event.id ? { ...part, ok: event.ok, text: event.text } : part) }));
        else if (event.type === 'error') updateLast((message) => ({ ...message, parts: [...message.parts, { type: 'error', text: event.message }] }));
      }
    } catch (error) {
      if (error.name !== 'AbortError') updateLast((message) => ({ ...message, parts: [...message.parts, { type: 'error', text: error.message }] }));
    }
    updateLast((message) => ({ ...message, done: true, stopped: controller.signal.aborted }));
    setRunning(null);
    void loadAgents(true);
  };
  return (
    <Box component="aside" className="chat" aria-label="Director chat">
      <Box className="panel-head">
        <Sparkles size={18} className={running ? 'is-working' : undefined} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600, flex: 1 }}>Director</Typography>
        {agents?.length > 0 && <TextField select size="small" value={agent ?? ''} onChange={(event) => setAgent(event.target.value)} className="agent-select" slotProps={{ htmlInput: { 'aria-label': 'AI agent' } }}>
          {agents.map((item) => <MenuItem key={item.id} value={item.id} disabled={!item.available}><Box component="span" className={`status-dot${item.available && item.signedIn !== false ? ' is-on' : ''}`} />{item.label}</MenuItem>)}
        </TextField>}
        {desktop && <Button size="small" disabled={Boolean(running)} onClick={() => setConnectionsOpen(value => !value)}>Connections</Button>}
        <Tooltip title="New conversation"><span><IconButton size="small" aria-label="New conversation" disabled={Boolean(running) || !messages.length} onClick={() => { setMessages([]); setSessions((all) => ({ ...all, [agent]: undefined })); }}><MessageSquarePlus size={16} /></IconButton></span></Tooltip>
      </Box>
      {(!desktop || ready && !connectionsOpen) && <GuidePanel onPrompt={send} ready={ready} />}
      {agents === null ? <Box className="chat-empty"><CircularProgress size={20} /></Box>
        : desktop && (!ready || connectionsOpen) ? <DesktopConnections agents={agents} onRefresh={() => loadAgents(true)} onClose={ready ? () => setConnectionsOpen(false) : undefined} />
        : !ready ? <SignIn agents={agents} agent={agent} onDone={() => loadAgents(true)} />
          : <Box className="chat-list" ref={listRef} role="log" aria-live="polite">
            {!messages.length && <Box className="chat-empty">
              <Box className="chat-welcome-mark"><Sparkles size={22} /></Box>
              <Typography variant="h6" className="chat-welcome-title">Let’s build your video</Typography>
              <Typography variant="body2" color="text.secondary">Start with the brief above. Tell me what viewers should understand and what visible evidence supports it.</Typography>
              <Typography variant="overline" color="text.secondary" sx={{ mt: 1 }}>Try a direction</Typography>
              <Box className="suggestions">{SUGGESTIONS.map((text) => <Chip key={text} label={text} variant="outlined" onClick={() => send(text)} className="suggestion" />)}</Box>
            </Box>}
            {messages.map((message, index) => message.role === 'user'
              ? <Box key={index} className="bubble is-user"><Typography variant="body2">{message.text}</Typography></Box>
              : <Box key={index} className="bubble is-agent">
                <Box className="assistant-byline"><Box className="assistant-avatar"><Sparkles size={13} /></Box><Typography variant="caption" sx={{ fontWeight: 700 }}>{current?.label ?? 'Director'}</Typography><Typography variant="caption" color="text.secondary">· {message.done ? 'Ready' : 'Working'}</Typography></Box>
                <Box className="assistant-body">
                {message.parts.map((part, item) => part.type === 'tool' ? <ToolCard key={item} part={part} />
                  : part.type === 'error' ? <Alert key={item} severity="error" variant="outlined" sx={{ py: 0 }}>{part.text}</Alert>
                    : <Typography key={item} variant="body2" className="agent-text">{part.text}</Typography>)}
                {!message.done && <Box className="thinking"><CircularProgress size={12} /><Typography variant="caption" color="text.secondary">{current?.label ?? 'Agent'} is working…</Typography></Box>}
                {message.stopped && <Typography variant="caption" color="text.secondary">Stopped.</Typography>}
                </Box>
              </Box>)}
          </Box>}
      <Box component="form" className="composer" onSubmit={(event) => { event.preventDefault(); send(); }}>
        <Box className="composer-main"><Box className="composer-context"><span className="composer-context-dot" /><Typography variant="caption" noWrap>{scene ? `Working on ${sceneLabel(scene)}` : 'Project direction'}</Typography></Box>
        <TextField multiline maxRows={6} fullWidth size="small" placeholder={ready ? `Direct ${scene ? `“${sceneLabel(scene)}”` : 'the video'}…` : 'Sign in to start directing'} disabled={!ready} value={input} onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} slotProps={{ htmlInput: { 'aria-label': 'Message the director' } }} />
        </Box>
        {running
          ? <Tooltip title="Stop"><IconButton aria-label="Stop" onClick={() => running.abort()} className="send-button"><Square size={16} /></IconButton></Tooltip>
          : <Tooltip title="Send (Enter)"><span><IconButton type="submit" aria-label="Send" disabled={!ready || !input.trim()} className="send-button is-primary"><ArrowUp size={18} /></IconButton></span></Tooltip>}
      </Box>
    </Box>
  );
}
