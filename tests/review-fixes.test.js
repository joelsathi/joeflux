import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import * as motion from '../packages/motion/src/camera-motion.js';
import {createProjectTools} from '../packages/tools/src/index.js';
import {screenSceneErrors} from '../packages/schema/src/scene.js';
const A={focus:[.3,.3],zoom:2}, B={focus:[.7,.6],zoom:2.5};

test('reframing a repeated visit changes only that occurrence, including visits separated by full view',()=>{
 const shots=[{at:0,...A},{at:.2,...A},{at:.4,...B},{at:.6,...B},{at:.8,...A},{at:1,...A}];
 const next=motion.reframeStop(shots,2,B);
 assert.deepEqual(next.slice(0,4),shots.slice(0,4));
 assert.deepEqual(next.slice(4).map(s=>s.focus),[B.focus,B.focus]);
 assert.equal(motion.cameraStops([{at:0,...A},{at:.5},{at:1,...A}]).length,2);
});

test('area reorder, deletion and insertion retain custom timings, poses and easing',()=>{
 const shots=[{at:0},{at:.13,...A,pose:{rotateY:7},ease:'linear'},{at:.24,...A,pose:{rotateY:7}},{at:.51,...B,ease:'gentle'},{at:.62,...B},{at:1}];
 const swapped=motion.reorderStop(shots,0,1);
 assert.deepEqual(swapped.map(({focus,zoom,areaId,...rest})=>rest),shots.map(({focus,zoom,areaId,...rest})=>rest));
 assert.deepEqual(motion.cameraStops(swapped),[B,A]);
 assert.deepEqual(motion.removeStop(shots,0),[shots[0],...shots.slice(3)]);
 const added=motion.appendStop(shots,{focus:[.5,.8],zoom:3});
 for(const original of shots) assert.ok(added.some(s=>JSON.stringify(s)===JSON.stringify(original)));
 assert.equal(motion.cameraStops(added).length,3);
});

test('pass-through removes only the selected hold and makes flow visible; hold duration is editable',()=>{
 const shots=motion.shotsFromStops([A,B]);
 const pass=motion.setStopHold(shots,0,0);
 assert.equal(pass.length,shots.length-1);
 const held=motion.setStopHold(pass,0,.1), first=motion.cameraAreas(held)[0];
 assert.ok(Math.abs(held[first.end].at-held[first.start].at-.1)<1e-8);
 assert.ok(Array.from({length:101},(_,f)=>Math.abs(motion.evaluateShots({shots:pass,flow:true},f,101).zoom.x-motion.evaluateShots({shots:pass},f,101).zoom.x)).some(d=>d>.001));
 assert.throws(()=>motion.setStopHold(shots,0,1),/next|room|duration/i);
});

async function fixture(){
 const root=await mkdtemp(path.join(tmpdir(),'harness review fixes ')); await mkdir(path.join(root,'scenes'));
 const screen={id:'hero',kind:'screen',durationFrames:48,screen:{asset:'clip',presentation:'studio',shadow:'deep'},camera:{shots:[{at:0}]}};
 const plain={id:'plain',preset:'recorded-showcase',composition:'full',durationFrames:48,params:{asset:'clip',seed:42},playback:{startSeconds:2}};
 const unsafe={id:'unsafe',preset:'recorded-showcase',durationFrames:48,params:{asset:'clip',title:'Keep caption'},camera:{start:{rotateY:5},end:{rotateY:0}}};
 for(const scene of [screen,plain,unsafe]) await writeFile(path.join(root,'scenes',scene.id+'.json'),JSON.stringify(scene));
 const inline={...screen,id:'inline',screen:{asset:'clip',frame:'window'}};
 await writeFile(path.join(root,'project.json'),JSON.stringify({name:'Review',version:1,output:{width:320,height:180,fps:24,audio:false},assets:{clip:'assets/clip.mp4'},scenes:[...['hero','plain','unsafe'].map(id=>({id,file:`scenes/${id}.json`})),inline]}));
 return {root,tools:createProjectTools(root),plain,unsafe};
}

