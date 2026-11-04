import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createProjectTools } from '../packages/tools/src/index.js';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'plugin-project-'));
  const pack = path.join(root, 'external');
  await mkdir(pack);
  const template = {id:'result',label:'Show a result',category:'Proof',description:'A contributed proof title.',scene:{plugin:'motion',params:{title:'{{title}}',subtitle:'Evidence'},pluginOptions:{color:'#74e7cd'}},slots:[{id:'title',type:'text',default:'A real result',maxLength:64}],controls:{durations:{short:4,medium:5,long:7},fields:[{id:'accent',label:'Accent',type:'color',path:'pluginOptions.color',default:'#74e7cd'}]}};
  await writeFile(path.join(pack, 'plugin.json'), JSON.stringify({manifestVersion:1,id:'example/proof-pack',version:'1.0.0',license:'MIT',apiVersion:1,dependencies:{},entryPoints:{},capabilities:{offline:true,execution:'data'},contributes:{templates:['result.json']}}));
  await writeFile(path.join(pack, 'result.json'), JSON.stringify(template));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({version:1,name:'Contributions',output:{width:640,height:360,fps:24,audio:false},assets:{},scenes:[]}));
  return {root,pack,tools:createProjectTools(root)};
}

test('a local data package contributes a template, applies pinned inputs and survives undo', async () => {
  const {root,pack,tools} = await fixture();
  await tools.call('plugin_install',{directory:pack});
  const list = await tools.call('template_list');
  const item = list.find(t => t.id === 'example/proof-pack/result');
  assert.equal(item.origin.version,'1.0.0');
  await tools.call('template_apply',{template:item.id,id:'proof',slots:{title:'Six checks passed'},controls:{accent:'#ff6700'}});
  const scene = JSON.parse(await readFile(path.join(root,'scenes/proof.json'),'utf8'));
  assert.equal(scene.params.title,'Six checks passed');
  assert.equal(scene.pluginOptions.color,'#ff6700');
  assert.equal(scene.templateInstance.package,'example/proof-pack');
  assert.equal(scene.templateInstance.version,'1.0.0');
  assert.equal(scene.templateInstance.inputs.title,'Six checks passed');
  assert.equal(scene.templateInstance.settings.controls.accent,'#ff6700');
  assert.ok(scene.templateInstance.definition);
  assert.equal((await tools.call('validate')).valid,true);
  await tools.call('history_undo');
  assert.equal((await tools.call('project_get',{detail:'full'})).scenes.length,0);
  assert.ok((await tools.call('template_list')).some(t=>t.id===item.id));
  await tools.call('history_redo');
  assert.equal((await tools.call('project_get',{detail:'full'})).scenes[0].params.title,'Six checks passed');
});

test('disabling a package removes contributions but preserves authored scene data and reports availability',async()=>{
  const {pack,tools}=await fixture();
  await tools.call('plugin_install',{directory:pack});
  await tools.call('template_apply',{template:'example/proof-pack/result',id:'proof'});
  const original=(await tools.call('project_get',{detail:'full'})).scenes[0];
  await tools.call('plugin_enable',{id:'example/proof-pack',enabled:false});
  assert.ok(!(await tools.call('template_list')).some(t=>t.id==='example/proof-pack/result'));
  assert.deepEqual((await tools.call('project_get',{detail:'full'})).scenes[0],original);
  const status=await tools.call('plugin_status');
  assert.ok(status.findings.some(f=>f.scene==='proof'&&f.status==='disabled'));
  await tools.call('history_undo');
  assert.ok((await tools.call('template_list')).some(t=>t.id==='example/proof-pack/result'));
});

test('contributed fields reject unknown and invalid values atomically',async()=>{
  const {pack,tools}=await fixture(); await tools.call('plugin_install',{directory:pack});
  await assert.rejects(tools.call('template_apply',{template:'example/proof-pack/result',id:'bad',controls:{accent:'url(https://x)'}}));
  await assert.rejects(tools.call('template_apply',{template:'example/proof-pack/result',id:'bad',controls:{unknown:1}}));
  assert.equal((await tools.call('project_get',{detail:'full'})).scenes.length,0);
});

test('saved template fields edit the full instance and remain undoable after package disable',async()=>{
  const {pack,tools}=await fixture(); await tools.call('plugin_install',{directory:pack});
  await tools.call('template_apply',{template:'example/proof-pack/result',id:'proof'});
  await tools.call('plugin_enable',{id:'example/proof-pack',enabled:false});
  await tools.call('template_set_control',{id:'proof',control:'accent',value:'#abcdef'});
  const scene=(await tools.call('project_get',{detail:'full'})).scenes[0];
  assert.equal(scene.pluginOptions.color,'#abcdef');
  assert.equal(scene.templateInstance.inputs.title,'A real result');
  assert.equal(scene.templateInstance.overrides['pluginOptions.color'],'#abcdef');
  await tools.call('history_undo');
  assert.equal((await tools.call('project_get',{detail:'full'})).scenes[0].pluginOptions.color,'#74e7cd');
});

test('package upgrades never rewrite pinned authored instances',async()=>{
  const {pack,tools}=await fixture(); await tools.call('plugin_install',{directory:pack});
  await tools.call('template_apply',{template:'example/proof-pack/result',id:'proof'});
  const before=(await tools.call('project_get',{detail:'full'})).scenes[0];
  const manifest=JSON.parse(await readFile(path.join(pack,'plugin.json'),'utf8'));
  await writeFile(path.join(pack,'plugin.json'),JSON.stringify({...manifest,version:'2.0.0'}));
  await tools.call('plugin_install',{directory:pack});
  assert.deepEqual((await tools.call('project_get',{detail:'full'})).scenes[0],before);
  assert.equal((await tools.call('plugin_status')).findings[0].status,'version-mismatch');
  await tools.call('history_undo');
  assert.deepEqual((await tools.call('plugin_status')).findings,[]);
});

test('composition template controls preserve sibling layers and enforce motion locks',async()=>{
  const {tools}=await fixture();
  await tools.call('template_apply',{template:'brand-reveal',id:'brand'});
  const original=(await tools.call('project_get',{detail:'full'})).scenes[0];
  await tools.call('template_set_control',{id:'brand',control:'treatment',value:'bold'});
  const edited=(await tools.call('project_get',{detail:'full'})).scenes[0];
  assert.equal(edited.components[0].inputs.treatment,'bold');
  assert.deepEqual(edited.components.slice(1),original.components.slice(1));
  await tools.call('component_lock',{id:'brand',componentId:edited.components[0].id,scope:'motion',locked:true});
  await assert.rejects(tools.call('template_set_control',{id:'brand',control:'treatment',value:'restrained'}),/lock/i);
});
