import {CAMERA_DEFAULT,ease} from './timing.js';
export const CAMERA_MOTIONS=['focus-zoom','detail-pan','orbit','tilt-settle','return-full'];
export function cameraMotionTiming(scene){
 const last=scene.durationFrames-1,m=scene.cameraMotion??{};
 return {last,minMiddleFrames:['detail-pan','orbit'].includes(m.preset)?8:0,entryFrames:m.entryFrames??Math.max(1,Math.round(last*.2)),exitFrames:m.exitFrames??Math.max(1,Math.round(last*.2))};
}
const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));

// Legacy presets as shot lists. Consecutive identical shots are holds.
export function cameraShots(m,durationFrames){
 const {last,entryFrames:e,exitFrames:x}=cameraMotionTiming({durationFrames,cameraMotion:m}),hold=last-e-x,s=m.strength??1;
 const shot=(frame,view={})=>({at:frame/last,...view});
 const from={focus:[m.focusX??.5,m.focusY??.5],zoom:m.scale??1.8},to={focus:[m.endFocusX??.7,m.endFocusY??.5],zoom:m.scale??1.8};
 const side=d=>({pose:{x:24*s*d,z:-320*s,rotateX:3*s,rotateY:8*s*d,radius:24}});
 if(m.preset==='focus-zoom')return [shot(0),shot(e,from),shot(last-x,from),shot(last)];
 if(m.preset==='detail-pan')return [shot(0),shot(e,from),shot(e+hold*.25,from),shot(e+hold*.75,to),shot(last-x,to),shot(last)];
 if(m.preset==='return-full')return [shot(0,from),shot(last-x,from),shot(last)];
 if(m.preset==='orbit')return [shot(0),shot(e,side(-1)),shot(e+hold*.25,side(-1)),shot(e+hold*.75,side(1)),shot(last-x,side(1)),shot(last)];
 if(m.preset==='tilt-settle')return [shot(0,{pose:{z:-460*s,rotateX:12*s,rotateY:-10*s,radius:24}}),shot(e),shot(last)];
 throw new Error(`Unknown camera motion "${m.preset}".`);
}

const POSE=['x','y','z','rotateX','rotateY','rotateZ','radius'];
function channels(shot){
 // Bound each focus before interpolation so moves never stop early at an edge.
 const zoom=shot.zoom??1,bound=v=>clamp(v,.5/zoom,1-.5/zoom),[fx,fy]=shot.focus??[.5,.5];
 return {scale:zoom,zoomX:(.5-bound(fx))*zoom,zoomY:(.5-bound(fy))*zoom,...Object.fromEntries(POSE.map(k=>[k,shot.pose?.[k]??0]))};
}
// Flow: a run is a stretch of keys with no hold or cut between them. Inside a run of
// two or more moves each channel follows a monotone cubic Hermite curve (Fritsch–Butland
// tangents, at rest at both ends), so the camera keeps moving through interior shots
// without overshooting them. A single move keeps its easing.
function flowValues(keys,right,frame){
 const moving=i=>keys[i+1].frame>keys[i].frame&&Object.keys(keys[i].values).some(k=>keys[i].values[k]!==keys[i+1].values[k]);
 if(!moving(right-1))return null;
 let s=right-1,e=right;
 while(s>0&&moving(s-1))s--;
 while(e<keys.length-1&&moving(e))e++;
 if(e-s<2)return null;
 const slope=(i,k)=>(keys[i+1].values[k]-keys[i].values[k])/(keys[i+1].frame-keys[i].frame);
 const tangent=(i,k)=>{
  if(i===s||i===e)return 0;
  const d0=slope(i-1,k),d1=slope(i,k);
  if(d0*d1<=0)return 0;
  const h0=keys[i].frame-keys[i-1].frame,h1=keys[i+1].frame-keys[i].frame,w0=2*h1+h0,w1=h1+2*h0;
  return (w0+w1)/(w0/d0+w1/d1);
 };
 const a=keys[right-1],b=keys[right],h=b.frame-a.frame,t=(frame-a.frame)/h,t2=t*t,t3=t2*t;
 return Object.fromEntries(Object.keys(a.values).map(k=>[k,(2*t3-3*t2+1)*a.values[k]+(t3-2*t2+t)*h*tangent(right-1,k)+(3*t2-2*t3)*b.values[k]+(t3-t2)*h*tangent(right,k)]));
}
// Keep the recording covering the screen when channels leave their shared straight path.
function cover(v){
 const scale=Math.max(1,v.scale),edge=(scale-1)/2;
 return {...v,scale,zoomX:clamp(v.zoomX,-edge,edge),zoomY:clamp(v.zoomY,-edge,edge),radius:Math.max(0,v.radius)};
}
export function evaluateShots(camera,frame,durationFrames){
 const last=durationFrames-1,keys=camera.shots.map(shot=>({frame:shot.at*last,ease:shot.ease,values:channels(shot)}));
 const right=keys.findIndex(key=>key.frame>frame);
 let v=keys[right<0?keys.length-1:0].values;
 if(right>0){
  const a=keys[right-1],b=keys[right],kind=b.ease??camera.ease??'smootherstep',flowing=camera.flow&&flowValues(keys,right,frame);
  if(flowing)v=flowing;
  else{const t=ease((frame-a.frame)/(b.frame-a.frame),kind);v=Object.fromEntries(Object.keys(a.values).map(k=>[k,a.values[k]+(b.values[k]-a.values[k])*t]));}
  if(flowing||kind==='spring')v=cover(v);
 }
 const pose={...CAMERA_DEFAULT,...Object.fromEntries(POSE.map(k=>[k,v[k]||0]))};
 if(camera.drift&&frame>0&&frame<last){
  const t=frame/last,env=Math.sin(Math.PI*t),d=camera.drift;
  pose.rotateY+=d*6*Math.sin(2*Math.PI*t)*env;pose.rotateX+=d*2.5*env;pose.z-=d*120*env;
 }
 return {pose,zoom:{scale:v.scale,x:v.zoomX||0,y:v.zoomY||0,strength:v.scale-1}};
}

