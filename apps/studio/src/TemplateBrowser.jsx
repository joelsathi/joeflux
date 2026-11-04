import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, ButtonBase, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Slider, TextField, Typography } from '@wso2/oxygen-ui';
import { ArrowRight, Sparkles } from '@wso2/oxygen-ui-icons-react';
import { createSceneRenderer } from '../../../packages/renderer/src/browser-scene.js';
import { instantiateTemplate } from '../../../packages/presets/src/template-instance.js';
import { pluginCapabilities } from '../../../packages/animation-plugins/src/catalog.js';
import { THEME_OPTIONS } from '../../../packages/presets/src/themes.js';
import { callTool, uniqueId } from './api.js';
import { DeclaredControls } from './DeclaredControls.jsx';
import { useStudio } from './studio-context.jsx';

function TemplatePreview({ project, scene, poster, detail = false, inputError, onError }) {
  const canvas = useRef(null), [hover, setHover] = useState(false), [status, setStatus] = useState({});
  const identity = JSON.stringify([project.output, project.assets, project.theme, project.brand]);
  const sceneKey = JSON.stringify(scene), key = `${identity}:${sceneKey}`;
  const width = detail ? 480 : 240;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const render = useMemo(() => createSceneRenderer({ ...project, output: { ...project.output, width, height: Math.round(width * project.output.height / project.output.width) } }, { assetBase: '/project-assets', frameEndpoint: '/project-assets/source-frame' }), [identity, width]);
  useEffect(() => () => { void render.dispose(); }, [render]);
  useEffect(() => {
    setStatus({ key }); onError?.(null);
    if (!scene || inputError || !canvas.current || (poster && !hover && !detail)) return undefined;
    let live = true, timer, frame = hover ? 0 : Math.round((scene.durationFrames - 1) * .55);
    const tick = async () => {
      try {
        await render(canvas.current, scene, frame, { isCurrent: () => live });
        if (!live) return;
        setStatus({ key, ready: true });
        if (hover) {
          frame = (frame + Math.max(1, Math.round(project.output.fps / 12))) % scene.durationFrames;
          timer = setTimeout(tick, 83);
        }
      } catch (error) {
        if (!live) return;
        setStatus({ key, error: error.message }); onError?.(error.message);
      }
    };
    void tick();
    return () => { live = false; clearTimeout(timer); };
  }, [render, key, scene, hover, poster, detail, inputError, onError, project.output.fps]);
  const error = inputError || (status.key === key ? status.error : null);
  const ready = status.key === key && status.ready && !error;
  return <>
    <Box className="template-preview" sx={{ aspectRatio: project.output.width / project.output.height, '& [data-spatial-stage]': { visibility: ready ? 'visible' : 'hidden' }, '& [data-spatial-stage] canvas': { opacity: 1 } }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {poster && !detail ? <img src={poster} alt="" /> : <Box className="template-preview-fallback"><Sparkles size={26} /></Box>}
      <canvas ref={canvas} aria-hidden="true" className={ready ? 'is-live' : ''} style={{ visibility: ready ? 'visible' : 'hidden' }} />
    </Box>
    {error && detail && <Alert severity="error" sx={{ my: 1 }}>Preview unavailable: {error}</Alert>}
  </>;
}

export function TemplateBrowser({ open, onClose, insertAt }) {
  const { project, run, select } = useStudio();
  const [templates, setTemplates] = useState([]), [posters, setPosters] = useState({}), [category, setCategory] = useState('All'), [selected, setSelected] = useState(null);
  const [controls, setControls] = useState({});
  const [slots, setSlots] = useState({}), [duration, setDuration] = useState('medium'), [intensity, setIntensity] = useState(1), [theme, setTheme] = useState(''), [color, setColor] = useState(''), [previewFailure, setPreviewFailure] = useState(null), [applying, setApplying] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    callTool('template_list', { preview: true }).then(async (list) => {
      if (!live) return;
      setTemplates(list); setSelected((current) => current && list.some((item) => item.id === current) ? current : list[0]?.id ?? null);
      let cursor = 0;
      await Promise.allSettled(Array.from({ length: Math.min(3, list.length) }, async () => {
        while (live && cursor < list.length) {
          const item = list[cursor++];
          try {
            const poster = await callTool('template_poster', { template: item.id });
            if (live) setPosters((all) => ({ ...all, [item.id]: poster.url }));
          } catch { /* The card keeps its fallback if a source asset is unavailable. */ }
        }
      }));
    }).catch(() => {});
    return () => { live = false; };
  }, [open]);
  const current = templates.find((item) => item.id === selected);
  useEffect(() => {
    if (!current) return;
    setSlots(Object.fromEntries(current.slots.map((slot) => [slot.id, slot.type === 'asset' ? Object.keys(project.assets ?? {})[0] ?? '' : slot.default ?? ''])));
    setControls(Object.fromEntries((current.controls.fields ?? []).map(field => [field.id, field.default ?? field.path.split('.').reduce((part, key) => part?.[key], current.scene)]).filter(([, value]) => value !== undefined && !/\{\{[a-zA-Z][a-zA-Z0-9]*\}\}/.test(value))));
    setDuration('medium'); setIntensity(1); setTheme(''); setColor(current.scene.pluginOptions?.color ?? pluginCapabilities(current.scene.plugin)?.color?.default ?? ''); setPreviewFailure(null);
  }, [current?.id]);
  const detail = useMemo(() => {
    if (!current) return {};
    try { return { scene: instantiateTemplate(current, { slots, controls, duration, intensity, theme: theme || undefined, color: current.scene.plugin ? color : undefined, style: project.style, fps: project.output.fps, assets: project.assets }) }; }
    catch (error) { return { error: error.message }; }
  }, [current, slots, controls, duration, intensity, theme, color, project.style, project.output.fps, project.assets]);
  const categories = ['All', ...new Set(templates.map((item) => item.category))];
  const apply = async () => {
    if (!current || applying || detail.error || previewFailure) return;
    const id = uniqueId(current.id.replace(/[^a-z0-9-]/g, '-'), project.scenes);
    setApplying(true);
    try { await run('template_apply', { template: current.id, id, slots, controls, duration, intensity, theme: theme || undefined, color: current.scene.plugin ? color : undefined, index: insertAt }); select(id); onClose(); }
    catch { /* The shared tool error is displayed by StudioProvider. */ }
    finally { setApplying(false); }
  };
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg" className="template-dialog" aria-labelledby="template-dialog-title">
    <DialogTitle id="template-dialog-title"><Box className="template-dialog-heading"><Sparkles size={20} /><Box><Typography variant="h6">Start with a template</Typography><Typography variant="caption" color="text.secondary">Choose a motion recipe, then make it yours.</Typography></Box></Box></DialogTitle>
    <DialogContent dividers className="template-dialog-content">
      <Box className="template-gallery-pane">
        <Box className="template-category-row">{categories.map((item) => <Chip key={item} label={item} size="small" color={category === item ? 'primary' : 'default'} variant={category === item ? 'filled' : 'outlined'} onClick={() => setCategory(item)} />)}</Box>
        <Box className="template-browser-grid">{templates.filter((item) => category === 'All' || item.category === category).map((item) => <ButtonBase key={item.id} className={`template-browser-card${item.id === selected ? ' is-selected' : ''}`} onClick={() => setSelected(item.id)} aria-label={`Choose ${item.label} template`} aria-pressed={item.id === selected}>
          <TemplatePreview project={project} scene={item.previewScene} poster={posters[item.id]} />
          <Box className="template-card-copy"><Typography variant="subtitle2">{item.label}</Typography><Typography variant="caption" color="text.secondary">{item.description}</Typography></Box>
        </ButtonBase>)}</Box>
      </Box>
      <Box className="template-detail-pane">
        {current && <>
          <Typography variant="overline" color="primary">{current.category}</Typography>
          <Typography variant="h6">{current.label}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{current.description}</Typography>
          <TemplatePreview project={project} scene={detail.scene} detail inputError={detail.error} onError={setPreviewFailure} />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>Your current inputs · hover to play</Typography>
          {current.slots.map((slot) => slot.type === 'asset'
            ? <TextField key={slot.id} select fullWidth size="small" label={slot.label ?? slot.id} value={slots[slot.id] ?? ''} onChange={(event) => setSlots((all) => ({ ...all, [slot.id]: event.target.value }))} sx={{ mb: 1.5 }}>
              {Object.entries(project.assets ?? {}).map(([id, file]) => <MenuItem key={id} value={id}>{id} · {file.split('/').at(-1)}</MenuItem>)}
            </TextField>
            : <TextField key={slot.id} fullWidth size="small" multiline={slot.multiline === true} minRows={slot.multiline ? 3 : undefined} maxRows={slot.multiline ? 8 : undefined} label={slot.label ?? slot.id} value={slots[slot.id] ?? ''} onChange={(event) => setSlots((all) => ({ ...all, [slot.id]: event.target.value }))} inputProps={{ maxLength: slot.maxLength }} helperText={`${(slots[slot.id] ?? '').length}/${slot.maxLength}`} sx={{ mb: 1 }} />)}
          <Typography variant="caption" color="text.secondary">Duration</Typography>
          <Box className="template-duration-row">{Object.entries(current.controls.durations).map(([key, seconds]) => <Chip key={key} label={`${key} · ${seconds}s`} size="small" color={duration === key ? 'primary' : 'default'} variant={duration === key ? 'filled' : 'outlined'} onClick={() => setDuration(key)} />)}</Box>
          {current.controls.intensity && <><Typography variant="caption" color="text.secondary">Move intensity · {Math.round(intensity * 100)}%</Typography><Slider value={intensity} min={.5} max={1.5} step={.05} onChange={(_, value) => setIntensity(value)} aria-label="Template intensity" /></>}
          <DeclaredControls fields={current.controls.fields} values={controls} assets={project.assets} onChange={(id, value) => setControls(current => ({ ...current, [id]: value }))} />
          {pluginCapabilities(current.scene.plugin)?.color && !current.controls.fields?.some(field => field.path === 'pluginOptions.color') && <TextField fullWidth size="small" label="Template color" value={color} onChange={event => setColor(event.target.value)} error={!/^#[0-9a-f]{6}$/i.test(color)} sx={{ mt: 1.5 }} />}
          {!current.scene.plugin && current.scene.kind !== 'composition' && <TextField select fullWidth size="small" label="Theme" value={theme} onChange={(event) => setTheme(event.target.value)} sx={{ mt: 1.5 }}><MenuItem value="">Project default</MenuItem>{THEME_OPTIONS.filter((item) => !item.id.startsWith('background-')).map((item) => <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}</TextField>}
        </>}
      </Box>
    </DialogContent>
    <DialogActions><Button onClick={onClose}>Cancel</Button><Button variant="contained" endIcon={<ArrowRight size={16} />} onClick={apply} disabled={!current || applying || !!detail.error || !!previewFailure || current.slots.some((slot) => slot.required && !slots[slot.id])}>{applying ? 'Adding…' : 'Add shot'}</Button></DialogActions>
  </Dialog>;
}
