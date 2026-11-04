import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { listTemplates, instantiateTemplate } from '../packages/presets/src/templates.js';
import { validateProject } from '../packages/core/src/index.js';
import { loadProject } from '../packages/core/src/io.js';
test('purposeful neutral templates preserve supplied copy/assets with short and long timing at two frame rates',async()=>{
  const templates=await listTemplates();
  for(const id of ['product-proof','brand-reveal']){
    const template=templates.find(t=>t.id===id);assert.ok(template,`${id} is discoverable`);
    for(const fps of [24,30])for(const duration of ['short','long']){
      const project={output:{width:1920,height:1080,fps,audio:false},assets:{proof:'assets/proof.svg'}};
      const scene=instantiateTemplate(template,{id:'sample',slots:{title:'Useful work, made visible',subtitle:'One concrete result',cta:'Explore the next step',asset:'proof'},duration,fps,assets:project.assets});
      assert.equal(scene.components.find(c=>c.id==='headline').inputs.title,'Useful work, made visible');
      if(id==='product-proof')assert.equal(scene.components.find(c=>c.id==='evidence').inputs.asset,'proof');
      const result=validateProject({...project,scenes:[scene]});assert.equal(result.valid,true,result.errors.join('\n'));
      const defaults=instantiateTemplate(template,{id:'default',duration,fps,assets:project.assets,slots:id==='product-proof'?{asset:'proof'}:{}});
      const defaultResult=validateProject({...project,scenes:[defaults]});assert.equal(defaultResult.valid,true,defaultResult.errors.join('\n'));
    }
  }
});
test('neutral samples provide original assets and explicit landscape/square/portrait projects',async()=>{
  for(const format of ['landscape','square','portrait']){
    const root=new URL(`../projects/neutral-${format}/`,import.meta.url).pathname;
    const project=await loadProject(root),result=validateProject(project);assert.equal(result.valid,true,result.errors.join('\n'));assert.equal(project.scenes.length,2);
    const state=await readFile(path.join(root,'WORKING_STATE.md'),'utf8');assert.match(state,/not.*approved|unapproved/i);
    for(const asset of Object.values(project.assets))assert.match(await readFile(path.join(root,asset),'utf8'),/<svg/);
  }
});
import path from 'node:path';
