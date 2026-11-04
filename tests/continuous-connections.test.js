import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateRecipe} from '../packages/presets/src/recipes.js';
import {sceneErrors} from '../packages/motion/src/validation.js';

const scene=(preset)=>({id:'connection',preset,connectionStyle:'continuous',durationFrames:144,params:{asset:'a',outgoingAsset:'a',incomingAsset:'b',outgoingSeconds:2,incomingSeconds:1}});

test('continuous handoff rotates during retreat and swaps sources on the same settled plane',()=>{
 const s=scene('screen-handoff');
 assert.ok(evaluateRecipe(s,20).planes[0].pose.rotateY>0,'rotation must not wait for retreat to stop');
 let swaps=0;
 for(let f=0;f<144;f++){
  const r=evaluateRecipe(s,f),[a,b]=r.planes;
  if(b.pose.opacity>0&&b.pose.opacity<1){
   swaps++; for(const key of ['x','y','z','rotateY','scale','radius'])assert.equal(a.pose[key],b.pose[key],`swap ${key}, frame ${f}`);
   assert.equal(a.pose.opacity,1,'opaque outgoing under incoming prevents a background flash');
  }
 }
 assert.ok(swaps>5);const first=evaluateRecipe(s,0),last=evaluateRecipe(s,143);
 assert.equal(first.planes[0].pose.z,0);assert.equal(first.planes[1].pose.opacity,0);
 assert.equal(last.planes[1].pose.z,0);assert.equal(last.planes[1].pose.radius,0);assert.equal(last.captionAlpha,0);
});
test('continuous reframe starts and ends fullscreen with a readable angled hold',()=>{
 const s=scene('product-reveal'),first=evaluateRecipe(s,0),middle=evaluateRecipe(s,70),last=evaluateRecipe(s,143);
 assert.equal(first.planes[0].pose.opacity,1);assert.equal(first.planes[0].rect.width,1920);
 assert.ok(middle.planes[0].rect.width<1400);assert.ok(Math.abs(middle.planes[0].pose.rotateY)>5);
 assert.equal(middle.captionAlpha,1);assert.equal(last.planes[0].rect.width,1920);assert.equal(last.planes[0].pose.rotateY,0);assert.equal(last.captionAlpha,0);
});
test('continuous slide has a shared edge with no uncovered gap and holds its endpoints',()=>{
 const s=scene('side-slide');
 for(let f=0;f<144;f++){
  const [a,b]=evaluateRecipe(s,f).planes;assert.ok(Math.abs((a.pose.x+1920)-b.pose.x)<1e-8);
 }
 assert.equal(evaluateRecipe(s,12).planes[0].pose.x,0);
 assert.equal(evaluateRecipe(s,131).planes[1].pose.x,0);
});
test('invalid connection styles and unsupported preset combinations are rejected',()=>{
 const project={output:{fps:24},assets:{a:'a',b:'b'}};
 assert.match(sceneErrors({...scene('screen-handoff'),connectionStyle:'oops'},project).join(' '),/connectionStyle/);
 assert.match(sceneErrors(scene('text-settle'),project).join(' '),/connectionStyle/);
 assert.deepEqual(sceneErrors(scene('screen-handoff'),project),[]);
});

test('short caption holds remain fully readable and source exchange waits for retreat to settle',()=>{
 for(const durationFrames of [144,240])for(const holdFrames of [0,12,36]){
  const s={...scene('screen-handoff'),durationFrames,timing:{holdFrames}},states=Array.from({length:durationFrames},(_,f)=>evaluateRecipe(s,f));
  // A hold of N frames is the interval between N+1 boundary samples.
  assert.equal(states.filter(r=>r.captionAlpha===1).length,holdFrames+1,`${durationFrames}/${holdFrames}`);
  for(const r of states.filter(r=>r.planes[1].pose.opacity>0&&r.planes[1].pose.opacity<1))assert.equal(r.planes[0].pose.z,-1550);
 }
 const project={output:{fps:24},assets:{a:'a',b:'b'}};
 assert.match(sceneErrors({...scene('screen-handoff'),timing:{holdFrames:80}},project).join(' '),/hold/i);
 assert.match(sceneErrors({...scene('screen-handoff'),timing:{holdFrames:12.5}},project).join(' '),/hold/i);
});
