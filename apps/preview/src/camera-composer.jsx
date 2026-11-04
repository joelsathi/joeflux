import {useEffect,useMemo,useRef,useState} from 'react';
import {createAssetLoader,sourceSecondsForFrame} from '../../../packages/renderer/src/source-frames.js';
import {cameraMotionTiming,evaluateShots} from '../../../packages/motion/src/camera-motion.js';
import {drawCameraMedia} from '../../../packages/motion/src/media-framing.js';
import {createSceneRenderer} from '../../../packages/renderer/src/browser-scene.js';
import {cropRect,drawCrop,moveCrop,resizeCrop,motionFromCrop} from './composition-geometry.js';

export function CameraComposer({project,scene,frame,setFrame,playing,setPlaying,onChange,onSave,onRevert,onClose,onSelectScene}) {
  const [target,setTarget]=useState('from'),[drawing,setDrawing]=useState(false),[previewing,setPreviewing]=useState(true),[image,setImage]=useState(null),[error,setError]=useState('');
  const sourceRef=useRef(null),cropRef=useRef(null),motionRef=useRef(null),drag=useRef(null);
  const load=useMemo(()=>createAssetLoader(project,{assetBase:'/project-assets',frameEndpoint:'/project-assets/source-frame'}),[project]);
  const render=useMemo(()=>createSceneRenderer(project,{assetBase:'/project-assets',frameEndpoint:'/project-assets/source-frame'}),[project]);
  const motion=scene.cameraMotion,rect=cropRect(motion,target),pan=motion.preset==='detail-pan';
  const timing=cameraMotionTiming(scene),fromFrame=motion.preset==='return-full'?0:timing.entryFrames,toFrame=timing.last-timing.exitFrames;
  const width=1920,height=Math.round(project.output.height/(project.output.width/1920));
  const sourceTime=sourceSecondsForFrame(scene,frame,project.output.fps);
  useEffect(()=>{if(previewing){setImage(null);return;}let active=true;setImage(null);setError('');load(scene.params.asset,sourceTime).then(value=>{if(active)setImage(value);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[load,scene.params.asset,sourceTime,previewing]);
  useEffect(()=>{
    if(!image||previewing)return;
    const w=width,h=height;
    const source=sourceRef.current.getContext('2d');source.clearRect(0,0,w,h);
    drawCameraMedia(source,image,w,h,{scale:1,x:0,y:0},'cover');
    const {zoom}=evaluateShots({shots:[{at:0,focus:[rect.x+rect.size/2,rect.y+rect.size/2],zoom:motion.scale??1.8}]},0,2);
    const crop=cropRef.current.getContext('2d');crop.clearRect(0,0,w,h);drawCameraMedia(crop,image,w,h,zoom,'cover');
  },[image,scene,motion,rect.x,rect.y,rect.size,width,height,previewing]);
  useEffect(()=>{setTarget('from');setDrawing(false);},[motion.preset]);
  useEffect(()=>{if(!previewing||!motionRef.current)return;let active=true;render(motionRef.current,scene,frame,{isCurrent:()=>active}).catch(e=>{if(active){setPlaying(false);setError(e.message);}});return()=>{active=false;};},[previewing,render,scene,frame,setPlaying]);
  const apply=next=>onChange(current=>({...current,cameraMotion:motionFromCrop(current.cameraMotion,next,target)}));
  const choose=(position)=>{setTarget(position);setDrawing(false);setPlaying(false);setFrame(position==='to'?toFrame:fromFrame);};
  const setZoom=value=>onChange(current=>{const m={...current.cameraMotion,scale:Number(value)};return {...current,cameraMotion:motionFromCrop(m,cropRect(m,target),target)};});
  const setTiming=(key,value)=>onChange(current=>({...current,cameraMotion:{...current.cameraMotion,[key]:Number(value)}}));
  const setStudio=(key,value)=>onChange(current=>({...current,cameraMotion:{...current.cameraMotion,[key]:value}}));
  const point=e=>{const bounds=e.currentTarget.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-bounds.left)/bounds.width)),y:Math.max(0,Math.min(1,(e.clientY-bounds.top)/bounds.height))};};
  const down=e=>{
    if(e.button!==0||!image)return;
    const start=point(e),corner=e.target.dataset.corner;
    const mode=drawing?'draw':corner?'resize':e.target.closest('.crop-box')?'move':'draw';
    drag.current={start,rect,mode,corner,motion:{...motion}};e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();
  };
  const move=e=>{
    const d=drag.current;if(!d)return;const p=point(e);
    apply(d.mode==='draw'?drawCrop(d.start,p):d.mode==='resize'?resizeCrop(d.rect,d.corner,p):moveCrop(d.rect,p.x-d.start.x,p.y-d.start.y));
  };
  const finish=e=>{const d=drag.current;if(!d)return;const p=point(e);if(d.mode==='draw'&&Math.hypot(p.x-d.start.x,p.y-d.start.y)<.008)apply(moveCrop(d.rect,p.x-d.rect.x-d.rect.size/2,p.y-d.rect.y-d.rect.size/2));else move(e);drag.current=null;setDrawing(false);e.currentTarget.releasePointerCapture(e.pointerId);};
  const cancel=()=>{if(drag.current){const original=drag.current.motion;onChange(current=>({...current,cameraMotion:original}));drag.current=null;}setDrawing(false);};
  const keyboard=e=>{
    const delta={ArrowLeft:[-.01,0],ArrowRight:[.01,0],ArrowUp:[0,-.01],ArrowDown:[0,.01]}[e.key];
    if(!delta)return;e.preventDefault();const step=e.shiftKey?5:1,corner=e.target.dataset.corner;
    if(corner){const p={x:rect.x+(corner.includes('e')?rect.size:0)+delta[0]*step,y:rect.y+(corner.includes('s')?rect.size:0)+delta[1]*step};apply(resizeCrop(rect,corner,p));}
    else apply(moveCrop(rect,delta[0]*step,delta[1]*step));
  };
  return <div className="camera-composer">
    <div className="studio-topbar">
      <div><span className="studio-kicker">Camera studio · {scene.id.replaceAll('-',' ')}</span><h2>Compose shot</h2></div>
      <div className="studio-actions"><button onClick={onRevert}>Revert</button><button className="studio-save" onClick={onSave}>Save</button><button onClick={()=>{setPlaying(false);onClose();}}>Done</button></div>
    </div>
    <div className={`composition-stage${previewing?' is-previewing':''}`}>
      <div className="composition-view">
        <div className="composition-source" data-ready={Boolean(image)} aria-label="Composition area" role="region" style={{aspectRatio:`${project.output.width}/${project.output.height}`,display:previewing?'none':undefined}} onPointerDown={down} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={()=>{drag.current=null;}}>
          <canvas ref={sourceRef} width={width} height={height}/>
          {image&&<div className="crop-box" tabIndex={0} role="group" aria-label={`${target==='to'?'To':'From'} framing`} onKeyDown={keyboard} style={{left:`${rect.x*100}%`,top:`${rect.y*100}%`,width:`${rect.size*100}%`,height:`${rect.size*100}%`,pointerEvents:drawing?'none':undefined}}><span className="crop-name">{pan?(target==='to'?'TO':'FROM'):'FRAME'}</span><span className="crop-thirds"/>{['nw','ne','sw','se'].map(corner=><button key={corner} data-corner={corner} className={`crop-handle ${corner}`} aria-label={`Resize ${corner}`} />)}</div>}
          {!image&&<span className="composition-loading">{error||'Loading source frame…'}</span>}
        </div>
        <div className="composition-motion-view" role="button" tabIndex={previewing?0:-1} aria-label="Select region in shot" title="Click to select a region" onClick={()=>{setPreviewing(false);setPlaying(false);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setPreviewing(false);setPlaying(false);}}} style={{display:previewing?'block':'none',aspectRatio:`${project.output.width}/${project.output.height}`}}><canvas ref={motionRef} width={project.output.width} height={project.output.height}/></div>
      </div>
      <aside className="composition-result" hidden={previewing}><strong>Framing preview</strong><canvas ref={cropRef} aria-label="Framing preview" width={width} height={height}/><p>{(motion.scale??1.8).toFixed(2)}× · {target==='to'?'Destination':'Starting focus'}</p><p>Focus <span className="composition-focus-x">{(rect.x+rect.size/2).toFixed(2)}</span>, {(rect.y+rect.size/2).toFixed(2)}</p><p>Drag over the recording to select an area, move the box, or resize a corner. Shift + arrows makes larger adjustments.</p></aside>
    </div>
    <div className="studio-timeline">
      <div className="studio-playback"><button onClick={()=>setFrame(0)} aria-label="Go to start">|‹</button><button onClick={()=>{if(!previewing)setPreviewing(true);setPlaying(!playing);}}>{playing?'Pause':'Play'}</button><button onClick={()=>{setPlaying(false);setFrame(timing.last);}} aria-label="Go to end">›|</button><span>{(frame/project.output.fps).toFixed(1)}s / {(timing.last/project.output.fps).toFixed(1)}s</span></div>
      <div className="studio-ruler"><span>0s</span><span>{(scene.durationFrames/project.output.fps/2).toFixed(1)}s</span><span>{(scene.durationFrames/project.output.fps).toFixed(1)}s</span></div>
      <input aria-label="Camera timeline" type="range" min="0" max={timing.last} value={frame} onChange={e=>{setPlaying(false);setFrame(Number(e.target.value));}}/>
      <div className="studio-position-track"><button className="studio-position" onClick={()=>{setPlaying(false);setPreviewing(true);setFrame(0);}}><small>01</small>Full screen</button><button className={`studio-position ${target==='from'?'active':''}`} aria-label="From position" onClick={()=>choose('from')}><small>02</small>{motion.preset==='return-full'?'Starting crop':'From'}</button>{pan&&<button className={`studio-position ${target==='to'?'active':''}`} aria-label="To position" onClick={()=>choose('to')}><small>03</small>To</button>}<button className="studio-position" onClick={()=>{setPlaying(false);setPreviewing(true);setFrame(timing.last);}}><small>{pan?'04':'03'}</small>Return</button></div>
    </div>
    <div className="studio-dock">
      <div className="composition-tabs" role="group" aria-label="Pan framing">{['from',...(pan?['to']:[])].map(value=><button key={value} aria-pressed={target===value} onClick={()=>choose(value)}>{value==='from'?'From':'To'}</button>)}</div>
      {previewing&&<button onClick={()=>{setPreviewing(false);setPlaying(false);}}>Select area</button>}
      <button aria-pressed={drawing} onClick={()=>{setPreviewing(false);setPlaying(false);setDrawing(value=>!value);}}>Draw area</button>
      <label className="studio-zoom">Zoom <input aria-label="Studio zoom" type="range" min="1" max="4" step=".05" value={motion.scale??1.8} onChange={e=>setZoom(e.target.value)}/><output>{(motion.scale??1.8).toFixed(2)}×</output></label>
      <label className="studio-screen-size">Screen <input aria-label="Screen size" type="range" min=".7" max="1.6" step=".05" value={motion.stageScale??1} onChange={e=>setStudio('stageScale',Number(e.target.value))}/><output>{(motion.stageScale??1).toFixed(2)}×</output></label>
      <div className="studio-rotations">{['X','Y','Z'].map(axis=><details key={axis} className="studio-rotate"><summary aria-label={`Rotation ${axis}`}><b>{axis}</b><small>{motion[`rotate${axis}`]??{X:14,Y:-9,Z:-3}[axis]}°</small></summary><div><label>Rotate {axis}<input aria-label={`Rotate ${axis}`} type="range" min="-35" max="35" step="1" value={motion[`rotate${axis}`]??{X:14,Y:-9,Z:-3}[axis]} onChange={e=>setStudio(`rotate${axis}`,Number(e.target.value))}/></label><button onClick={()=>setStudio(`rotate${axis}`,0)}>Reset {axis}</button></div></details>)}</div>
      <details className="studio-backdrop"><summary>Backdrop</summary><div>{[['paper','Paper'],['slate','Slate'],['theme','Theme']].map(([value,label])=><button key={value} aria-pressed={(motion.backdrop??'paper')===value} onClick={e=>{setStudio('backdrop',value);e.currentTarget.closest('details').open=false;}}>{label}</button>)}</div></details>
      <details className="composition-pace"><summary>Pace</summary><div><label>Move in <input aria-label="Camera entry frames" type="range" min="1" max={timing.last-timing.exitFrames-timing.minMiddleFrames} value={timing.entryFrames} onChange={e=>setTiming('entryFrames',e.target.value)}/><output>{timing.entryFrames}f</output></label><label>Move out <input aria-label="Camera exit frames" type="range" min="1" max={timing.last-timing.entryFrames-timing.minMiddleFrames} value={timing.exitFrames} onChange={e=>setTiming('exitFrames',e.target.value)}/><output>{timing.exitFrames}f</output></label></div></details>
      <button className="studio-preview" onClick={()=>{if(previewing){setPreviewing(false);setPlaying(false);}else{setFrame(0);setPreviewing(true);setPlaying(true);}}}>{previewing?'Edit framing':'Preview motion'}</button>
    </div>
    <div className="studio-scenes" aria-label="Scenes">{project.scenes.map((item,index)=><button key={item.id} className={item.id===scene.id?'active':''} onClick={()=>{setPlaying(false);onSelectScene(item.id);}}><small>{String(index+1).padStart(2,'0')}</small>{item.id.replaceAll('-',' ')}<em>{(item.durationFrames/project.output.fps).toFixed(1)}s</em></button>)}</div>
  </div>;
}
