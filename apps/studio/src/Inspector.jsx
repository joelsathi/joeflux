import { CompositionPanel } from './CompositionPanel.jsx';
import { DeclaredControls } from './DeclaredControls.jsx';
import { controlValue } from '../../../packages/presets/src/template-controls.js';
import { SourceMoments } from './SourceMoments.jsx';
import { isVideoAsset } from '../../../packages/renderer/src/source-frames.js';
import { useEffect, useRef, useState } from 'react';
import { ANIMATION_PLUGINS, pluginCapabilities } from '../../../packages/animation-plugins/src/catalog.js';
import { Box, Button, ButtonBase, Chip, FormControlLabel, IconButton, MenuItem, Slider, Switch, Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ArrowDown, ArrowUp, Crosshair, LocateFixed, MonitorPlay, Play, Sparkles, SquareDashed, Trash2, Type } from '@wso2/oxygen-ui-icons-react';
import { cameraAreas, cameraStops, shotsFromStops, reorderStop, removeStop, setStopHold, setFullView } from '../../../packages/motion/src/camera-motion.js';
import { pacing } from './FrameOverlay.jsx';
import { THEME_OPTIONS, resolveTheme } from '../../../packages/presets/src/themes.js';
import { BACKGROUND_STYLES } from '../../../packages/motion/src/background.js';
import { TEXT_TEMPLATES, textTiming, minimumReadingHold } from '../../../packages/motion/src/text-animation.js';
import { sceneKind, sceneLabel } from './api.js';
import { callTool } from './api.js';
import { useStudio } from './studio-context.jsx';
import { FramePicker, FrameTitle } from './ScreenLook.jsx';
import { ScreenMatch } from './ScreenMatch.jsx';
import { MotionBlurPanel } from './MotionBlurPanel.jsx';
import { screenConversionIssue } from '../../../packages/schema/src/migrate.js';
import { TRANSITION_TYPES } from '../../../packages/presets/src/transitions.js';
import { VariationDialog } from './VariationDialog.jsx';
import { TransitionPreview } from './TransitionPreview.jsx';
import { captionReadingFrames, minimumCaptionReadingHold } from '../../../packages/motion/src/screen-caption.js';

const MOVES = [
  { id: 'focus-zoom', label: 'Focus zoom', hint: 'Zoom in, hold, return' },
  { id: 'detail-pan', label: 'Detail pan', hint: 'Glide between two areas' },
  { id: 'orbit', label: 'Orbit', hint: 'Gentle 3D drift' },
  { id: 'tilt-settle', label: 'Tilt & settle', hint: 'Lands from an angle' },
  { id: 'return-full', label: 'Pull back', hint: 'Start close, reveal all' },
];
// A looping diagram of each move: the outer box is the recording, the inner one the camera.
const MoveDiagram = ({ move }) => <Box className={`move-diagram move-${move}`} aria-hidden="true"><Box className="move-screen"><Box className="move-camera" /></Box></Box>;
const EASING = { smootherstep: 'Smooth', gentle: 'Gentle', snappy: 'Snappy', spring: 'Spring', easeInOut: 'Ease in-out', easeOut: 'Ease out', easeIn: 'Ease in', linear: 'Linear' };
const TEXT_LABELS = { 'masked-lines': 'Masked lines', 'word-stagger': 'Word stagger', 'blur-reveal': 'Blur to sharp', 'keyword-highlight': 'Keyword highlight', 'title-sequence': 'Title, then subtitle', typing: 'Typing', 'line-wipe': 'Line wipe', 'scale-pop': 'Scale pop', 'character-cascade': 'Character cascade', 'number-roll': 'Number roll', 'underline-sweep': 'Underline sweep', 'caption-over-screen': 'Caption glass' };
const BACKGROUND_LABELS = { static: 'Still', 'gradient-drift': 'Drift', 'soft-light': 'Light', particles: 'Particles' };
const TABS = { screen: ['Camera', 'Screen', 'Text', 'Look', 'Art'], text: ['Text', 'Look', 'Art'], story: ['Text', 'Look', 'Art'] };

function Field({ label, children, value }) {
  return <Box className="field"><Box className="field-label"><Typography variant="caption" color="text.secondary">{label}</Typography>{value !== undefined && <Typography variant="caption" className="field-value">{value}</Typography>}</Box>{children}</Box>;
}
function SliderField({ label, value, format = (v) => v, onPreview, onCommit, ...props }) {
  return <Field label={label} value={format(value)}><Slider size="small" aria-label={label} value={value} onChange={(_, v) => onPreview(v)} onChangeCommitted={(_, v) => onCommit(v)} {...props} /></Field>;
}
function Choice({ label, value, options, onChange }) {
  return <Field label={label}><ToggleButtonGroup exclusive fullWidth size="small" value={value} onChange={(_, v) => v !== null && onChange(v)} aria-label={label}>{Object.entries(options).map(([key, text]) => <ToggleButton key={key} value={key}>{text}</ToggleButton>)}</ToggleButtonGroup></Field>;
}
const Section = ({ title, children }) => <Box className="section"><Typography variant="overline" color="text.secondary" className="section-title">{title}</Typography>{children}</Box>;

