import { ease, evaluateCamera, CAMERA_DEFAULT } from '../../motion/src/timing.js';
import { layoutScene } from '../../motion/src/layout.js';
import { evaluateShots } from '../../motion/src/camera-motion.js';

export const RECIPE_NAMES=['screen-handoff','product-reveal','problem-to-product','chapter-opener','side-slide','accent-mask'];
export const CONTINUOUS_RECIPES=['screen-handoff','product-reveal','side-slide'];
const ramp=(t,a,b)=>ease((t-a)/(b-a),'smootherstep');
const mix=(a,b,t)=>Object.fromEntries(Object.keys(a).map(key=>[key,a[key]+(b[key]-a[key])*t]));
const flat={...CAMERA_DEFAULT,radius:0};

// Shared by evaluation, validation and the preview's hold control.
export function continuousHandoffTiming(durationFrames,requestedHold) {
  const last=Math.max(0,durationFrames-1),captionStart=Math.round(last*.4);
  const fadeFrames=Math.max(1,Math.round(last*.08));
  const maxHoldFrames=Math.max(0,Math.floor(last*.82)-captionStart-fadeFrames);
  const defaultHoldFrames=Math.min(maxHoldFrames,Math.round(last*.28));
  const holdFrames=Math.max(0,Math.min(maxHoldFrames,requestedHold??defaultHoldFrames));
  const captionEnd=captionStart+holdFrames;
  return {defaultHoldFrames,maxHoldFrames,captionStart,captionEnd,fadeInStart:last*.3,
    arriveStart:captionEnd+fadeFrames,arriveEnd:last*.97,
    swapStart:Math.max(last*.3,captionEnd-last*.1),swapEnd:captionEnd};
}
const frameRamp=(frame,start,end)=>end<=start?Number(frame>=end):ramp(frame,start,end);