// Focus areas ("stops") are the editing view of a shot list: distinct
// consecutive framings, in visiting order.
const framing = (shot) => JSON.stringify([shot.focus ?? null, shot.zoom ?? 1]);
export function cameraStops(shots) {
 return cameraAreas(shots).map(({focus,zoom})=>({focus,zoom}));
}
// A visit is a contiguous range, not every occurrence of the same coordinates.
export function cameraAreas(shots) {
 const areas=[];
 shots.forEach((shot,index)=>{
  if(!shot.focus)return;
  const last=areas.at(-1);
  if(last&&last.end===index-1&&framing(shots[last.start])===framing(shot)&&shots[last.start].areaId===shot.areaId)last.end=index;
  else areas.push({start:index,end:index,focus:shot.focus,zoom:shot.zoom??1});
 });
 return areas;
}
// Even pacing: each stop gets one unit to arrive and 1.5 to hold; full-view ends get half a unit of hold.
export function shotsFromStops(stops, { startFull = true, returnToFull = true } = {}) {
 if (!stops.length) return [{ at: 0 }];
 const marks = []; let t = 0;
 if (startFull) { marks.push([0, null]); t = .5; marks.push([t, null]); }
 stops.forEach((stop, index) => { if (index || startFull) t += 1; const view={focus:stop.focus,zoom:stop.zoom,areaId:`area-${index+1}`}; marks.push([t, view]); const hold=stop.hold??1.5; if(hold>0){t+=hold;marks.push([t,view]);} });
 if (returnToFull) { t += 1; marks.push([t, null]); }
 return marks.map(([at, stop]) => ({ at: t?Math.round(at / t * 1e4) / 1e4:0, ...(stop??{}) }));
}
// Reframe one stop in place, keeping every shot's timing.
export function reframeStop(shots, index, stop) {
 const target = cameraAreas(shots)[index];
 const areaId=target&&(shots[target.start].areaId??nextAreaId(shots));
 return shots.map((shot,i) => target&&i>=target.start&&i<=target.end ? { ...shot, areaId, focus: stop.focus, zoom: stop.zoom } : shot);
}
function nextAreaId(shots) { let n=1;while(shots.some(s=>s.areaId===`area-${n}`))n++;return `area-${n}`; }

// Geometry moves between existing time slots; timing, poses and easing stay intact.
export function reorderStop(shots,index,to) {
 const stops=cameraStops(shots),order=[...stops];
 if(!stops[index]||!stops[to])return shots;
 const [moving]=order.splice(index,1);order.splice(to,0,moving);
 const areas=cameraAreas(shots);
 const ids=areas.map((a,i)=>shots[a.start].areaId??`visit-${a.start}-${i}`);
 return shots.map((shot,i)=>{const area=areas.findIndex(a=>i>=a.start&&i<=a.end);return area<0?shot:{...shot,areaId:ids[area],...order[area]};});
}
export function removeStop(shots,index) {
 const area=cameraAreas(shots)[index];
 const next=shots.filter((_,i)=>!area||i<area.start||i>area.end);
 return next.length?next:[{at:0}];
}
export function appendStop(shots,stop) {
 const areas=cameraAreas(shots);
 if(!areas.length&&shots.length===1&&!shots[0].pose)return shotsFromStops([stop]);
 const end=areas.length?areas.at(-1).end:Math.max(0,shots.length-2),a=shots[end].at,b=shots[end+1]?.at??1;
 if(b-a<.001)throw new Error('No room after the last area. Shorten its hold or use Reset pacing before adding an area.');
 const areaId=nextAreaId(shots);
 return [...shots.slice(0,end+1),{at:a+(b-a)/3,...stop,areaId},{at:a+(b-a)*2/3,...stop,areaId},...shots.slice(end+1)];
}
export function setStopHold(shots,index,duration) {
 const area=cameraAreas(shots)[index];
 if(!area)return shots;
 const first=shots[area.start],nextAt=shots[area.end+1]?.at??1;
 if(!Number.isFinite(duration)||duration<0||first.at+duration>nextAt)throw new Error('Hold duration must fit before the next point.');
 // A pose animation within an area is custom choreography, not a reading hold.
 const pose=s=>JSON.stringify(POSE.map(k=>s.pose?.[k]??0));
 if(shots.slice(area.start,area.end+1).some(s=>pose(s)!==pose(first)))throw new Error('This area contains a pose animation. Edit its points or use Reset pacing to replace it.');
 const held=duration>0?[first,{...shots[area.end],at:first.at+duration}]:[first];
 return [...shots.slice(0,area.start),...held,...shots.slice(area.end+1)];
}
export function setFullView(shots,edge,enabled) {
 const start=edge==='start',key=start?shots[0]:shots.at(-1);
 if(Boolean(key.focus)===!enabled)return shots;
 if(!enabled){const next=start?shots.slice(shots.findIndex(s=>s.focus)):shots.slice(0,shots.findLastIndex(s=>s.focus)+1);return next.length?next:[{at:0}];}
 if(start?key.at<=0:key.at>=1)throw new Error('No room for a full view at this end. Use Reset pacing to make room.');
 return start?[{at:0},...shots]:[...shots,{at:1}];
}