function AreaTiming({shots,index,fps,durationFrames,onChange}) {
  const area=cameraAreas(shots)[index],last=durationFrames-1;
  const duration=(shots[area.end].at-shots[area.start].at)*last/fps;
  const max=((shots[area.end+1]?.at??1)-shots[area.start].at)*last/fps;
  const [value,setValue]=useState(String(+duration.toFixed(3)));
  useEffect(()=>setValue(String(+duration.toFixed(3))),[duration]);
  const save=()=>{const n=Number(value);if(value!==''&&Number.isFinite(n)&&Math.abs(n-duration)>.0005)onChange(n*fps/last);};
  return <Box sx={{width:'100%',pl:3}} onClick={event=>event.stopPropagation()}>
    <ToggleButtonGroup size="small" exclusive value={duration>0?'hold':'pass'} aria-label={`Area ${index+1} pacing`} onChange={(_,mode)=>{if(mode)onChange(mode==='pass'?0:Math.min(.75,max/2)*fps/last);}}>
      <ToggleButton value="hold">Hold</ToggleButton><ToggleButton value="pass">Pass through</ToggleButton>
    </ToggleButtonGroup>
    {duration>0&&<TextField size="small" type="number" label={`Area ${index+1} hold (seconds)`} value={value} onChange={e=>setValue(e.target.value)} onBlur={save} onKeyDown={e=>{if(e.key==='Enter')save();}} slotProps={{htmlInput:{min:0,max:+max.toFixed(3),step:.1}}} sx={{mt:1}} />}
  </Box>;
}

