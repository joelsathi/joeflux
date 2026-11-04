import test from 'node:test';
import assert from 'node:assert/strict';
import {getFrameState} from '../packages/motion/src/index.js';
import {validateProject} from '../packages/core/src/index.js';
const output={width:1920,height:1080,fps:24,audio:false};
const scene=preset=>({id:'camera',preset:'recorded-showcase',durationFrames:144,params:{asset:'screen'},cameraMotion:{preset,scale:2,focusX:.8,focusY:.3,endFocusX:.3,endFocusY:.7}});
test('camera zoom presets reach the focus, return to fullscreen, and never change source timing',()=>{
 for(const preset of ['focus-zoom','detail-pan','return-full']){
  const s=scene(preset),hold=getFrameState(s,60,output),last=getFrameState(s,143,output);
  assert.equal(hold.zoom.scale,2,preset);assert.equal(last.zoom.scale,1);assert.equal(last.zoom.x,0);
  assert.equal(hold.sourceFrame,getFrameState({...s,cameraMotion:undefined},60,output).sourceFrame);
  assert.equal(last.recipe.planes[0].rect.width,1920);
 }
 const s=scene('detail-pan');assert.notEqual(getFrameState(s,45,output).zoom.x,getFrameState(s,100,output).zoom.x);
});
test('orbit and tilt settle use perspective but finish on an exact flat fullscreen frame',()=>{
 for(const preset of ['orbit','tilt-settle']){
  const s=scene(preset),moving=getFrameState(s,12,output),last=getFrameState(s,143,output);
  assert.notEqual(moving.recipe.planes[0].pose.rotateY,0,preset);
  assert.equal(last.recipe.planes[0].pose.rotateY,0);assert.equal(last.recipe.planes[0].pose.z,0);assert.equal(last.recipe.planes[0].pose.radius,0);assert.equal(last.recipe.captionAlpha,0);
 }
});
test('camera presets validate timing and prevent ambiguous manual camera or zoom tracks',()=>{
 const check=s=>validateProject({output,assets:{screen:'a.mp4'},scenes:[s]});
 assert.equal(check(scene('orbit')).valid,true);
 for(const motion of [{preset:'bad'},{preset:'focus-zoom',scale:.5},{preset:'detail-pan',endFocusX:2},{preset:'orbit',entryFrames:120,exitFrames:40},{preset:'orbit',strength:4},{preset:'detail-pan',entryFrames:114,exitFrames:29},{preset:'orbit',entryFrames:114,exitFrames:29}])assert.equal(check({...scene('orbit'),cameraMotion:motion}).valid,false);
 assert.equal(check({...scene('orbit'),zoom:{startFrame:0,endFrame:143}}).valid,false);
 assert.equal(check({...scene('orbit'),preset:'text-settle'}).valid,false);
});
test('edge-focused pan keeps moving until its eased endpoint instead of hitting a clamp early',()=>{
 const s={...scene('detail-pan'),cameraMotion:{preset:'detail-pan',scale:2,focusX:.5,focusY:.5,endFocusX:1,endFocusY:.5}};
 const near=getFrameState(s,85,output).zoom,end=getFrameState(s,100,output).zoom;
 assert.ok(near.x>end.x,'pan must approach the bounded destination smoothly');
 for(let f=0;f<144;f++){
  const z=getFrameState(s,f,output).zoom;assert.ok(Math.abs(z.x)<=(z.scale-1)/2+1e-9);assert.ok(Math.abs(z.y)<=(z.scale-1)/2+1e-9);
 }
});
