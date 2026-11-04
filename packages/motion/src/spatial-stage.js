import { drawFittedText } from './text.js';
import { CAMERA_DEFAULT } from './timing.js';
import { drawCameraMedia } from './media-framing.js';
import { createScreenCaption } from './screen-caption.js';

export function fitMediaRect(bounds,width,height) {
  const scale=Math.min(bounds.width/width,bounds.height/height);
  return {x:bounds.x+(bounds.width-width*scale)/2,y:bounds.y+(bounds.height-height*scale)/2,width:width*scale,height:height*scale};
}
export function planeTransform(pose={}) {
  const p={...CAMERA_DEFAULT,...pose};
  return `translate3d(${p.x}px, ${p.y}px, ${p.z}px) rotateX(${p.rotateX}deg) rotateY(${p.rotateY}deg) rotateZ(${p.rotateZ}deg) scale(${p.scale})`;
}
// screen.shadow presets; soft is the original floating-screen shadow.
export const SCREEN_SHADOW={none:'none',soft:'0 42px 95px #0b182c45, 0 3px 10px #0b182c22',deep:'0 64px 130px #0b182c66, 0 18px 38px #0b182c3d, 0 3px 10px #0b182c2e',floating:'0 120px 140px -40px #0b182c59, 0 44px 70px -26px #0b182c3d, 0 3px 10px #0b182c1f'};
const CHROME={
  'browser-light':{bar:'#eef1f5',line:'#d9dee6',pill:'#ffffff',text:'#4d5866',border:'#ffffff99'},
  'browser-dark':{bar:'#1c2330',line:'#2b3443',pill:'#2b3443',text:'#b6c1cf',border:'#ffffff29'},
  window:{bar:'#e6e8ec',line:'#cfd4db',text:'#3f4855',border:'#ffffff99'},
};
export const CHROME_BAR=40;
// The framed box fits the rect; below the bar the media keeps its aspect (contain) or is cropped (cover).
export function chromeLayout(rect,width,height,fit) {
  if(fit==='cover')return {box:rect,media:{width:rect.width,height:rect.height-CHROME_BAR}};
  const aspect=width/height,w=Math.min(rect.width,(rect.height-CHROME_BAR)*aspect),h=w/aspect;
  return {box:{x:rect.x+(rect.width-w)/2,y:rect.y+(rect.height-h-CHROME_BAR)/2,width:w,height:h+CHROME_BAR},media:{width:w,height:h}};
}
function chromeFrame(kind,title,box,font) {
  const c=CHROME[kind],frame=document.createElement('div'),bar=document.createElement('div'),label=document.createElement('span');
  frame.dataset.frame=kind;bar.dataset.frameBar='';label.dataset.frameTitle='';label.textContent=title??'';
  Object.assign(frame.style,{position:'absolute',left:`${box.x}px`,top:`${box.y}px`,width:`${box.width}px`,height:`${box.height}px`,overflow:'hidden',background:c.bar,border:`1px solid ${c.border}`});
  Object.assign(bar.style,{position:'relative',height:`${CHROME_BAR}px`,boxSizing:'border-box',display:'flex',alignItems:'center',gap:'8px',padding:'0 16px',borderBottom:`1px solid ${c.line}`});
  for(const color of ['#ff5f57','#febc2e','#28c840']){const dot=document.createElement('span');Object.assign(dot.style,{width:'12px',height:'12px',borderRadius:'50%',background:color});bar.append(dot);}
  Object.assign(label.style,{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%, -50%)',maxWidth:'56%',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',boxSizing:'border-box',textAlign:'center',color:c.text,font:`${c.pill?500:600} 15px ${font}`},
    c.pill?{minWidth:'32%',height:'26px',lineHeight:'26px',padding:'0 18px',borderRadius:'13px',background:c.pill}:{});
  bar.append(label);frame.append(bar);return frame;
}
const stages=new WeakMap();
export function renderSpatialStage(canvas,state,assets,scene) {
  let stage=stages.get(canvas);
  if(!stage) {
    stage=document.createElement('div');stage.dataset.spatialStage='';
    canvas.parentElement.style.position='relative';canvas.parentElement.append(stage);stages.set(canvas,stage);
    const resize=()=>{stage.style.transform=`scale(${canvas.getBoundingClientRect().width/1920})`;};
    new ResizeObserver(resize).observe(canvas);resize();
  }
  const height=canvas.height/(canvas.width/1920);
  Object.assign(stage.style,{position:'absolute',left:'0',top:'0',width:'1920px',height:`${height}px`,transformOrigin:'0 0',perspective:`${scene.perspective??1800}px`,perspectiveOrigin:'50% 50%',pointerEvents:'none'});
  stage.replaceChildren();
  for(const spec of state.recipe.cards??[]) {
    if(spec.pose.opacity<=0)continue;
    const card=document.createElement('canvas');card.width=spec.rect.width;card.height=spec.rect.height;
    Object.assign(card.style,{position:'absolute',left:`${spec.rect.x}px`,top:`${spec.rect.y}px`,width:`${spec.rect.width}px`,height:`${spec.rect.height}px`,transform:planeTransform(spec.pose),opacity:String(spec.pose.opacity),borderRadius:'20px',boxShadow:'0 20px 48px #0002'});
    const ctx=card.getContext('2d');ctx.fillStyle=state.theme.surface;ctx.fillRect(0,0,card.width,card.height);ctx.fillStyle=state.theme.accent;ctx.fillRect(28,30,40,5);
    drawFittedText(ctx,spec.label,{x:28,y:74,width:card.width-56,height:card.height-100},{font:state.theme.font,size:36,minSize:28,maxLines:2,color:state.theme.text,label:`Scene ${scene.id} supporting card`});stage.append(card);
  }
  for(const spec of state.recipe.planes) {
    const asset=assets[spec.key??spec.assetId];
    if(!asset || spec.pose.opacity<=0) continue;
    const s=scene.screen??{},naturalWidth=asset.naturalWidth??asset.width,naturalHeight=asset.naturalHeight??asset.height;
    const chrome=CHROME[s.frame]&&chromeLayout(spec.rect,naturalWidth,naturalHeight,s.fit);
    const rect=chrome?chrome.media:s.fit==='cover'?spec.rect:fitMediaRect(spec.rect,naturalWidth,naturalHeight);
    const plane=document.createElement('canvas');plane.dataset.asset=spec.assetId;
    const px=Math.max(1,canvas.width/1920);
    plane.width=Math.max(1,Math.round(rect.width*px));plane.height=Math.max(1,Math.round(rect.height*px));
    // The outer element (frame or bare media) carries the 3D pose, corners and shadow.
    const outer=chrome?chromeFrame(s.frame,s.frameTitle,chrome.box,state.theme.font):plane;
    Object.assign(plane.style,chrome?{display:'block',width:`${rect.width}px`,height:`${rect.height}px`}:{position:'absolute',left:`${rect.x}px`,top:`${rect.y}px`,width:`${rect.width}px`,height:`${rect.height}px`,display:'block'});
    Object.assign(outer.style,{transform:planeTransform(spec.pose),transformOrigin:'center center',opacity:String(spec.pose.opacity??1),borderRadius:`${spec.pose.radius??24}px`,boxShadow:SCREEN_SHADOW[s.shadow]??(s.presentation==='studio'?SCREEN_SHADOW.soft:spec.pose.radius?'0 24px 64px #0003':'none'),clipPath:spec.clipRight?`inset(0 ${spec.clipRight}% 0 0)`:'none'});
    if(!chrome&&s.presentation==='studio')plane.style.border='1px solid #ffffff99';
    const ctx=plane.getContext('2d'),zoom=state.zoom,w=plane.width,h=plane.height;
    drawCameraMedia(ctx,asset,w,h,zoom,s.fit);
    if(chrome)outer.append(plane);
    stage.append(outer);
    if(state.recipe.captionAlpha>.01 && spec.pose.opacity>.01 && (scene.params?.title||scene.params?.subtitle||scene.params?.eyebrow)) {
      const box=outer.getBoundingClientRect(),origin=stage.getBoundingClientRect(),scale=canvas.getBoundingClientRect().width/1920,copy=state.recipe.copyRect;
      const caption={left:origin.left+copy.x*scale,right:origin.left+(copy.x+copy.width)*scale,top:origin.top+copy.y*scale,bottom:origin.top+(copy.y+copy.height)*scale};
      if(box.left<caption.right&&box.right>caption.left&&box.top<caption.bottom&&box.bottom>caption.top)throw new Error(`Scene ${scene.id}: screen overlaps visible copy at frame ${state.frame}; reduce camera translation/scale or exit the caption first.`);
    }
  }
  if(scene.kind==='screen'&&scene.caption?.text)stage.append(createScreenCaption(scene,state.frame,state.theme.font));
  if(state.recipe.accentMask?.width>0 && state.progress<1) {
    const stripe=document.createElement('div');Object.assign(stripe.style,{position:'absolute',inset:'0',left:`${state.recipe.accentMask.left}%`,width:`${state.recipe.accentMask.width}%`,background:state.theme.accent});stage.append(stripe);
  }
  if(assets.__brand) {
    const {image,alt,placement:{corner,width,margin:[x,y]}}=assets.__brand,[vertical,horizontal]=corner.split('-');
    const logo=document.createElement('img');logo.src=image.src;logo.alt=alt;logo.dataset.brandLogo='';
    Object.assign(logo.style,{position:'absolute',[horizontal]:`${x}px`,[vertical]:`${y}px`,width:`${width}px`,height:'auto'});stage.append(logo);
  }
  return stage;
}
export function clearSpatialStage(canvas) {stages.get(canvas)?.replaceChildren();}