function CameraPanel({ scene }) {
  const { project, commit, preview, framing, setFraming, activeStop, setActiveStop, setNotice } = useStudio();
  const shots = scene.camera?.shots ?? [], focused = shots.filter((shot) => shot.focus), zoom = focused[0]?.zoom ?? 1.8;
  const stops = cameraStops(shots), pace = pacing(shots), active = scene.camera?.move?.preset, strength = scene.camera?.move?.strength ?? 1;
  const camera = scene.camera ?? {}, style = (changes) => commit('camera_style', { id: scene.id, ...changes });
  const changePath = (build, extra = {}) => { try { commit('camera_set_shots', { id: scene.id, shots: build(), ...extra }); } catch (error) { setNotice({severity:'error',message:error.message}); } };
  const swap = (index, to) => { setActiveStop(to); changePath(() => reorderStop(shots,index,to)); };
  const issue = screenConversionIssue(scene);
  if (issue) return <Typography variant="body2" color="text.secondary">{issue}. This scene is unchanged; use the Classic preview to edit its existing camera.</Typography>;
  const applyMove = (move, extra = {}) => commit('camera_apply_move', { id: scene.id, move, zoom, focus: stops[0]?.focus, endFocus: stops[1]?.focus, ...extra });
  const withZoom = (value) => shots.map((shot) => shot.focus ? { ...shot, zoom: value } : shot);
  const describe = (shot, index) => {
    const previous = shots[index - 1], same = previous && JSON.stringify([previous.focus, previous.zoom, previous.pose]) === JSON.stringify([shot.focus, shot.zoom, shot.pose]);
    if (same) return 'Hold';
    if (shot.pose && Object.values(shot.pose).some(Boolean)) return 'Angled view';
    return shot.focus ? `Focus ${shot.focus.map((v) => v.toFixed(2)).join(', ')} · ${(shot.zoom ?? 1).toFixed(1)}×` : 'Full view';
  };
  return <>
    <Section title="Camera move">
      <Box className="move-grid">
        {MOVES.map(({ id, label, hint }) => (
          <ButtonBase key={id} className={`move-card${active === id ? ' is-selected' : ''}`} aria-pressed={active === id} onClick={() => applyMove(id, ['orbit', 'tilt-settle'].includes(id) ? { strength } : {})}>
            <MoveDiagram move={id} /><Typography variant="body2" sx={{ fontWeight: 600 }}>{label}</Typography><Typography variant="caption" color="text.secondary">{hint}</Typography>
          </ButtonBase>
        ))}
      </Box>
      {['orbit', 'tilt-settle'].includes(active) && <Box sx={{ mt: 1.5 }}><SliderField label="Intensity" value={strength} min={0.1} max={1.5} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onPreview={() => {}} onCommit={(v) => applyMove(active, { strength: v })} /></Box>}
    </Section>
    <Section title={`Areas · ${stops.length}`}>
      <Button fullWidth size="small" variant={framing ? 'contained' : 'outlined'} startIcon={<SquareDashed size={16} />} onClick={() => setFraming(!framing)} sx={{ mb: 1 }}>{framing ? 'Done framing' : 'Frame areas on stage'}</Button>
      <Box component="ol" className="shot-path">
        {stops.map((stop, index) => (
          <Box component="li" key={index} sx={{flexWrap:'wrap'}} className={`shot-step${activeStop === index ? ' is-active' : ''}`} onClick={() => setActiveStop(index)}>
            <span className="area-number">{index + 1}</span>
            <Typography variant="body2" noWrap sx={{ flex: 1 }}>{stop.zoom.toFixed(1)}× at {stop.focus.map((v) => v.toFixed(2)).join(', ')}</Typography>
            <IconButton size="small" aria-label={`Move area ${index + 1} earlier`} disabled={!index} onClick={(event) => { event.stopPropagation(); swap(index, index - 1); }}><ArrowUp size={14} /></IconButton>
            <IconButton size="small" aria-label={`Move area ${index + 1} later`} disabled={index === stops.length - 1} onClick={(event) => { event.stopPropagation(); swap(index, index + 1); }}><ArrowDown size={14} /></IconButton>
            <IconButton size="small" aria-label={`Remove area ${index + 1}`} onClick={(event) => { event.stopPropagation(); setActiveStop(null); changePath(() => removeStop(shots,index)); }}><Trash2 size={14} /></IconButton>
            <AreaTiming shots={shots} index={index} fps={project.output.fps} durationFrames={scene.durationFrames} onChange={(duration) => changePath(() => setStopHold(shots,index,duration), duration===0?{flow:true}:{})} />
          </Box>
        ))}
      </Box>
      {!stops.length && <Typography variant="caption" color="text.secondary" className="hint">No areas yet. Frame one on the stage, or pick a zoom move above.</Typography>}
      {stops.length > 0 && <Box className="switch-row">
        <FormControlLabel control={<Switch size="small" checked={pace.startFull} onChange={(event) => changePath(() => setFullView(shots,'start',event.target.checked))} />} label={<Typography variant="caption">Start on full view</Typography>} />
        <FormControlLabel control={<Switch size="small" checked={pace.returnToFull} onChange={(event) => changePath(() => setFullView(shots,'end',event.target.checked))} />} label={<Typography variant="caption">Return to full view</Typography>} />
      </Box>}
      {stops.length > 0 && <><Button size="small" onClick={() => changePath(() => shotsFromStops(stops,{startFull:true,returnToFull:true}))}>Reset pacing</Button><Typography variant="caption" color="text.secondary" className="hint">Reset replaces custom point timing, poses and easing with evenly paced holds and full-view endpoints.</Typography></>}
    </Section>
    <Section title="Framing">
      <SliderField label="Zoom" value={zoom} min={1} max={4} step={0.05} format={(v) => `${v.toFixed(2)}×`} disabled={!focused.length} onPreview={(v) => preview({ camera: { shots: withZoom(v) } })} onCommit={(v) => commit('camera_set_shots', { id: scene.id, shots: withZoom(v) })} />
    </Section>
    <Section title="Motion">
      <Field label="Easing">
        <TextField select size="small" fullWidth value={camera.ease ?? 'smootherstep'} onChange={(event) => style({ ease: event.target.value })} slotProps={{ htmlInput: { 'aria-label': 'Easing' } }}>
          {Object.entries(EASING).map(([key, text]) => <MenuItem key={key} value={key}>{text}</MenuItem>)}
        </TextField>
      </Field>
      <SliderField label="Drift" value={camera.drift ?? 0} min={0} max={1} step={0.05} format={(v) => v ? `${Math.round(v * 100)}%` : 'Off'} onPreview={(drift) => preview({ camera: { drift } })} onCommit={(drift) => style({ drift })} />
      <Box className="switch-row"><FormControlLabel control={<Switch size="small" checked={Boolean(camera.flow)} onChange={(event) => { const flow = event.target.checked; preview({ camera: { flow } }); style({ flow }); }} />} label={<Typography variant="caption">Flow through areas</Typography>} /></Box>
      <Typography variant="caption" color="text.secondary" className="hint">Drift adds a slow orbit over the whole shot. Choose Pass through on an area to keep the camera gliding. Holds still pause.</Typography>
    </Section>
    <Section title={`Shot path · ${shots.length}`}>
      <Box component="ol" className="shot-path">
        {shots.map((shot, index) => (
          <Box component="li" key={index} className="shot-step">
            <Crosshair size={14} aria-hidden="true" />
            <Typography variant="caption" className="shot-step-time">{Math.round(shot.at * 100)}%</Typography>
            <Typography variant="body2" noWrap sx={{ flex: 1 }}>{describe(shot, index)}</Typography>
            <Tooltip title="Remove point"><span><IconButton size="small" aria-label={`Remove point ${index + 1}`} disabled={shots.length < 2} onClick={() => commit('camera_set_shots', { id: scene.id, shots: shots.filter((_, item) => item !== index) })}><Trash2 size={14} /></IconButton></span></Tooltip>
          </Box>
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary" className="hint">Ask the director for a specific framing, e.g. “zoom into the sidebar, then pan to the chart”.</Typography>
    </Section>
  </>;
}

// Drag to tilt: horizontal turns the screen (Y), vertical tips it (X). Double-click resets.
function TiltPad({ tilt, onPreview, onCommit }) {
  const ref = useRef(null), dragging = useRef(false), limit = 35;
  const at = (event) => { const box = ref.current.getBoundingClientRect(), clamp = (v) => Math.max(-1, Math.min(1, v)); const x = clamp(((event.clientX - box.left) / box.width) * 2 - 1), y = clamp(((event.clientY - box.top) / box.height) * 2 - 1); return [Math.round(-y * limit * 2) / 2, Math.round(x * limit * 2) / 2, tilt[2]]; };
  return (
    <Field label="Tilt pad" value={`${tilt[0]}° · ${tilt[1]}°`}>
      <Box ref={ref} className="tilt-pad" role="slider" tabIndex={0} aria-label="Tilt pad" aria-valuetext={`Tilt X ${tilt[0]} degrees, Y ${tilt[1]} degrees`}
        onPointerDown={(event) => { dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); onPreview(at(event)); }}
        onPointerMove={(event) => { if (dragging.current) onPreview(at(event)); }}
        onPointerUp={(event) => { if (dragging.current) { dragging.current = false; onCommit(at(event)); } }}
        onDoubleClick={() => onCommit([0, 0, tilt[2]])}
        onKeyDown={(event) => { const d = { ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key]; if (!d) return; event.preventDefault(); const clamp = (v) => Math.max(-limit, Math.min(limit, v)); onCommit([clamp(tilt[0] + d[0]), clamp(tilt[1] + d[1]), tilt[2]]); }}>
        <Box className="tilt-pad-plane" style={{ transform: `perspective(220px) rotateX(${tilt[0]}deg) rotateY(${tilt[1]}deg) rotateZ(${tilt[2]}deg)` }} />
        <Box className="tilt-pad-dot" style={{ left: `${(tilt[1] / limit + 1) * 50}%`, top: `${(-tilt[0] / limit + 1) * 50}%` }} />
      </Box>
    </Field>
  );
}

const SHADOWS = { none: 'None', soft: 'Soft', deep: 'Deep', floating: 'Lifted' };
const LIGHTS = { none: 'Off', spotlight: 'Spotlight', glow: 'Glow', floor: 'Floor' };
const percent = (v) => `${Math.round(v * 100)}%`;

function ScreenPanel({ scene }) {
  const { project, run, commit, preview } = useStudio();
  const screen = scene.screen ?? {}, studio = screen.presentation === 'studio', tilt = screen.tilt ?? [0, 0, 0];
  const offset = screen.offset ?? [0, 0], frame = screen.frame ?? 'none', lighting = screen.lighting ?? { style: 'none' };
  const set = (changes) => commit('screen_set', { id: scene.id, ...changes });
  const tiltAt = (axis, value) => tilt.map((v, index) => index === axis ? value : v);
  const offsetAt = (axis, value) => offset.map((v, index) => index === axis ? value : v);
  const issue = screenConversionIssue(scene);
  if (issue) return <Typography variant="body2" color="text.secondary">{issue}. This scene is unchanged; use the Classic preview to preserve its existing composition.</Typography>;
  return <>
    <Section title="Presentation">
      <Choice label="Layout" value={studio ? 'studio' : 'fullscreen'} options={{ fullscreen: 'Full screen', studio: 'Floating' }} onChange={(value) => set(value === 'studio'
        ? { presentation: 'studio', tilt: tilt.every((v) => !v) ? [14, -9, -3] : tilt, backdrop: screen.backdrop === 'theme' || !screen.backdrop ? 'paper' : screen.backdrop, fit: 'cover' }
        : { presentation: 'fullscreen', tilt: [0, 0, 0], backdrop: 'theme' })} />
      <Choice label="Backdrop" value={screen.backdrop ?? 'theme'} options={{ theme: 'Theme', paper: 'Paper', slate: 'Slate' }} onChange={(backdrop) => set({ backdrop })} />
      <Choice label="Fit" value={screen.fit ?? 'contain'} options={{ contain: 'Whole frame', cover: 'Fill' }} onChange={(fit) => set({ fit })} />
    </Section>
    <Section title="Framing">
      <SliderField label="Padding" value={screen.padding ?? 0.13} min={0} max={0.3} step={0.01} format={percent} disabled={!studio} onPreview={(padding) => preview({ screen: { padding } })} onCommit={(padding) => set({ padding })} />
      {['Position X', 'Position Y'].map((label, axis) => (
        <SliderField key={label} label={label} value={offset[axis]} min={-0.5} max={0.5} step={0.01} format={(v) => `${v > 0 ? '+' : ''}${percent(v)}`} disabled={!studio} onPreview={(v) => preview({ screen: { offset: offsetAt(axis, v) } })} onCommit={(v) => set({ offset: offsetAt(axis, v) })} />
      ))}
      <Button size="small" startIcon={<LocateFixed size={14} />} disabled={!studio || offset.every((v) => !v)} onClick={() => set({ offset: [0, 0] })}>Center</Button>
      {!studio && <Typography variant="caption" color="text.secondary" className="hint">Padding and position apply to a floating screen.</Typography>}
    </Section>
    <Section title="Depth">
      {studio && <TiltPad tilt={tilt} onPreview={(next) => preview({ screen: { tilt: next } })} onCommit={(next) => set({ tilt: next })} />}
      <SliderField label="Screen size" value={screen.size ?? 1} min={0.7} max={1.6} step={0.01} format={percent} onPreview={(size) => preview({ screen: { size } })} onCommit={(size) => set({ size })} />
      {['Tilt X', 'Tilt Y', 'Rotate'].map((label, axis) => (
        <SliderField key={label} label={label} value={tilt[axis]} min={-35} max={35} step={0.5} format={(v) => `${v}°`} onPreview={(v) => preview({ screen: { tilt: tiltAt(axis, v) } })} onCommit={(v) => set({ tilt: tiltAt(axis, v) })} />
      ))}
    </Section>
    <Section title="Surface">
      <SliderField label="Corner radius" value={screen.radius ?? (studio ? 22 : 0)} min={0} max={64} step={1} format={(v) => `${v}px`} onPreview={(radius) => preview({ screen: { radius } })} onCommit={(radius) => set({ radius })} />
      <Choice label="Shadow" value={screen.shadow ?? (studio ? 'soft' : 'none')} options={SHADOWS} onChange={(shadow) => set({ shadow })} />
      <FramePicker value={frame} onChange={(next) => set({ frame: next })} />
      {frame !== 'none' && <FrameTitle frame={frame} saved={screen.frameTitle} onCommit={(frameTitle) => set({ frameTitle })} />}
    </Section>
    <Section title="Lighting">
      <Choice label="Style" value={lighting.style} options={LIGHTS} onChange={(style) => set({ lighting: { ...lighting, style } })} />
      {lighting.style !== 'none' && <SliderField label="Intensity" value={lighting.intensity ?? 0.6} min={0} max={1} step={0.05} format={percent} onPreview={(intensity) => preview({ screen: { lighting: { ...lighting, intensity } } })} onCommit={(intensity) => set({ lighting: { ...lighting, intensity } })} />}
    </Section>
    <Section title="Consistency">
      <ScreenMatch key={scene.id} scene={scene} />
    </Section>
    {isVideoAsset(project.assets?.[scene.screen?.asset ?? scene.params?.asset]) && <SourceMoments scene={scene} project={project} run={run} />}
  </>;
}

function LookPanel({ scene }) {
  const { project, commit, preview, run } = useStudio();
  const [variationsOpen,setVariationsOpen]=useState(false);
  const background = scene.background ?? { style: 'static' };
  const update = (patch) => commit('scene_update', { id: scene.id, patch });
  const swatch = (id) => { const theme = resolveTheme(id); return { background: `linear-gradient(135deg, ${theme.background}, ${theme.backgroundEnd ?? theme.background})`, '--accent': theme.accent }; };
  return <>
    <Section title="Theme">
      <Box className="theme-grid" role="radiogroup" aria-label="Theme">
        <ButtonBase role="radio" aria-checked={!scene.theme} className={`theme-card${!scene.theme ? ' is-selected' : ''}`} onClick={() => update({ theme: null })}>
          <Box className="theme-swatch" style={swatch(project.theme ?? 'light-blue')} /><Typography variant="caption" noWrap>Project default</Typography>
        </ButtonBase>
        {THEME_OPTIONS.filter((theme) => !theme.id.startsWith('background-')).map((theme) => (
          <ButtonBase key={theme.id} role="radio" aria-checked={scene.theme === theme.id} className={`theme-card${scene.theme === theme.id ? ' is-selected' : ''}`} onClick={() => update({ theme: theme.id })}>
            <Box className="theme-swatch" style={swatch(theme.id)} /><Typography variant="caption" noWrap title={theme.label}>{theme.label.replace('Oxygen · ', '').replace(' (original)', '')}</Typography>
          </ButtonBase>
        ))}
      </Box>
    </Section>
    <BackgroundGallery scene={scene} />
    <Section title="Background motion">
      <Choice label="Style" value={background.style} options={Object.fromEntries(BACKGROUND_STYLES.map((style) => [style, BACKGROUND_LABELS[style] ?? style]))} onChange={(style) => update({ background: { style } })} />
      {background.style !== 'static' && <SliderField label="Intensity" value={background.intensity ?? 0.5} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onPreview={(intensity) => preview({ background: { ...background, intensity } })} onCommit={(intensity) => update({ background: { intensity } })} />}
    </Section>
    <Section title="Compositor">
      <Choice label="Look" value={scene.compositor?.look??'neutral'} options={{neutral:'Natural',cinematic:'Cinematic'}} onChange={look=>update({compositor:{...scene.compositor,look}})} />
      <SliderField label="Soft focus" value={scene.compositor?.depthOfField??0} min={0} max={1} step={.05} format={percent} onPreview={depthOfField=>preview({compositor:{...scene.compositor,depthOfField}})} onCommit={depthOfField=>update({compositor:{...scene.compositor,depthOfField}})} />
      <SliderField label="Soft light" value={scene.compositor?.light??0} min={0} max={1} step={.05} format={percent} onPreview={light=>preview({compositor:{...scene.compositor,light}})} onCommit={light=>update({compositor:{...scene.compositor,light}})} />
      <Typography variant="caption" color="text.secondary" className="hint">WebGL grades the background and built-in copy before the screen, captions and artwork layers are added, so those stay ungraded. Soft focus blurs toward the frame edges; it is not optical depth.</Typography>
    </Section>
    <Section title="Direction">
      <Button fullWidth variant="outlined" size="small" startIcon={<Sparkles size={15}/>} onClick={()=>setVariationsOpen(true)}>Explore three looks</Button>
      <Box sx={{mt:1.5}}><Choice label="Project pacing" value={project.style?.pacing??'balanced'} options={{measured:'Measured',balanced:'Balanced',energetic:'Energetic'}} onChange={pacing=>run('style_set',{pacing})} /></Box>
      <Button size="small" sx={{mt:1}} onClick={()=>run('style_set',{themes:[scene.theme??project.theme??'oxygen-wso2-dark'],look:scene.compositor?.look??'neutral'})}>Remember this look</Button>
      <Typography variant="caption" color="text.secondary" className="hint">Remembered themes and looks guide new templates and future variations.</Typography>
    </Section>
    <TimingPanel scene={scene} />
    <Section title="Export quality">
      <MotionBlurPanel key={scene.id} scene={scene} />
    </Section>
    <VariationDialog open={variationsOpen} onClose={()=>setVariationsOpen(false)} scene={scene} />
  </>;
}

function TimingPanel({ scene }) {
  const { project, commit, preview } = useStudio();
  const [transitionOpen, setTransitionOpen] = useState(false);
  const fps = project.output.fps;
  const next = project.scenes[project.scenes.findIndex((item) => item.id === scene.id) + 1];
  const update = patch => commit('scene_update', { id: scene.id, patch });
  return <>
    <Section title="Transition to next shot">
      <TextField select size="small" fullWidth label="Transition" value={scene.transition?.type??'cut'} onChange={event=>update({transition:event.target.value==='cut'?null:{type:event.target.value,frames:scene.transition?.frames??12}})}>
        {TRANSITION_TYPES.map(type=><MenuItem key={type} value={type}>{type.replaceAll('-',' ').replace(/^./,letter=>letter.toUpperCase())}</MenuItem>)}
      </TextField>
      {scene.transition?.type&&scene.transition.type!=='cut'&&<Box sx={{mt:1.5}}><SliderField label="Transition frames" value={scene.transition.frames} min={1} max={Math.max(1,Math.min(36,scene.durationFrames-1,(next?.durationFrames??Infinity)-1))} step={1} format={value=>`${value} f`} onPreview={()=>{}} onCommit={frames=>update({transition:{frames}})} /></Box>}
      <Button size="small" startIcon={<Play size={14}/>} disabled={!next} onClick={()=>setTransitionOpen(true)} sx={{mt:1}}>Preview transition</Button>
      <Typography variant="caption" color="text.secondary" className="hint">{next?'Renders this boundary exactly as the export joins it.':'This is the last shot, so its transition is not used.'}</Typography>
    </Section>
    <Section title="Duration">
      {scene.playback?.moments ? <Typography variant="caption" color="text.secondary" className="hint">Length follows the source moments ({(scene.durationFrames / fps).toFixed(1)}s). Edit them in the Screen tab.</Typography> : <>
      <Box className="chip-row">{[['Short', 3], ['Medium', 5], ['Long', 8]].map(([label, secs]) => <Chip key={label} label={`${label} · ${secs}s`} size="small" variant={scene.durationFrames === secs * fps ? 'filled' : 'outlined'} color={scene.durationFrames === secs * fps ? 'primary' : 'default'} onClick={() => update({ durationFrames: secs * fps })} />)}</Box>
      <SliderField label="Length" value={scene.durationFrames / fps} min={1} max={20} step={0.5} format={(v) => `${v}s`} onPreview={(v) => preview({ durationFrames: Math.round(v * fps) })} onCommit={(v) => update({ durationFrames: Math.round(v * fps) })} /></>}
    </Section>
    <TransitionPreview open={transitionOpen} onClose={() => setTransitionOpen(false)} scene={scene} next={next} />
  </>;
}

function PluginPanel({ scene }) {
  const { commit } = useStudio();
  const controls = pluginCapabilities(scene.plugin);
  const savedColor = scene.pluginOptions?.color ?? controls?.color?.default ?? '';
  const [color, setColor] = useState(savedColor), [variationsOpen, setVariationsOpen] = useState(false);
  useEffect(() => setColor(savedColor), [scene.id, savedColor]);
  const validColor = /^#[0-9a-f]{6}$/i.test(color);
  const updateOptions = patch => commit('scene_update', { id: scene.id, patch: { pluginOptions: patch } });
  return <>
    <Section title="Copy">
      {Object.entries(controls?.copy ?? {}).map(([name, control]) => <TextInput key={name} scene={scene} name={name} label={name[0].toUpperCase() + name.slice(1)} multiline maxLength={control.maxLength} />)}
    </Section>
    {controls?.color && !scene.templateInstance?.definition?.controls?.fields?.some(field => field.path === 'pluginOptions.color') && <Section title="Color">
      <TextField size="small" fullWidth label="Plugin color" value={color} error={!validColor} helperText={!validColor ? 'Use a six-digit hex color, such as #74e7cd.' : undefined} onChange={event => setColor(event.target.value)} onBlur={() => { if (validColor && color !== savedColor) updateOptions({ color }); }} onKeyDown={event => { if (event.key === 'Enter' && validColor && color !== savedColor) updateOptions({ color }); }} />
      <Button fullWidth variant="outlined" size="small" startIcon={<Sparkles size={15}/>} onClick={() => setVariationsOpen(true)} sx={{ mt: 1.5 }}>Explore three colors</Button>
    </Section>}
    <Section title="Export quality">
      {controls?.quality && <TextField select size="small" fullWidth label="Render quality" value={scene.pluginOptions?.quality ?? 1} onChange={event => updateOptions({ quality: Number(event.target.value) })} sx={{ mb: 1.5 }}>
        {controls.quality.map(quality => <MenuItem key={quality} value={quality}>{quality === 1 ? 'Standard · 1×' : 'High · 2×'}</MenuItem>)}
      </TextField>}
      <MotionBlurPanel key={scene.id} scene={scene} />
    </Section>
    <TimingPanel scene={scene} />
    <VariationDialog open={variationsOpen} onClose={() => setVariationsOpen(false)} scene={scene} />
  </>;
}

function BackgroundGallery({ scene }) {
  const { commit } = useStudio();
  const [backgrounds, setBackgrounds] = useState([]), [filter, setFilter] = useState('all');
  useEffect(() => { let current = true; callTool('background_list').then((items) => { if (current) setBackgrounds(items); }).catch(() => {}); return () => { current = false; }; }, []);
  const selected = scene.background?.image;
  return <Section title="Background gallery">
    <Box className="background-filter" role="group" aria-label="Background mode">
      {['all', 'dark', 'light'].map((mode) => <Chip key={mode} size="small" label={mode === 'all' ? 'All' : mode === 'dark' ? 'Dark' : 'Light'} color={filter === mode ? 'primary' : 'default'} variant={filter === mode ? 'filled' : 'outlined'} onClick={() => setFilter(mode)} />)}
    </Box>
    <Box className="background-gallery">
      {backgrounds.filter((item) => filter === 'all' || item.mode === filter).map((item) => <ButtonBase key={item.id} className={`background-card${selected === item.id ? ' is-selected' : ''}`} aria-label={`Apply ${item.label} background`} aria-pressed={selected === item.id} onClick={() => commit('background_apply', { id: scene.id, background: item.id })}>
        <Box className="background-card-art" style={{ backgroundImage: `url("${item.poster}")` }}><span style={{ color: item.theme.text }}>Aa</span></Box>
        <Box className="background-card-meta"><Typography variant="caption" noWrap>{item.label}</Typography><span className="background-mode">{item.mode}</span></Box>
      </ButtonBase>)}
    </Box>
    {selected && <Button size="small" onClick={() => commit('scene_update', { id: scene.id, patch: { background: { image: null }, theme: null } })}>Remove background</Button>}
  </Section>;
}

function ArtworkPanel({ scene }) {
  const { project, commit, run } = useStudio();
  const [busy, setBusy] = useState(false);
  const assets = Object.entries(project.assets ?? {}).filter(([,file]) => /\.(svg|json)$/i.test(file));
  const layers = scene.layers ?? [];
  const update = (next) => commit('scene_update', { id: scene.id, patch: { layers: next } });
  const edit = (index, patch) => update(layers.map((item, position) => position === index ? { ...item, ...patch } : item));
  const upload = async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    const type = file.name.toLowerCase().endsWith('.svg') ? 'svg' : file.name.toLowerCase().endsWith('.json') ? 'lottie' : null;
    if (!type) return;
    setBusy(true);
    try { await run('artwork_import', { name: file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'artwork', type, content: await file.text() }); }
    finally { setBusy(false); event.target.value = ''; }
  };
  return <>
    <Section title="Import artwork">
      <Button component="label" variant="outlined" size="small" disabled={busy}>Import SVG or Lottie JSON<input hidden type="file" accept=".svg,.json,image/svg+xml,application/json" onChange={upload} /></Button>
      <Typography variant="caption" color="text.secondary" className="hint">Use artwork you have rights to. Bodymovin animations follow the video frame exactly.</Typography>
    </Section>
    <Section title={`Layers · ${layers.length}`}>
      {layers.map((layer,index)=><Box key={`${layer.asset}-${index}`} className="artwork-editor">
        <Box className="artwork-editor-head"><Typography variant="subtitle2" noWrap>{layer.asset}</Typography><Chip size="small" label={layer.type === 'lottie' ? 'Motion' : 'SVG'} /><IconButton size="small" aria-label={`Remove ${layer.asset} layer`} onClick={()=>update(layers.filter((_,i)=>i!==index))}><Trash2 size={15}/></IconButton></Box>
        <Box className="artwork-bounds">{[['X','x'],['Y','y'],['Width','width'],['Height','height']].map(([label,key])=><TextField key={key} size="small" type="number" label={label} value={Math.round(layer[key]*100)} slotProps={{htmlInput:{min:0,max:100,step:1}}} onChange={event=>{const n=Number(event.target.value);if(Number.isFinite(n)&&n>=0&&n<=100)edit(index,{[key]:n/100});}} />)}</Box>
        {layer.type==='lottie'&&<SliderField label="Speed" value={layer.speed??1} min={.1} max={4} step={.1} format={value=>`${value.toFixed(1)}×`} onPreview={()=>{}} onCommit={speed=>edit(index,{speed})} />}
      </Box>)}
      {assets.length?<TextField size="small" select fullWidth label="Add artwork layer" value="" onChange={event=>{const [asset,file]=assets.find(([name])=>name===event.target.value)??[];if(asset)update([...layers,{type:file.endsWith('.svg')?'svg':'lottie',asset,x:.65,y:.12,width:.25,height:.25}]);}} sx={{mt:1}}><MenuItem value="" disabled>Select an asset</MenuItem>{assets.map(([name])=><MenuItem key={name} value={name}>{name}</MenuItem>)}</TextField>:<Typography variant="caption" color="text.secondary">Import artwork to add a layer.</Typography>}
    </Section>
  </>;
}

function TextInput({ scene, name, label, multiline, maxLength }) {
  const { commit } = useStudio(), saved = scene.params?.[name] ?? '';
  const [value, setValue] = useState(saved);
  useEffect(() => setValue(saved), [saved, scene.id]);
  const save = () => { if (value !== saved) commit('scene_update', { id: scene.id, patch: { params: { [name]: scene.plugin ? value : value || null } } }); };
  return <TextField label={label} size="small" fullWidth inputProps={maxLength ? { maxLength } : undefined} multiline={multiline} minRows={multiline ? 2 : undefined} value={value} onChange={(event) => setValue(event.target.value)} onBlur={save} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); save(); } }} sx={{ mb: 1.5 }} />;
}

