import { CAMERA_DEFAULT } from './timing.js';
import {compositionErrors} from '../../composition/src/model.js';
import {sourceMomentErrors} from './source-moments.js';
import {captionReadingFrames,minimumCaptionReadingHold} from './screen-caption.js';
import { CONTINUOUS_RECIPES, continuousHandoffTiming } from '../../presets/src/recipes.js';
import {BACKGROUND_STYLES} from './background.js';
import {getPackBackground} from '../../presets/src/background-packs.js';
import {getBrandKit} from '../../presets/src/brand-kits.js';
import {TEXT_TEMPLATES,TEXT_PLACEMENTS,textTiming,minimumReadingHold} from './text-animation.js';
import {CAMERA_MOTIONS,cameraMotionTiming} from './camera-motion.js';
import {ArtworkLayer,Compositor,MotionBlur,screenSceneErrors} from '../../schema/src/scene.js';
import {TRANSITION_TYPES} from '../../presets/src/transitions.js';
export function sceneErrors(scene,project) {
  const errors=[],fail=message=>errors.push(`Scene "${scene.id}": ${message}`),duration=scene.durationFrames;
  const finite=(value,min=0,max=Infinity)=>Number.isFinite(value)&&value>=min&&value<=max;
  const range=(entries,label,inclusive=false)=>{
    let previousEnd=-1;
    if(!Array.isArray(entries)){fail(`${label} must be an array.`);return;}
    for(const entry of entries){
      const a=entry.outputStart??entry.startFrame,b=entry.outputEnd??entry.endFrame;
      if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<a+(inclusive?0:1)||b>duration-(inclusive?1:0)||a<previousEnd) fail(`${label} must have sorted, nonoverlapping frame ranges within the scene.`);
      previousEnd=b+(inclusive?1:0);
    }
  };
  const p=scene.playback??{};
  for(const issue of sourceMomentErrors(p,{fps:project.output?.fps??24,durationFrames:duration}))fail(issue);
  if(scene.kind!==undefined){if(scene.kind==='composition')errors.push(...compositionErrors(scene,project));else if(scene.kind!=='screen')fail('unknown scene kind.');else for(const issue of screenSceneErrors(scene))fail(issue);}
  if(scene.cameraMotion!==undefined){
    const m=scene.cameraMotion;
    if(!m||typeof m!=='object'||Array.isArray(m)||!CAMERA_MOTIONS.includes(m.preset))fail('unknown camera motion preset.');
    else{
      const t=cameraMotionTiming(scene);
      if(!['recorded-showcase','focus-transition'].includes(scene.preset))fail('camera motion needs a recorded-showcase or focus-transition scene.');
      if(!scene.params?.asset)fail('camera motion needs a media asset.');
      if(scene.camera||scene.zoom)fail('camera motion cannot combine with manual camera/zoom tracks; choose one mode.');
      if(!Number.isInteger(t.entryFrames)||!Number.isInteger(t.exitFrames)||t.entryFrames<1||t.exitFrames<1||t.entryFrames+t.exitFrames+t.minMiddleFrames>t.last)fail(`camera entry and exit must use whole frames and reserve ${t.minMiddleFrames} middle frames inside the scene.`);
      for(const key of ['focusX','focusY','endFocusX','endFocusY'])if(m[key]!==undefined&&!finite(m[key],0,1))fail(`camera motion ${key} must be 0–1.`);
      if(!finite(m.scale??1.8,1,4)||!finite(m.strength??1,.1,1.5))fail('camera motion zoom must be 1–4 and strength 0.1–1.5.');
      if(m.fit!==undefined&&!['contain','cover'].includes(m.fit))fail('camera motion fit must be contain or cover.');
      if(m.presentation!==undefined&&!['fullscreen','studio'].includes(m.presentation))fail('camera motion presentation must be fullscreen or studio.');
      if(m.backdrop!==undefined&&!['theme','paper','slate'].includes(m.backdrop))fail('camera motion backdrop must be theme, paper or slate.');
      for(const key of ['rotateX','rotateY','rotateZ'])if(m[key]!==undefined&&!finite(m[key],-35,35))fail(`camera motion ${key} must be -35–35 degrees.`);
      if(m.stageScale!==undefined&&!finite(m.stageScale,.7,1.6))fail('studio screen size must be 0.7–1.6.');
    }
  }
  if(scene.background!==undefined){
    const b=scene.background;
    if(!b||typeof b!=='object'||Array.isArray(b)||!BACKGROUND_STYLES.includes(b.style))fail('background needs a known style.');
    else if(!finite(b.intensity??.5,0,1)||!finite(b.speed??1,.1,2))fail('background intensity must be 0–1 and speed 0.1–2.');
    if(b?.image!==undefined&&!getPackBackground(b.image))fail(`unknown background image ${b.image}.`);
  }
  if(scene.textAnimation!==undefined&&scene.preset!=='text-template')fail('textAnimation requires the text-template preset.');
  if(scene.preset==='text-template'){
    const a=scene.textAnimation??{},timing=textTiming(scene);
    if(typeof a!=='object'||Array.isArray(a)||!TEXT_TEMPLATES.includes(a.template??'masked-lines'))fail('unknown text animation template.');
    if(duration<3||!Number.isInteger(timing.entryFrames)||timing.entryFrames<1||!Number.isInteger(timing.exitFrames)||timing.exitFrames<1||!Number.isInteger(timing.holdFrames)||timing.holdFrames<0||timing.end>duration-1)fail('text entrance/hold/exit must use whole frames and fit inside the scene.');
    if(timing.holdFrames<minimumReadingHold(scene,project.output?.fps??24))fail('text reading hold is too short for this copy; lengthen the scene or shorten the text.');
    if(a.placement!==undefined&&!TEXT_PLACEMENTS.includes(a.placement))fail('unknown text placement.');
    if(typeof scene.params?.title!=='string'||!scene.params.title.trim())fail('text animation needs a nonempty title.');
    for(const key of ['subtitle','eyebrow'])if(scene.params?.[key]!==undefined&&typeof scene.params[key]!=='string')fail(`text ${key} must be a string.`);
    if(a.highlight!==undefined&&(typeof a.highlight!=='string'||!a.highlight.trim()||a.highlight.trim().split(/\s+/).length!==1))fail('highlight must be one word.');
  }
  if(scene.caption!==undefined&&scene.kind!=='screen')fail('screen captions require a screen scene.');
  if(scene.kind==='screen'&&typeof scene.caption?.text==='string'){
    const fps=project.output?.fps??24,hold=captionReadingFrames(scene,project.scenes??[]),minimum=minimumCaptionReadingHold(scene.caption.text,fps);
    if(hold<minimum)fail(`caption reading hold is too short for this copy: ${hold} of ${minimum} frames at ${fps} fps, not counting frames blended by transitions; lengthen the scene, or shorten the caption or its transitions.`);
  }
  if(scene.layers!==undefined){
    if(!Array.isArray(scene.layers)||scene.layers.length>12)fail('artwork layers must be an array of at most 12.');
    else for(const [index,layer] of scene.layers.entries()){
      if(!ArtworkLayer.safeParse(layer).success){fail(`artwork layer ${index+1} has invalid bounds, timing, opacity or type.`);continue;}
      if(layer.x+layer.width>1||layer.y+layer.height>1)fail(`artwork layer ${index+1} exceeds the stage.`);
      if((layer.startFrame??0)>=duration||(layer.endFrame!==undefined&&(layer.endFrame<= (layer.startFrame??0)||layer.endFrame>duration)))fail(`artwork layer ${index+1} timing must fit its scene.`);
      const file=project.assets?.[layer.asset];
      if(!file)fail(`artwork layer ${index+1} is missing declared asset "${layer.asset}".`);
      else if(!file.toLowerCase().endsWith(layer.type==='svg'?'.svg':'.json'))fail(`artwork layer ${index+1} needs a ${layer.type==='svg'?'SVG':'Bodymovin JSON'} asset.`);
    }
  }
  if(scene.brand!==undefined&&scene.brand!=='none'&&!getBrandKit(scene.brand))fail(`unknown brand kit ${scene.brand}. Run pnpm run brand -- sync after adding a kit.`);
  if(scene.compositor!==undefined&&!Compositor.safeParse(scene.compositor).success)fail('compositor needs a known look and depth/light values from 0 to 1.');
  if(scene.connectionStyle!==undefined && (!['classic','continuous'].includes(scene.connectionStyle)||!CONTINUOUS_RECIPES.includes(scene.preset)))fail('connectionStyle must be classic or continuous on screen-handoff, product-reveal or side-slide.');
  if(p.sourceFps!==undefined&&!finite(p.sourceFps,.001))fail('sourceFps must be positive.');
  for(const key of ['startSeconds','endSeconds','startFrame','endFrame'])if(p[key]!==undefined&&!finite(p[key]))fail(`${key} must be nonnegative and finite.`);
  const fps=p.sourceFps??project.output?.fps??24;
  if((p.endSeconds??(p.endFrame===undefined?Infinity:p.endFrame/fps))<(p.startSeconds??(p.startFrame??0)/fps))fail('trim end must follow trim start.');
  range(p.segments??[],'speed segments');range(p.holds??[],'holds',true);
  for(const hold of p.holds??[])for(const key of ['sourceFrame','sourceSeconds'])if(hold[key]!==undefined&&!finite(hold[key]))fail(`hold ${key} must be nonnegative and finite.`);
  const camera=scene.camera??{};
  for(const pose of [camera.start,camera.end,...(camera.keyframes??[])].filter(Boolean))for(const key of Object.keys(CAMERA_DEFAULT)){
    if(pose[key]!==undefined&&!finite(pose[key],['scale'].includes(key)?.001:['opacity','radius','focusX','focusY'].includes(key)?0:-Infinity,['opacity','focusX','focusY'].includes(key)?1:Infinity))fail(`camera ${key} is out of range.`);
  }
  let previous=-1;
  for(const key of camera.keyframes??[]){if(!Number.isInteger(key.frame)||key.frame<=previous||key.frame>=duration)fail('camera keyframes must be sorted and within the scene.');previous=key.frame;}
  if(scene.perspective!==undefined&&!finite(scene.perspective,1))fail('perspective must be positive.');
  // Screen scenes check motionBlur through their schema.
  if(scene.motionBlur!==undefined&&scene.kind!=='screen'&&!MotionBlur.safeParse(scene.motionBlur).success)fail('motionBlur needs whole-number samples 2–16 and shutter 0.1–1.');
  if(scene.zoom){
    const z=scene.zoom;
    range([z],'zoom');
    if(!finite(z.scale??1,1,8)||!finite(z.focusX??.5,0,1)||!finite(z.focusY??.5,0,1))fail('zoom scale/focus is out of range.');
    if(!finite(z.entryFrames??12,1)||!finite(z.exitFrames??12,1)||(z.entryFrames??12)+(z.exitFrames??12)>z.endFrame-z.startFrame)fail('zoom must leave room for both entry and exit.');
    let last=-1;for(const point of z.focusKeyframes??[]){if(!Number.isInteger(point.frame)||point.frame<=last||point.frame<z.startFrame||point.frame>z.endFrame||!finite(point.focusX,0,1)||!finite(point.focusY,0,1))fail('zoom focus keyframes must be ordered and inside the zoom region.');last=point.frame;}
  }
  if(scene.params?.items && (!Array.isArray(scene.params.items)||scene.params.items.length>4))fail('at most four items fit; split extra items into another scene.');
  for(const name of [scene.params?.asset,scene.screen?.asset,scene.params?.outgoingAsset,scene.params?.incomingAsset,...(scene.assetDependencies??[])].filter(Boolean))if(!project.assets?.[name])fail(`missing declared asset "${name}".`);
  if(scene.transition && !TRANSITION_TYPES.includes(scene.transition.type))fail(`unknown transition. Use ${TRANSITION_TYPES.join(', ')}.`);
  if(scene.transition?.type!=='cut'&&scene.transition?.frames>=duration)fail('transition must be shorter than its scene.');
  if(scene.timing?.holdFrames!==undefined&&!finite(scene.timing.holdFrames,0,duration))fail('caption hold must fit the scene.');
  if(scene.connectionStyle==='continuous'&&scene.preset==='screen-handoff'&&scene.timing?.holdFrames!==undefined){
    const max=continuousHandoffTiming(duration).maxHoldFrames;
    if(!Number.isInteger(scene.timing.holdFrames)||!finite(scene.timing.holdFrames,0,max))fail(`continuous caption hold must be a whole number from 0 to ${max} frames; leave room for entry and exit.`);
  }
  return errors;
}
