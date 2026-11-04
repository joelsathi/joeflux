const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export function cropRect(motion,target='from') {
  const size=1/clamp(motion.scale??1.8,1,4);
  const x=target==='to'?motion.endFocusX??.7:motion.focusX??.5;
  const y=target==='to'?motion.endFocusY??.5:motion.focusY??.5;
  return {x:clamp(x-size/2,0,1-size),y:clamp(y-size/2,0,1-size),size};
}
export function moveCrop(rect,dx,dy) {
  return {...rect,x:clamp(rect.x+dx,0,1-rect.size),y:clamp(rect.y+dy,0,1-rect.size)};
}
export function drawCrop(start,end) {
  const size=clamp(Math.max(Math.abs(end.x-start.x),Math.abs(end.y-start.y)),.25,1);
  return {size,x:clamp(end.x<start.x?start.x-size:start.x,0,1-size),y:clamp(end.y<start.y?start.y-size:start.y,0,1-size)};
}
export function resizeCrop(rect,corner,point) {
  const west=corner.includes('w'),north=corner.includes('n');
  const anchor={x:rect.x+(west?rect.size:0),y:rect.y+(north?rect.size:0)};
  const max=Math.min(west?anchor.x:1-anchor.x,north?anchor.y:1-anchor.y);
  const size=clamp(Math.max((point.x-anchor.x)*(west?-1:1),(point.y-anchor.y)*(north?-1:1)),.25,max);
  return {x:west?anchor.x-size:anchor.x,y:north?anchor.y-size:anchor.y,size};
}
export function motionFromCrop(motion,rect,target='from') {
  const next={...motion,fit:'cover',scale:1/rect.size};
  next[target==='to'?'endFocusX':'focusX']=rect.x+rect.size/2;
  next[target==='to'?'endFocusY':'focusY']=rect.y+rect.size/2;
  const edge=rect.size/2;
  for(const key of ['focusX','focusY','endFocusX','endFocusY'])if(next[key]!==undefined)next[key]=clamp(next[key],edge,1-edge);
  return next;
}
