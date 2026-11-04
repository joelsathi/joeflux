import {CAMERA_MOTIONS,cameraMotionTiming} from '../../../packages/motion/src/camera-motion.js';

export function CameraControls({scene,onChange,onCompose}){
 const m=scene.cameraMotion,t=cameraMotionTiming(scene);
 const change=(key,value)=>onChange(current=>({...current,cameraMotion:{...current.cameraMotion,[key]:Number(value)}}));
 const field=(label,key,value,min,max,step)=><label key={key}>{label}<input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={event=>change(key,event.target.value)}/><output>{Number(value).toFixed(step<1?2:0)}</output></label>;
 return <>
  <label>Camera motion<select aria-label="Camera motion" value={m?.preset??'manual'} onChange={event=>onChange(current=>{
   if(event.target.value==='manual'){delete current.cameraMotion;return current;}
   delete current.camera;delete current.zoom;
   return {...current,cameraMotion:{preset:event.target.value}};
  })}><option value="manual">Manual (existing)</option>{CAMERA_MOTIONS.map(preset=><option key={preset}>{preset}</option>)}</select></label>
  {m&&<><p>Presets use a fullscreen recording without captions. Revert restores unsaved manual settings.</p>
   {['focus-zoom','detail-pan','return-full'].includes(m.preset)&&<>
    <button className="compose-button" onClick={onCompose}>Compose shot</button>
    {field('Camera zoom','scale',m.scale??1.8,1,4,.05)}
    {field('Camera focus X','focusX',m.focusX??.5,0,1,.01)}
    {field('Camera focus Y','focusY',m.focusY??.5,0,1,.01)}
   </>}
   {m.preset==='detail-pan'&&<>{field('Pan destination X','endFocusX',m.endFocusX??.7,0,1,.01)}{field('Pan destination Y','endFocusY',m.endFocusY??.5,0,1,.01)}</>}
   {['orbit','tilt-settle'].includes(m.preset)&&field('Motion strength','strength',m.strength??1,.1,1.5,.05)}
   {m.preset!=='return-full'&&field('Camera entry frames','entryFrames',t.entryFrames,1,t.last-t.exitFrames-t.minMiddleFrames,1)}
   {m.preset!=='tilt-settle'&&field('Camera exit frames','exitFrames',t.exitFrames,1,t.last-t.entryFrames-t.minMiddleFrames,1)}
  </>}
 </>;
}
