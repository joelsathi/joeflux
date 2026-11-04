import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createProjectTools} from '../packages/tools/src/index.js';

async function fixture(){
  const root=await mkdtemp(path.join(tmpdir(),'quality loop '));await mkdir(path.join(root,'scenes'));
  await writeFile(path.join(root,'scenes/title.json'),JSON.stringify({id:'title',preset:'text-settle',durationFrames:72,params:{title:'Ship with clarity'}}));
  await writeFile(path.join(root,'project.json'),JSON.stringify({name:'Review',version:1,output:{width:640,height:360,fps:24,audio:false},assets:{},scenes:[{id:'title',file:'scenes/title.json'}]}));
  return {root,tools:createProjectTools(root)};
}

test('style memory is undoable and feeds project reads',async()=>{
  const {tools}=await fixture();
  await tools.call('style_set',{themes:['oxygen-wso2-dark'],pacing:'measured',look:'cinematic'});
  assert.deepEqual((await tools.call('project_get')).style,{themes:['oxygen-wso2-dark'],pacing:'measured',look:'cinematic'});
  await tools.call('history_undo');
  assert.equal((await tools.call('project_get')).style,undefined);
});

test('quality review renders three frames and variations produce selectable posters',async()=>{
  const {root,tools}=await fixture();
  const quality=await tools.call('quality_review',{id:'title'});
  assert.equal(quality.images.length,3);
  for(const image of quality.images)assert.ok((await stat(image.path)).size>1000);
  const variants=await tools.call('variation_generate',{id:'title'});
  assert.deepEqual(variants.map(item=>item.id),['original','cinematic','editorial']);
  for(const item of variants)assert.ok((await stat(item.path)).size>1000);
  const before=await tools.call('scene_get',{id:'title'});
  await tools.call('scene_replace',{id:'title',scene:variants[1].scene,fingerprint:before.fingerprint});
  assert.equal((await tools.call('scene_get',{id:'title'})).compositor.look,'cinematic');
  await tools.call('history_undo');
  assert.equal((await tools.call('scene_get',{id:'title'})).compositor,undefined);
});

test('an unchanged scene skips repeated review frames until it is edited or forced',async()=>{
  const {tools}=await fixture();
  assert.equal((await tools.call('quality_review',{id:'title'})).images.length,3);
  const again=await tools.call('quality_review',{id:'title'});
  assert.equal(again.unchanged,true);assert.equal(again.images.length,0);assert.ok(Array.isArray(again.findings));
  assert.equal((await tools.call('quality_review',{id:'title',force:true})).images.length,3);
  const review={id:'title-pass',shotIds:['title'],evidence:[{id:'frames',type:'frames',observation:'Title settles and holds',observed:true}],findings:[],unverifiedDimensions:['originality'],taste:[],performance:[]};
  assert.match((await tools.call('review_record',{review})).review.fingerprints.title,/^[a-f0-9]+$/);
  assert.deepEqual((await tools.call('review_get')).reviews[0].changedShots,[]);
  await tools.call('scene_update',{id:'title',patch:{params:{title:'Ship with confidence'}}});
  assert.deepEqual((await tools.call('review_get')).reviews[0].changedShots,['title']);
  assert.equal((await tools.call('quality_review',{id:'title'})).images.length,3);
});

test('render_frame crops a region at native resolution',async()=>{
  const {tools}=await fixture();
  const crop=await tools.call('render_frame',{id:'title',at:.9,region:{x:.25,y:.25,width:.5,height:.5}});
  assert.deepEqual([crop.width,crop.height],[320,180]);
  assert.ok((await stat(crop.path)).size>500);
  assert.deepEqual([(await tools.call('render_frame',{id:'title',at:.9,region:{x:.25,y:.25,width:.5,height:.5},width:160})).width],[160]);
  await assert.rejects(tools.call('render_frame',{id:'title',region:{x:.8,y:0,width:.5,height:.5}}),error=>/inside the frame/.test(error.issues.join('\n')));
});