export function evaluateRecipe(scene,frame,output={width:1920,height:1080,fps:24}) {
  const t=scene.durationFrames<=1?1:frame/(scene.durationFrames-1),p=scene.params??{};
  const full={x:0,y:0,width:output.width,height:output.height};
  const layout=layoutScene({preset:'recorded-showcase'},output);
  const camera=evaluateCamera(scene.camera,frame,scene.durationFrames);
  const plane=(assetId,rect=full,pose=flat,extra={})=>({assetId,rect,pose:Object.fromEntries(Object.entries(pose).map(([key,value])=>[key,Object.is(value,-0)?0:value])),...extra});
  const base={planes:[],captionAlpha:ramp(t,.07,.25),copyRect:layout.copyRect,phase:'title'};
  if(scene.kind==='screen'){
    const {pose}=evaluateShots(scene.camera,frame,scene.durationFrames),s=scene.screen,studio=s.presentation==='studio',[rx,ry,rz]=s.tilt??[0,0,0];
    const pad=s.padding??.13,[ox,oy]=s.offset??[0,0];
    const rect=studio?{x:output.width*(pad+ox),y:output.height*(pad+oy),width:output.width*(1-2*pad),height:output.height*(1-2*pad)}:full;
    return {...base,captionAlpha:0,planes:[plane(s.asset,rect,{...pose,scale:s.size??1,rotateX:rx+pose.rotateX,rotateY:ry+pose.rotateY,rotateZ:rz+pose.rotateZ,radius:s.radius??(studio?22:pose.radius)})]};
  }
  if(scene.connectionStyle==='continuous') {
    if(scene.preset==='screen-handoff') {
      // Retreat and tilt are one gesture. Exchange content on the same plane,
      // then advance only after the caption has cleared the screen's path.
      const timing=continuousHandoffTiming(scene.durationFrames,scene.timing?.holdFrames);
      const leave=ramp(t,.04,.3),arrive=frameRamp(frame,timing.arriveStart,timing.arriveEnd);
      const depth=leave*(1-arrive),swap=frameRamp(frame,timing.swapStart,timing.swapEnd);
      const pose={...flat,x:-610*depth,y:70*depth,z:-1550*depth,rotateY:14*depth,radius:24*depth};
      const captionAlpha=frameRamp(frame,timing.fadeInStart,timing.captionStart)*(1-frameRamp(frame,timing.captionEnd,timing.arriveStart));
      return {...base,phase:'handoff',captionAlpha,copyRect:{x:output.width*.62,y:output.height*.29,width:output.width*.28,height:output.height*.5},planes:[
        plane(p.outgoingAsset??p.asset,full,{...pose,opacity:swap===1?0:1},{sourceSeconds:p.outgoingSeconds??0}),
        plane(p.incomingAsset??p.asset,full,{...pose,opacity:swap},{sourceSeconds:p.incomingSeconds??0}),
      ]};
    }
    if(scene.preset==='product-reveal') {
      const settle=ramp(t,.04,.3),expand=ramp(t,.76,.97),amount=settle*(1-expand);
      return {...base,phase:'reframe',captionAlpha:ramp(t,.32,.42)*(1-ramp(t,.66,.74)),planes:[
        plane(p.asset,mix(full,layout.mediaRect,amount),{...flat,rotateY:-10*amount,radius:24*amount}),
      ]};
    }
    if(scene.preset==='side-slide') {
      const amount=ramp(t,.14,.86);
      return {...base,phase:'transition',captionAlpha:0,planes:[
        plane(p.outgoingAsset??p.asset,full,{...flat,x:-output.width*amount},{sourceSeconds:p.outgoingSeconds??0}),
        plane(p.incomingAsset??p.asset,full,{...flat,x:output.width*(1-amount)},{sourceSeconds:p.incomingSeconds??0}),
      ]};
    }
  }
  if(scene.preset==='screen-handoff') {
    const leave=ramp(t,0,1.25/6),turn=ramp(t,1.25/6,2.25/6);
    const arriveStart=scene.timing?.holdFrames===undefined?4.3/6:Math.min(.84,.375+scene.timing.holdFrames/Math.max(1,scene.durationFrames-1));
    const arrive=ramp(t,arriveStart,.955),fade=ramp(t,arriveStart-.06,arriveStart);
    const outgoing={...flat,x:-610*leave,y:90*leave,z:-1550*leave,rotateY:14*turn,radius:24*leave,opacity:1-ramp(t,arriveStart,Math.min(.97,arriveStart+.15))};
    const incoming={...flat,x:-570*(1-arrive),y:80*(1-arrive),z:-1500*(1-arrive),rotateY:14*(1-arrive),radius:24*(1-arrive),opacity:ramp(t,arriveStart,arriveStart+.04)};
    return {...base,phase:'handoff',captionAlpha:ramp(t,2/6,2.4/6)*(1-fade),cards:(p.items??['Context','Policy','Action']).slice(0,3).map((label,index)=>({label,rect:{x:750,y:420,width:420,height:240},pose:{...flat,x:-1000+index*480,y:-650+index*65,z:-1650-index*120,rotateY:14,radius:20,opacity:ramp(t,1.3/6,2.1/6)*(1-fade)}})),copyRect:{x:output.width*.62,y:output.height*.29,width:output.width*.28,height:output.height*.5},planes:[
      plane(p.outgoingAsset??p.asset,full,outgoing,{sourceSeconds:p.outgoingSeconds??0}),
      plane(p.incomingAsset??p.asset,full,incoming,{sourceSeconds:p.incomingSeconds??0}),
    ]};
  }
  if(scene.preset==='product-reveal') {
    const enter=ramp(t,.24,.48),expand=ramp(t,.76,.96);
    const small={...layout.mediaRect};
    return {...base,phase:'reveal',captionAlpha:ramp(t,.06,.2)*(1-ramp(t,.62,.72)),planes:[plane(p.asset,mix(small,full,expand),{...flat,x:60*(1-enter)*(1-expand),z:-260*(1-enter)*(1-expand),rotateY:-15*(1-enter)*(1-expand),opacity:enter,radius:24*(1-expand)})]};
  }
  if(scene.preset==='problem-to-product') {
    const benefit=t>=.53,enter=ramp(t,.7,.94);
    return {...base,phase:benefit?'benefit':'problem',title:benefit?(p.benefit??p.title):p.title,copyRect:benefit?layout.copyRect:{x:160,y:240,width:output.width-320,height:300},captionAlpha:benefit?ramp(t,.53,.63):ramp(t,.04,.16)*(1-ramp(t,.45,.53)),cardsAlpha:ramp(t,.18,.28)*(1-ramp(t,.45,.53)),planes:[plane(p.asset,layout.mediaRect,{...flat,x:700*(1-enter),opacity:enter,rotateY:-12*(1-enter),radius:24})]};
  }
  if(scene.preset==='chapter-opener') {
    const enter=ramp(t,.78,1);
    return {...base,phase:'chapter',captionAlpha:ramp(t,.12,.28)*(1-ramp(t,.65,.76)),copyRect:{x:200,y:360,width:output.width-400,height:350},accent:ramp(t,0,.26),planes:p.asset?[plane(p.asset,full,{...flat,x:output.width*(1-enter),opacity:enter})]:[]};
  }
  if(scene.preset==='side-slide'||scene.preset==='accent-mask') {
    const amount=ramp(t,.05,.95),mask=scene.preset==='accent-mask';
    return {...base,phase:'transition',captionAlpha:0,accentMask:mask?{left:Math.max(0,amount-.07)*100,width:Math.min(.07,amount)*100}:null,planes:[
      plane(p.outgoingAsset??p.asset,full,{...flat,x:mask?0:-output.width*amount},{sourceSeconds:p.outgoingSeconds??0}),
      plane(p.incomingAsset??p.asset,full,{...flat,x:mask?0:output.width*(1-amount)},{clipRight:mask?(1-amount)*100:0,sourceSeconds:p.incomingSeconds??0}),
    ]};
  }
  if(['recorded-showcase','focus-transition'].includes(scene.preset)) return {...base,planes:[plane(p.asset,scene.composition==='full'?full:layout.mediaRect,{...camera,radius:scene.composition==='full'?0:24})],captionAlpha:scene.composition==='full'?0:base.captionAlpha};
  return base;
}