test('screen and camera edits reject unsafe legacy conversion without touching the saved scene',async()=>{
 const {root,tools,unsafe}=await fixture();
 for(const [name,input] of [['screen_set',{presentation:'studio'}],['camera_style',{flow:true}],['camera_set_shots',{shots:[{at:0}]}],['camera_apply_move',{move:'orbit'}]]){
  await assert.rejects(tools.call(name,{id:'unsafe',...input}),/caption|camera|conversion/i);
  assert.deepEqual(JSON.parse(await readFile(path.join(root,'scenes/unsafe.json'),'utf8')),unsafe);
 }
 assert.equal((await tools.call('history_list')).entries.length,0);
});

test('screen matching previews eligibility, supports selected and inline scenes, converts simple recordings, and undoes once',async()=>{
 const {root,tools,plain}=await fixture();
 const preview=await tools.call('screen_match_preview',{id:'hero'});
 assert.deepEqual(preview.eligible.map(s=>s.id),['plain','inline']);
 assert.equal(preview.skipped[0].id,'unsafe'); assert.match(preview.skipped[0].reason,/caption|camera/);
 assert.equal((await tools.call('history_list')).entries.length,0);
 const result=await tools.call('screen_match',{id:'hero',ids:['plain','inline']});
 assert.deepEqual(result.matched,['plain','inline']);
 const converted=JSON.parse(await readFile(path.join(root,'scenes/plain.json'),'utf8'));
 assert.equal(converted.kind,'screen'); assert.deepEqual(converted.playback,plain.playback); assert.equal(converted.params.seed,42);
 assert.equal((await tools.call('project_get')).scenes.find(s=>s.id==='inline').screen.shadow,'deep');
 assert.equal((await tools.call('history_list')).entries.length,1);
 await tools.call('history_undo');
 assert.deepEqual(JSON.parse(await readFile(path.join(root,'scenes/plain.json'),'utf8')),plain);
 assert.equal((await tools.call('project_get')).scenes.find(s=>s.id==='inline').screen.frame,'window');
 await assert.rejects(tools.call('screen_match',{id:'hero',ids:['missing']}),/missing|Unknown|No scene/);
});

test('motion blur can be disabled without deleting its quality settings',()=>{
 assert.deepEqual(screenSceneErrors({id:'blur',kind:'screen',durationFrames:48,screen:{asset:'clip'},camera:{shots:[{at:0}]},motionBlur:{enabled:false,samples:12,shutter:.7}}),[]);
});

test('coincident neighboring visits remain independent after a reframe',()=>{
 const shots=[{at:0,...A},{at:.2,...A},{at:.4,...B},{at:.6,...B},{at:1}];
 const next=motion.reframeStop(shots,0,B);
 assert.equal(motion.cameraStops(next).length,2);
 assert.deepEqual(motion.reframeStop(next,1,A).slice(0,2),next.slice(0,2));
 assert.equal(motion.cameraStops(motion.appendStop([{at:0},{at:1}],A)).length,1);
});

test('hold editing refuses to erase custom pose motion',()=>{
 const shots=[{at:0,...A,pose:{rotateY:5}},{at:.3,...A,pose:{rotateY:10}},{at:1}];
 assert.throws(()=>motion.setStopHold(shots,0,0),/pose animation/);
});

test('camera preset conversion retains authored metadata and the existing caption-free rendering',async()=>{
 const {toV2,toScreenScene}=await import('../packages/schema/src/migrate.js');
 const {getFrameState}=await import('../packages/motion/src/index.js');
 const scene={id:'preset',preset:'recorded-showcase',durationFrames:48,params:{asset:'clip',title:'Hidden by preset',seed:15},cameraMotion:{preset:'orbit'}};
 const converted=toScreenScene(scene),output={width:320,height:180,fps:24};
 assert.deepEqual(converted.params,scene.params);
 assert.equal(getFrameState(scene,24,output).recipe.captionAlpha,0);
 assert.deepEqual(getFrameState(converted,24,output),getFrameState(toV2(scene),24,output));
});
