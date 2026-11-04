import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { COMPONENT_DEFINITIONS } from '../packages/composition/src/catalog.js';
import { instantiateComponent, compositionErrors, evaluateComponent, retimeComponent, replacementErrors } from '../packages/composition/src/model.js';
import { validateProject } from '../packages/core/src/index.js';
import { engineFingerprint, sceneFingerprint } from '../packages/renderer/src/fingerprint.js';
const project={output:{width:640,height:360,fps:24,audio:false},assets:{proof:'proof.svg'},scenes:[]};
const make=()=>instantiateComponent('harness/title',{id:'headline',inputs:{title:'One useful change',subtitle:'See the result'},durationFrames:120,fps:24});
test('editable component definitions declare transparent surfaces and multiple engines',()=>{
  assert.deepEqual(COMPONENT_DEFINITIONS.map(d=>d.id),['harness/title','harness/proof','harness/shape','harness/cta','harness/terminal']);
  assert.ok(new Set(COMPONENT_DEFINITIONS.map(d=>d.engine)).size>=2);
  for(const d of COMPONENT_DEFINITIONS){assert.equal(d.surface.alpha,true);assert.equal(d.surface.shared3D,false);assert.ok(d.slots.length||d.controls.length);assert.deepEqual(d.layouts,['landscape','square','portrait']);}
});
test('component timing is absolute, fractional and independent of seek order',()=>{
  const instance=make(),reference=evaluateComponent(instance,12.5);
  evaluateComponent(instance,99);evaluateComponent(instance,0);
  assert.deepEqual(evaluateComponent(instance,12.5),reference);
  assert.equal(evaluateComponent(instance,-1).visible,false);
  assert.equal(evaluateComponent(instance,120).visible,false);
  assert.equal(evaluateComponent(instance,40).phase,'hold');
  assert.equal(evaluateComponent(instance,40).opacity,1);
});
test('retiming protects copy reading hold and leaves inputs, anchors and seed intact',()=>{
  const instance=make(),before=structuredClone(instance),retimed=retimeComponent(instance,72,24);
  assert.ok(retimed.timing.holdFrames>=48);
  assert.equal(retimed.timing.entranceFrames+retimed.timing.holdFrames+retimed.timing.exitFrames,72);
  assert.deepEqual(retimed.inputs,instance.inputs);assert.deepEqual(retimed.layout,instance.layout);assert.equal(retimed.seed,instance.seed);
  assert.deepEqual(instance,before);
  assert.throws(()=>retimeComponent(instance,20,24),/reading hold/);
  assert.throws(()=>retimeComponent({...instance,locks:{timing:true}},72,24),/locked/);
});
test('composition validation accepts core scenes and rejects missing copy, incompatible anchors and interval overflow',()=>{
  const scene={id:'composition',kind:'composition',compositionVersion:1,durationFrames:120,components:[make()]};
  assert.deepEqual(compositionErrors(scene,project),[]);
  assert.equal(validateProject({...project,scenes:[scene]}).valid,true);
  const bad=structuredClone(scene);bad.components[0].layout.anchor='unknown';bad.components[0].inputs.title='';bad.components[0].timing.startFrame=119;
  const errors=compositionErrors(bad,project).join('\n');assert.match(errors,/anchor/);assert.match(errors,/title/);assert.match(errors,/fit/);
  assert.ok(replacementErrors(make(),'harness/proof').some(e=>/slot|input/.test(e)));
  const unpinned=structuredClone(scene);delete unpinned.components[0].version;assert.match(compositionErrors(unpinned,project).join(' '),/version/);
});
test('proof components validate declared assets, supported format and reading holds',()=>{
  const proof=instantiateComponent('harness/proof',{id:'proof',inputs:{asset:'proof'},durationFrames:120,fps:24});
  const scene={id:'proof',kind:'composition',compositionVersion:1,durationFrames:120,components:[proof]};
  assert.match(compositionErrors(scene,{...project,assets:{}}).join(' '),/missing declared asset/);
  assert.match(compositionErrors(scene,{...project,output:{...project.output,width:800,height:100}}).join(' '),/format/);
  const short={...make(),timing:{startFrame:0,entranceFrames:10,holdFrames:1,exitFrames:10}};
  assert.match(compositionErrors({...scene,components:[short]},project).join(' '),/reading hold/);
});
test('component engine code and proof asset contents invalidate render identity',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'composition-cache-'));
  await mkdir(path.join(root,'packages/composition/src'),{recursive:true});await mkdir(path.join(root,'apps/preview'),{recursive:true});
  await writeFile(path.join(root,'apps/preview/render.html'),'page');await writeFile(path.join(root,'packages/composition/src/render.js'),'first');
  const engine=await engineFingerprint(root);await writeFile(path.join(root,'packages/composition/src/render.js'),'second');assert.notEqual(await engineFingerprint(root),engine);
  await writeFile(path.join(root,'proof.svg'),'first');const p={...project,root};
  const scene={id:'proof',kind:'composition',components:[instantiateComponent('harness/proof',{id:'proof',inputs:{asset:'proof'},durationFrames:120,fps:24})]};
  const identity=await sceneFingerprint(p,scene);await writeFile(path.join(root,'proof.svg'),'changed');assert.notEqual(await sceneFingerprint(p,scene),identity);
});
test('project validation enforces source moment duration and rejects mixed legacy timing',()=>{
  const scene={id:'source',kind:'screen',durationFrames:60,screen:{asset:'proof'},camera:{shots:[{at:0}]},playback:{moments:[{type:'play',startSeconds:1,endSeconds:2},{type:'hold',sourceSeconds:2,frames:36}]}};
  assert.equal(validateProject({...project,scenes:[scene]}).valid,true);
  const wrong=validateProject({...project,scenes:[{...scene,durationFrames:59}]});assert.match(wrong.errors.join(' '),/source moment duration/);
  const mixed=validateProject({...project,scenes:[{...scene,playback:{...scene.playback,startSeconds:0}}]});assert.match(mixed.errors.join(' '),/cannot combine/);
});
