import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createProjectTools} from '../packages/tools/src/index.js';
import {instantiateComponent} from '../packages/composition/src/model.js';
async function fixture(){
 const root=await mkdtemp(path.join(tmpdir(),'component-tools-'));
 const title=instantiateComponent('harness/title',{id:'headline',inputs:{title:'Verified result'},durationFrames:120,fps:24});
 const shape=instantiateComponent('harness/shape',{id:'form',durationFrames:120,fps:24});
 await writeFile(path.join(root,'project.json'),JSON.stringify({version:1,name:'Editable composition',output:{width:640,height:360,fps:24,audio:false},assets:{},scenes:[{id:'proof',kind:'composition',compositionVersion:1,durationFrames:120,components:[title,shape]}]}));
 return createProjectTools(root);
}
test('component input, compatible swap and anchor edits preserve unrelated components and undo',async()=>{
 const tools=await fixture(); const original=(await tools.call('project_get')).scenes[0].components;
 await tools.call('component_set_input',{id:'proof',componentId:'headline',input:'title',value:'A better result'});
 await tools.call('component_replace',{id:'proof',componentId:'headline',component:'harness/cta'});
 await tools.call('component_bind_anchor',{id:'proof',componentId:'headline',anchor:'bottom'});
 const next=(await tools.call('project_get')).scenes[0].components;
 assert.equal(next[0].inputs.title,'A better result'); assert.equal(next[0].component,'harness/cta');assert.equal(next[0].layout.anchor,'bottom');assert.deepEqual(next[1],original[1]);
 await tools.call('history_undo');assert.equal((await tools.call('project_get')).scenes[0].components[0].layout.anchor,'top');
});
test('component locks stop typed and generic edits until explicitly unlocked',async()=>{
 const tools=await fixture();
 await tools.call('component_lock',{id:'proof',componentId:'headline',scope:'copy',locked:true});
 await assert.rejects(tools.call('component_set_input',{id:'proof',componentId:'headline',input:'title',value:'Rewritten'}),/lock/i);
 const scene=(await tools.call('project_get')).scenes[0];scene.components[0].inputs.title='Bypassed';scene.components[0].locks.copy=false;
 await assert.rejects(tools.call('scene_update',{id:'proof',patch:{components:scene.components}}),/lock/i);
 const timed=(await tools.call('project_get')).scenes[0];timed.components[1].locks={timing:true};
 await tools.call('scene_update',{id:'proof',patch:{components:timed.components}});timed.components[1].timing.holdFrames-=10;timed.components[1].locks={};
 await assert.rejects(tools.call('scene_update',{id:'proof',patch:{components:timed.components}}),/timing is locked/i);
 await tools.call('component_lock',{id:'proof',componentId:'headline',scope:'copy',locked:false});
 await tools.call('component_set_input',{id:'proof',componentId:'headline',input:'title',value:'Rewritten'});
 assert.equal((await tools.call('project_get')).scenes[0].components[0].inputs.title,'Rewritten');
});
test('retiming protects copy holds and rejects incompatible replacements atomically',async()=>{
 const tools=await fixture();
 await assert.rejects(tools.call('component_retime',{id:'proof',componentId:'headline',durationFrames:10}),/hold|frames/i);
 await assert.rejects(tools.call('component_replace',{id:'proof',componentId:'headline',component:'harness/shape'}),/incompatible|slot/i);
 await tools.call('composition_retime',{id:'proof',durationFrames:144});
 const scene=(await tools.call('project_get')).scenes[0];assert.equal(scene.durationFrames,144);assert.equal(scene.components[0].timing.entranceFrames+scene.components[0].timing.holdFrames+scene.components[0].timing.exitFrames,144);
});
test('composition retiming scales staggered components; locked shots and dangling scene files can still be deleted',async()=>{
 const tools=await fixture(),end=c=>c.timing.startFrame+c.timing.entranceFrames+c.timing.holdFrames+c.timing.exitFrames;
 await tools.call('component_retime',{id:'proof',componentId:'headline',durationFrames:60});
 await tools.call('composition_retime',{id:'proof',durationFrames:240});
 const [headline,form]=(await tools.call('project_get')).scenes[0].components;assert.equal(end(headline),120);assert.equal(end(form),240);
 const root=await mkdtemp(path.join(tmpdir(),'dangling-scene-'));await mkdir(path.join(root,'scenes'));
 const locked=instantiateComponent('harness/title',{id:'headline',inputs:{title:'Verified result'},durationFrames:120,fps:24,locks:{layout:true}});
 await writeFile(path.join(root,'scenes/proof.json'),JSON.stringify({kind:'composition',compositionVersion:1,durationFrames:120,components:[locked]}));
 await writeFile(path.join(root,'project.json'),JSON.stringify({version:1,name:'Dangling',output:{width:640,height:360,fps:24,audio:false},assets:{},scenes:[{id:'gone',file:'scenes/gone.json'},{id:'proof',file:'scenes/proof.json'}]}));
 const repair=createProjectTools(root);await repair.call('scene_delete',{id:'gone'});await repair.call('scene_delete',{id:'proof'});
 assert.deepEqual(JSON.parse(await readFile(path.join(root,'project.json'),'utf8')).scenes,[]);
});
