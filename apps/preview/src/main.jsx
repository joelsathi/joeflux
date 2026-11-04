import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createSceneRenderer } from '../../../packages/renderer/src/browser-scene.js';
import { apiFetch } from '../../../packages/preview-server/src/browser-session.js';
import { RECIPE_NAMES, CONTINUOUS_RECIPES, continuousHandoffTiming } from '../../../packages/presets/src/recipes.js';
import { THEME_OPTIONS } from '../../../packages/presets/src/themes.js';
import { BRAND_KITS } from '../../../packages/presets/src/brand-kits.js';
import { BACKGROUND_STYLES } from '../../../packages/motion/src/background.js';
import { TEXT_TEMPLATES, textTiming } from '../../../packages/motion/src/text-animation.js';
import { CameraControls } from './camera-controls.jsx';
import { CameraComposer } from './camera-composer.jsx';
import './styles.css';

const clone = (value) => JSON.parse(JSON.stringify(value));

function App() {
  const canvasRef = useRef(null);
  const timerRef = useRef(null);
  const frameRef = useRef(0);

  const [project, setProject] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [frame, setFrame] = useState(0);
  useEffect(()=>{frameRef.current=frame;},[frame]);
  const [playing, setPlaying] = useState(false);
  const [composing, setComposing] = useState(false);
  const [message, setMessage] = useState('Loading project…');
  const selected = useMemo(() => project?.scenes.find((scene) => scene.id === selectedId), [project, selectedId]);
  const render=useMemo(()=>project?createSceneRenderer(project,{assetBase:'/project-assets',frameEndpoint:'/project-assets/source-frame'}):null,[project]);
  useEffect(()=>()=>{void render?.dispose();},[render]);

  async function reload() {
    const response = await apiFetch('/api/project'); const next = await response.json();
    if (next.error) throw new Error(next.error);
    setProject(next); setSelectedId((id) => id && next.scenes.some((scene) => scene.id === id) ? id : next.scenes[0]?.id ?? null); setMessage('Project loaded.');
  }
  useEffect(() => { reload().catch((error) => setMessage(error.message)); }, []);
  useEffect(() => { if (selected) { setDraft(clone(selected)); setFrame(0); setComposing(false); setPlaying(false); } }, [selectedId, project]);
  useEffect(() => {
    if(!draft||!project||!canvasRef.current)return;
    let active=true;
    render(canvasRef.current,draft,Math.min(frame,draft.durationFrames-1),{isCurrent:()=>active}).catch(error=>{if(active){setPlaying(false);setMessage(error.message);}});
    return ()=>{active=false;};
  },[draft,frame,project,render,composing]);
  useEffect(() => {
    if (!playing || !draft) return undefined;
    const started=performance.now(),first=frameRef.current,count=draft.durationFrames,fps=project?.output.fps??24;
    const tick=now=>{const next=(first+Math.floor((now-started)*fps/1000))%count;setFrame(current=>current===next?current:next);timerRef.current=window.requestAnimationFrame(tick);};
    timerRef.current=window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(timerRef.current);
  }, [playing, draft?.id, draft?.durationFrames, project?.output.fps]);
  if (!project || !draft) return <main className="loading">{message}</main>;

  const continuousHold=draft.preset==='screen-handoff'&&draft.connectionStyle==='continuous'?continuousHandoffTiming(draft.durationFrames):null;
  const textControls=draft.preset==='text-template'?textTiming(draft):null;
  const cameraScene=['recorded-showcase','focus-transition'].includes(draft.preset);
  const manualCamera=cameraScene&&!draft.cameraMotion;
  const canCompose=cameraScene&&draft.params?.asset&&['focus-zoom','detail-pan','return-full'].includes(draft.cameraMotion?.preset);
  const update = (setter) => setDraft((current) => setter(clone(current)));
  const updateTextTiming=(key,value)=>update(scene=>{
    const t=textTiming(scene),next={entryFrames:t.entryFrames,holdFrames:t.holdFrames,exitFrames:t.exitFrames,[key]:Number(value)};
    next.holdFrames=Math.min(next.holdFrames,scene.durationFrames-1-next.entryFrames-next.exitFrames);
    return {...scene,textAnimation:{...scene.textAnimation,...next}};
  });
  const updateBackground=(key,value)=>update(scene=>({...scene,background:{style:'static',...scene.background,[key]:Number(value)}}));
  const updateCamera = (key, value) => update((scene) => { scene.camera ??= {}; scene.camera.end ??= {}; scene.camera.end[key] = Number(value); return scene; });
  const updateHold=(key,value)=>update(scene=>{scene.playback??={};scene.playback.holds??=[{outputStart:Math.floor(scene.durationFrames*.4),outputEnd:Math.floor(scene.durationFrames*.6)}];if(!scene.playback.holds.length)scene.playback.holds.push({outputStart:Math.floor(scene.durationFrames*.4),outputEnd:Math.floor(scene.durationFrames*.6)});scene.playback.holds[0][key]=Number(value);return scene;});
  const updateRate = (value) => update((scene) => { scene.playback ??= { startFrame: 0, endFrame: 240, segments: [], holds: [] }; scene.playback.segments = [{ outputStart: 0, outputEnd: Math.max(0, scene.durationFrames), rate: Number(value) }]; return scene; });
  const updateZoom=(key,value)=>update(scene=>{scene.zoom??={startFrame:0,endFrame:scene.durationFrames-1,entryFrames:12,exitFrames:12,scale:1.8,focusX:.5,focusY:.5};scene.zoom[key]=Number(value);return scene;});
  const changeProjectTheme=async(theme)=>{if(JSON.stringify(withoutRuntimeFields(draft))!==JSON.stringify(withoutRuntimeFields(selected))){setMessage('Save or revert the current scene before changing the project theme.');return;}const response=await apiFetch('/api/project',{method:'PUT',body:{theme,fingerprint:project.manifestFingerprint}});const result=await response.json();if(!response.ok)throw new Error(result.error);await reload();};
  const save = async () => {
    const response = await apiFetch(`/api/scenes/${draft.id}`, { method: 'PUT', body: { scene: withoutRuntimeFields(draft), fingerprint: draft.fingerprint } });
    const result = await response.json(); if (!response.ok) throw new Error(result.error);
    setMessage('Saved.'); await reload();
  };
  const action = async (name) => { if (JSON.stringify(withoutRuntimeFields(draft)) !== JSON.stringify(withoutRuntimeFields(selected))) { setMessage('Save the scene before rendering.'); return; } setMessage(`${name}…`); const endpoint = name.startsWith('Render') ? '/api/render' : name === 'Assemble' ? '/api/assemble' : '/api/review'; const response = await apiFetch(endpoint, { body: name === 'Render scene' ? { sceneId: draft.id } : {} }); const result = await response.json(); setMessage(response.ok ? `${name} complete.` : result.error); };
  return <main className="app">
    <header><div><p className="eyebrow">Silent video system</p><h1>{project.name}</h1></div><label>Project theme <select aria-label="Project theme" value={project.theme??'light-blue'} onChange={event=>changeProjectTheme(event.target.value).catch(error=>setMessage(error.message))}>{THEME_OPTIONS.map(theme=><option key={theme.id} value={theme.id}>{theme.label}</option>)}</select></label><span className="status">{message}</span></header>
    <section className={`workspace${composing&&canCompose?' is-composing':''}`}>
      <aside className="scene-list"><h2>Scenes</h2>{project.scenes.map((scene) => <button className={scene.id === selectedId ? 'selected' : ''} key={scene.id} onClick={() => setSelectedId(scene.id)}><span>{scene.id.replaceAll('-', ' ')}</span><small>{(scene.durationFrames / project.output.fps).toFixed(2)} s</small></button>)}</aside>
      <section className="stage">{composing&&canCompose&&<CameraComposer project={project} scene={draft} frame={frame} setFrame={setFrame} playing={playing} setPlaying={setPlaying} onChange={update} onSave={()=>save().catch(error=>setMessage(error.message))} onRevert={()=>{setDraft(clone(selected));setComposing(false);setPlaying(false);setMessage('Reverted unsaved changes.');}} onClose={()=>setComposing(false)} onSelectScene={id=>setSelectedId(id)}/>}<div className="canvas-wrap" style={{display:composing&&canCompose?'none':undefined}}><canvas ref={canvasRef} width={project.output.width} height={project.output.height}/></div><div className="transport" style={{display:composing&&canCompose?'none':undefined}}><button onClick={() => {setComposing(false);setPlaying((value) => !value);}}>{playing ? 'Pause' : 'Play'}</button><button onClick={() => setFrame((value) => Math.max(0, value - 1))}>‹</button><input type="range" min="0" max={draft.durationFrames - 1} value={frame} onChange={(event) => setFrame(Number(event.target.value))}/><button onClick={() => setFrame((value) => Math.min(draft.durationFrames - 1, value + 1))}>›</button><span>{frame + 1} / {draft.durationFrames}</span></div></section>
      <aside className="controls"><h2>Fine-tune</h2><p className="dirty-state">{JSON.stringify(withoutRuntimeFields(draft))!==JSON.stringify(withoutRuntimeFields(selected))?'Unsaved changes':'Saved scene'}</p><label>Preset<select value={draft.preset} onChange={(event) => update((scene) => ({ ...scene, preset: event.target.value, connectionStyle: CONTINUOUS_RECIPES.includes(event.target.value)?scene.connectionStyle:undefined, textAnimation:event.target.value==='text-template'?scene.textAnimation:undefined, cameraMotion:['recorded-showcase','focus-transition'].includes(event.target.value)?scene.cameraMotion:undefined }))}>{['oxygen-particles','text-settle','text-template','floating-cards','feature-list','recorded-showcase','focus-transition',...RECIPE_NAMES].map((preset) => <option key={preset}>{preset}</option>)}</select></label>{CONTINUOUS_RECIPES.includes(draft.preset)&&<label>Connection style<select aria-label="Connection style" value={draft.connectionStyle??'classic'} onChange={event=>update(scene=>({...scene,connectionStyle:event.target.value}))}><option value="classic">Classic (existing)</option><option value="continuous">Continuous (refined)</option></select></label>}<label>Theme<select aria-label="Theme" value={draft.theme ?? 'inherit'} onChange={(event) => update((scene) => ({ ...scene, theme: event.target.value==='inherit'?undefined:event.target.value }))}><option value="inherit">Use project theme</option>{THEME_OPTIONS.map(theme=><option key={theme.id} value={theme.id}>{theme.label}</option>)}</select></label><label>Title<input value={draft.params?.title ?? ''} onChange={(event) => update((scene) => ({ ...scene, params: { ...scene.params, title: event.target.value } }))}/></label>{manualCamera&&<><Field label="Rotate X" value={draft.camera?.end?.rotateX ?? 0} min="-35" max="35" step="1" onChange={(value) => updateCamera('rotateX', value)}/><Field label="Rotate Y" value={draft.camera?.end?.rotateY ?? 0} min="-35" max="35" step="1" onChange={(value) => updateCamera('rotateY', value)}/><Field label="Rotate Z" value={draft.camera?.end?.rotateZ ?? 0} min="-15" max="15" step="1" onChange={(value) => updateCamera('rotateZ', value)}/><Field label="End scale" value={draft.camera?.end?.scale ?? 1} min=".7" max="1.4" step=".01" onChange={(value) => updateCamera('scale', value)}/></>}{!draft.cameraMotion&&<><Field label="Source focus X" value={draft.zoom?.focusX ?? .5} min="0" max="1" step=".01" onChange={(value) => updateZoom('focusX', value)}/><Field label="Source focus Y" value={draft.zoom?.focusY ?? .5} min="0" max="1" step=".01" onChange={(value) => updateZoom('focusY', value)}/></>}{manualCamera&&<label>Camera easing<select value={draft.camera?.easing??'easeInOut'} onChange={event=>update(scene=>({...scene,camera:{...scene.camera,easing:event.target.value}}))}>{['linear','easeIn','easeOut','easeInOut','smootherstep'].map(value=><option key={value}>{value}</option>)}</select></label>}
      <label>Background style<select aria-label="Background style" value={draft.background?.style??'legacy'} onChange={event=>update(scene=>({...scene,background:event.target.value==='legacy'?undefined:{...scene.background,style:event.target.value}}))}><option value="legacy">Original background</option>{BACKGROUND_STYLES.map(style=><option key={style}>{style}</option>)}</select></label>
      {draft.background&&draft.background.style!=='static'&&<><Field label="Background intensity" value={draft.background.intensity??.5} min="0" max="1" step=".05" onChange={value=>updateBackground('intensity',value)}/><Field label="Background speed" value={draft.background.speed??1} min=".1" max="2" step=".1" onChange={value=>updateBackground('speed',value)}/></>}
      {textControls&&<><label>Text animation<select aria-label="Text animation" value={draft.textAnimation?.template??'masked-lines'} onChange={event=>update(scene=>({...scene,textAnimation:{...scene.textAnimation,template:event.target.value}}))}>{TEXT_TEMPLATES.map(template=><option key={template}>{template}</option>)}</select></label>
      <label>Subtitle<textarea value={draft.params?.subtitle??''} onChange={event=>update(scene=>({...scene,params:{...scene.params,subtitle:event.target.value}}))}/></label>
      <label>Eyebrow<input value={draft.params?.eyebrow??''} onChange={event=>update(scene=>({...scene,params:{...scene.params,eyebrow:event.target.value}}))}/></label>
      {draft.textAnimation?.template==='keyword-highlight'&&<label>Highlight word<input placeholder="Last word by default" value={draft.textAnimation?.highlight??''} onChange={event=>update(scene=>({...scene,textAnimation:{...scene.textAnimation,highlight:event.target.value||undefined}}))}/></label>}
      <Field label="Text entrance (frames)" value={textControls.entryFrames} min="1" max={draft.durationFrames-1-textControls.exitFrames} step="1" onChange={value=>updateTextTiming('entryFrames',value)}/>
      <Field label="Text reading hold (frames)" value={textControls.holdFrames} min="0" max={draft.durationFrames-1-textControls.entryFrames-textControls.exitFrames} step="1" onChange={value=>updateTextTiming('holdFrames',value)}/>
      <Field label="Text exit (frames)" value={textControls.exitFrames} min="1" max={draft.durationFrames-1-textControls.entryFrames} step="1" onChange={value=>updateTextTiming('exitFrames',value)}/></>}
      {cameraScene&&<CameraControls scene={draft} onChange={update} onCompose={()=>{if(!canCompose){setMessage('Select a recording asset to compose this shot.');return;}setPlaying(false);update(scene=>({...scene,cameraMotion:{...scene.cameraMotion,fit:'cover',presentation:'studio',backdrop:scene.cameraMotion?.backdrop??'paper',rotateX:scene.cameraMotion?.rotateX??14,rotateY:scene.cameraMotion?.rotateY??-9,rotateZ:scene.cameraMotion?.rotateZ??-3,stageScale:scene.cameraMotion?.stageScale??1}}));setComposing(true);}}/>}
      {!draft.cameraMotion&&<><Field label="Focus zoom" value={draft.zoom?.scale??1} min="1" max="4" step=".05" onChange={value=>updateZoom('scale',value)}/>
      <Field label="Zoom starts (frame)" value={draft.zoom?.startFrame??0} min="0" max={draft.durationFrames-2} step="1" onChange={value=>updateZoom('startFrame',value)}/>
      <Field label="Zoom ends (frame)" value={draft.zoom?.endFrame??draft.durationFrames-1} min="1" max={draft.durationFrames-1} step="1" onChange={value=>updateZoom('endFrame',value)}/>
      <Field label="Push in (frames)" value={draft.zoom?.entryFrames??12} min="1" max="48" step="1" onChange={value=>updateZoom('entryFrames',value)}/>
      <Field label="Pull out (frames)" value={draft.zoom?.exitFrames??12} min="1" max="48" step="1" onChange={value=>updateZoom('exitFrames',value)}/>
      <button onClick={()=>update(scene=>{delete scene.zoom;return scene;})}>Clear focus zoom</button></>}
      {draft.preset==='screen-handoff'&&<Field label="Caption hold (frames)" value={draft.timing?.holdFrames??continuousHold?.defaultHoldFrames??49} min={continuousHold?0:12} max={continuousHold?.maxHoldFrames??Math.floor(draft.durationFrames*.45)} step="1" onChange={value=>update(scene=>({...scene,timing:{...scene.timing,holdFrames:Number(value)}}))}/>}
      <label>Media<select value={draft.params?.asset??''} onChange={event=>update(scene=>({...scene,params:{...scene.params,asset:event.target.value||undefined}}))}><option value="">None</option>{Object.keys(project.assets??{}).map(key=><option key={key}>{key}</option>)}</select></label>
      <label>Brand overlay<select value={draft.brand??project.brand??'none'} onChange={event=>update(scene=>({...scene,brand:event.target.value}))}><option value="none">None</option>{BRAND_KITS.map(kit=><option key={kit.id} value={kit.id}>{kit.name}</option>)}</select></label>
      {['screen-handoff','side-slide','accent-mask'].includes(draft.preset)&&['outgoingAsset','incomingAsset'].map(key=><label key={key}>{key==='outgoingAsset'?'Outgoing screen':'Incoming screen'}<select value={draft.params?.[key]??draft.params?.asset??''} onChange={event=>update(scene=>({...scene,params:{...scene.params,[key]:event.target.value}}))}><option value="">Choose asset</option>{Object.keys(project.assets??{}).map(id=><option key={id}>{id}</option>)}</select></label>)}
      {['screen-handoff','side-slide','accent-mask'].includes(draft.preset)&&['outgoingSeconds','incomingSeconds'].map(key=><label key={key}>{key==='outgoingSeconds'?'Outgoing source time (s)':'Incoming source time (s)'}<input type="number" min="0" step=".01" value={draft.params?.[key]??0} onChange={event=>update(scene=>({...scene,params:{...scene.params,[key]:Number(event.target.value)}}))}/></label>)}
      <label>Freeze starts (frame)<input type="number" min="0" max={draft.durationFrames-1} value={draft.playback?.holds?.[0]?.outputStart??Math.floor(draft.durationFrames*.4)} onChange={event=>updateHold('outputStart',event.target.value)}/></label>
      <label>Freeze ends (inclusive)<input type="number" min="0" max={draft.durationFrames-1} value={draft.playback?.holds?.[0]?.outputEnd??Math.floor(draft.durationFrames*.6)} onChange={event=>updateHold('outputEnd',event.target.value)}/></label>
      <button onClick={()=>updateHold('outputStart',Math.floor(draft.durationFrames*.4))}>Add reading freeze</button><button onClick={()=>update(scene=>{if(scene.playback)scene.playback.holds=[];return scene;})}>Clear freezes</button>
      <label>Transition to next scene<select value={draft.transition?.type??'cut'} onChange={event=>update(scene=>({...scene,transition:event.target.value==='cut'?undefined:{type:event.target.value,frames:12}}))}><option value="cut">Cut</option><option value="crossfade">Crossfade</option><option value="side-slide">Side slide</option></select></label>
      <Field label="Transition frames" value={draft.transition?.frames??12} min="1" max={Math.max(1,Math.min(48,draft.durationFrames-1))} step="1" onChange={value=>update(scene=>({...scene,transition:{type:scene.transition?.type??'crossfade',frames:Number(value)}}))}/>
      <Field label="Footage speed" value={draft.playback?.segments?.[0]?.rate ?? 1} min=".25" max="3" step=".25" onChange={updateRate}/><div className="button-row"><button onClick={() => save().catch((error) => setMessage(error.message))}>Save</button><button onClick={() => { setDraft(clone(selected)); setComposing(false); setPlaying(false); setMessage('Reverted unsaved changes.'); }}>Revert</button></div><div className="action-row"><button onClick={() => action('Render scene')}>Render scene</button><button onClick={async()=>{try{await save();setMessage('Rendering saved scene…');const response=await apiFetch('/api/render',{body:{sceneId:draft.id}});const result=await response.json();setMessage(response.ok?'Render scene complete.':result.error);}catch(error){setMessage(error.message);}}}>Save &amp; Render</button><button onClick={() => action('Render project')}>Render project</button><button onClick={() => action('Assemble')}>Assemble</button><button onClick={() => action('Review')}>Contact sheet</button></div></aside>
    </section>
  </main>;
}

function Field({ label, value, min, max, step, onChange }) { return <label>{label}<div className="range-row"><input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(event.target.value)}/><output>{Number(value).toFixed(step < 1 ? 2 : 0)}</output></div></label>; }
function withoutRuntimeFields(scene) { const { file, fingerprint, ...saved } = scene; return saved; }
createRoot(document.querySelector('#root')).render(<App/>);