function TextPanel({ scene }) {
  const { commit, project } = useStudio(), animation = scene.textAnimation ?? {};
  const [captionText, setCaptionText] = useState(scene.caption?.text ?? '');
  useEffect(() => setCaptionText(scene.caption?.text ?? ''), [scene.id, scene.caption?.text]);
  if (scene.kind === 'screen') return <>
    {scene.template && <Section title="Template copy"><TextInput scene={scene} name="title" label="Shot name" /><Typography variant="caption" color="text.secondary" className="hint">This names the shot in the strip. The caption below appears over the recording.</Typography></Section>}
    <Section title="Screen caption">
      <TextField size="small" fullWidth label="Caption" value={captionText} onChange={(event) => setCaptionText(event.target.value)} onBlur={() => { if (captionText !== (scene.caption?.text ?? '')) commit('scene_update', { id: scene.id, patch: { caption: captionText.trim() ? { ...scene.caption, text: captionText.trim() } : null } }); }} inputProps={{ maxLength: 120 }} sx={{ mb: 1.5 }} />
      {scene.caption && <><Choice label="Placement" value={scene.caption.placement ?? 'bottom'} options={{ top: 'Top', bottom: 'Bottom' }} onChange={(placement) => commit('scene_update', { id: scene.id, patch: { caption: { placement } } })} />
        <Choice label="Motion" value={scene.caption.animation ?? 'caption-over-screen'} options={{ 'caption-over-screen': 'Glass', 'line-wipe': 'Wipe', 'scale-pop': 'Pop', 'word-stagger': 'Stagger' }} onChange={(animation) => commit('scene_update', { id: scene.id, patch: { caption: { animation } } })} /></>}
      <Typography variant="caption" color="text.secondary" className="hint">{scene.caption?.text ? `Reading hold: ${(captionReadingFrames(scene, project.scenes) / project.output.fps).toFixed(1)}s · minimum ${(minimumCaptionReadingHold(scene.caption.text, project.output.fps) / project.output.fps).toFixed(1)}s for this caption. ` : ''}Glass rises on a frosted plate; Wipe, Pop and Stagger use a solid plate. Each settles, holds still, then leaves before the shot ends.</Typography>
    </Section>
  </>;
  const timing = textTiming(scene), minimum = minimumReadingHold(scene, project.output.fps);
  return <>
    <Section title="Copy">
      <TextInput scene={scene} name="eyebrow" label="Eyebrow" />
      <TextInput scene={scene} name="title" label="Title" multiline />
      <TextInput scene={scene} name="subtitle" label="Subtitle" multiline />
    </Section>
    {scene.preset === 'text-template' && <Section title="Text animation">
      <Box className="move-grid">
        {TEXT_TEMPLATES.map((template) => (
          <ButtonBase key={template} className={`move-card${(animation.template ?? 'masked-lines') === template ? ' is-selected' : ''}`} aria-pressed={(animation.template ?? 'masked-lines') === template} onClick={() => commit('scene_update', { id: scene.id, patch: { textAnimation: { template, highlight: template === 'keyword-highlight' ? (animation.highlight ?? scene.params?.title?.split(/\s+/).at(-1)) : null } } })}>
            <Box className={`text-motion-preview preview-${template}`} aria-hidden="true"><span>Aa</span></Box><Typography variant="body2" sx={{ fontWeight: 600 }}>{TEXT_LABELS[template] ?? template}</Typography>
          </ButtonBase>
        ))}
      </Box>
      <Box sx={{ mt: 1.5 }}><Choice label="Placement" value={animation.placement ?? 'center'} options={{ center: 'Center', 'top-left': 'Top left', 'lower-third': 'Lower third' }} onChange={(placement) => commit('scene_update', { id: scene.id, patch: { textAnimation: { placement } } })} /></Box>
      <Typography variant="caption" color="text.secondary" className="hint">Reading hold: {(timing.holdFrames / project.output.fps).toFixed(1)}s · minimum {(minimum / project.output.fps).toFixed(1)}s for this copy.</Typography>
    </Section>}
  </>;
}

function TemplateControlsPanel({ scene }) {
  const { project, commit } = useStudio();
  const fields = scene.templateInstance?.definition?.controls?.fields ?? [];
  if (!fields.length) return null;
  return <Section title="Template controls"><DeclaredControls fields={fields} values={Object.fromEntries(fields.map(field => [field.id, controlValue(scene, field)]))} assets={project.assets} onChange={(control, value) => commit('template_set_control', { id: scene.id, control, value })} /></Section>;
}

export function Inspector() {
  const { scene } = useStudio();
  const [tab, setTab] = useState(0);
  const kind = scene ? sceneKind(scene) : 'story', tabs = scene?.kind === 'composition' ? ['Composition'] : scene?.plugin ? ['Plugin'] : TABS[kind];
  useEffect(() => setTab(0), [scene?.id]);
  const KindIcon = { screen: MonitorPlay, text: Type, story: Sparkles }[kind], name = tabs[Math.min(tab, tabs.length - 1)];
  const Panel = { Composition: CompositionPanel, Plugin: PluginPanel, Camera: CameraPanel, Screen: ScreenPanel, Look: LookPanel, Text: TextPanel, Art: ArtworkPanel }[name];
  return (
    <Box component="aside" className="inspector" aria-label="Inspector">
      {scene ? <>
        <Box className="panel-head">
          <KindIcon size={16} aria-hidden="true" />
          <Typography variant="subtitle2" noWrap sx={{ flex: 1, fontWeight: 600 }}>{sceneLabel(scene)}</Typography>
          <Chip size="small" label={scene.plugin ? ANIMATION_PLUGINS.find(item => item.id === scene.plugin)?.label ?? scene.plugin : kind === 'screen' ? 'Screen' : kind === 'text' ? 'Title' : scene.preset ?? 'Custom'} />
        </Box>
        <Tabs value={Math.min(tab, tabs.length - 1)} onChange={(_, value) => setTab(value)} variant="fullWidth" className="panel-tabs">
          {tabs.map((label) => <Tab key={label} label={label} />)}
        </Tabs>
        <Box className="panel-body">
          <TemplateControlsPanel scene={scene} /><Panel key={name} scene={scene} />
        </Box>
      </> : <Box className="panel-body"><Typography color="text.secondary">Select a shot to adjust it.</Typography></Box>}
    </Box>
  );
}
