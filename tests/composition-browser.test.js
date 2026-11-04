import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { startPreview } from '../packages/preview-server/src/index.js';
import { createProjectTools } from '../packages/tools/src/index.js';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRenderServer } from '../packages/renderer/src/server.js';
import { browserLaunchOptions } from '../packages/renderer/src/index.js';
import { instantiateComponent } from '../packages/composition/src/model.js';
async function fixture(){
  const root=await mkdtemp(path.join(tmpdir(),'composition-browser-'));await mkdir(path.join(root,'assets'));
  for(const [file,color] of [['proof.svg','#ffb35c'],['changed.svg','#867cff']]) await writeFile(path.join(root,'assets',file),`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="${color}"/><circle cx="300" cy="150" r="90" fill="#13253d"/></svg>`);
  const components=[['shape','harness/shape',{}],['title','harness/title',{title:'Make the change visible',subtitle:'One clear result'}],['proof','harness/proof',{asset:'proof'}],['cta','harness/cta',{title:'Take the next step'}]].map(([id,component,inputs])=>instantiateComponent(component,{id,inputs,durationFrames:120,fps:24}));
  const project={version:1,name:'Composition',output:{width:640,height:360,fps:24,audio:false},assets:{proof:'assets/proof.svg'},scenes:[{id:'proof',kind:'composition',compositionVersion:1,durationFrames:120,background:{style:'static',color:'#122238'},components}]};
  await writeFile(path.join(root,'project.json'),JSON.stringify(project));return {root,project};
}
test('composed Anime.js, Motion and proof surfaces repeat offline pixels across fractional/backward seeks in three formats',{timeout:60000},async()=>{
  const {root,project}=await fixture(),server=await createRenderServer(root),browser=await chromium.launch(browserLaunchOptions());
  try {
    const page=await browser.newPage(),errors=[],external=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>{if(!route.request().url().startsWith(server.origin)){external.push(route.request().url());return route.abort();}return route.continue();});
    await page.goto(server.origin);await page.waitForFunction(()=>window.joeFluxReady);
    for(const [width,height] of [[640,360],[480,480],[360,640],[480,270],[240,135]]){
      const result=await page.evaluate(async({project,width,height})=>{
        const {createSceneRenderer}=await import('/packages/renderer/src/browser-scene.js');project.output={...project.output,width,height};
        const render=createSceneRenderer(project),canvas=document.createElement('canvas'),scene=project.scenes[0];
        await render(canvas,scene,6.5);const first=canvas.toDataURL();await render(canvas,scene,55);const changed=canvas.toDataURL();await render(canvas,scene,0);await render(canvas,scene,6.5);const repeat=canvas.toDataURL();await render.dispose();return {same:first===repeat,moves:first!==changed,frame:canvas.dataset.renderedFrame};
      },{project,width,height});assert.deepEqual(result,{same:true,moves:true,frame:'6.5'});
    }
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  }finally{await browser.close();await server.close();}
});
test('composition host drops stale frames, isolates surfaces, refreshes changed proof bindings and disposes/reuses',{timeout:60000},async()=>{
  const {root,project}=await fixture(),server=await createRenderServer(root),browser=await chromium.launch(browserLaunchOptions());
  try{
    const page=await browser.newPage();await page.goto(server.origin);await page.waitForFunction(()=>window.joeFluxReady);
    const result=await page.evaluate(async project=>{
      const {createSceneRenderer}=await import('/packages/renderer/src/browser-scene.js'),render=createSceneRenderer(project),other=createSceneRenderer(project),a=document.createElement('canvas'),b=document.createElement('canvas'),scene=project.scenes[0];
      await Promise.all([render(a,scene,10),render(a,scene,20),render(a,scene,30)]);const latest=a.dataset.renderedFrame;
      await other(b,scene,30);const same=a.toDataURL()===b.toDataURL();
      const before=a.toDataURL();project.assets.proof='assets/changed.svg';await render(a,scene,30);const changed=before!==a.toDataURL();
      await render.dispose();await render(a,scene,30);const reusable=a.dataset.renderedFrame==='30';
      const runtime=await import('/animation-plugins/runtime.js'),surface=document.createElement('canvas');surface.width=640;surface.height=360;
      const session=await runtime.createComponent('harness/title',{canvas:surface,context:surface.getContext('2d'),output:project.output,component:scene.components[1],bounds:{x:20,y:20,width:600,height:100}});session.dispose();session.dispose();let disposed=false;try{await session.render(10);}catch{disposed=true;}
      await render.dispose();await other.dispose();return {latest,same,changed,reusable,disposed};
    },project);assert.deepEqual(result,{latest:'30',same:true,changed:true,reusable:true,disposed:true});
  }finally{await browser.close();await server.close();}
});
test('components keep their surface transparent and report unreadable bounds instead of clipping copy',{timeout:60000},async()=>{
  const {root,project}=await fixture(),server=await createRenderServer(root),browser=await chromium.launch(browserLaunchOptions());
  try{
    const page=await browser.newPage();await page.goto(server.origin);await page.waitForFunction(()=>window.joeFluxReady);
    const result=await page.evaluate(async project=>{
      const {createSceneRenderer}=await import('/packages/renderer/src/browser-scene.js'),render=createSceneRenderer(project),canvas=document.createElement('canvas'),scene=project.scenes[0];await render(canvas,scene,30);
      const runtime=await import('/animation-plugins/runtime.js'),surface=document.createElement('canvas');surface.width=640;surface.height=360;const ctx=surface.getContext('2d');
      const component=scene.components[1],session=await runtime.createComponent(component.component,{canvas:surface,context:ctx,output:project.output,component,bounds:{x:20,y:20,width:600,height:100}});await session.render(30);const transparent=ctx.getImageData(0,0,1,1).data[3]===0;session.dispose();
      const tiny=structuredClone(scene);tiny.components[1].layout.bounds={x:.1,y:.1,width:.01,height:.01};let error='';try{await render(canvas,tiny,30);}catch(e){error=e.message;}
      await render.dispose();return {transparent,error};
    },project);assert.equal(result.transparent,true);assert.match(result.error,/cannot fit.*readably/);
  }finally{await browser.close();await server.close();}
});
test('validated raw instances without optional controls render the declared defaults',{timeout:60000},async()=>{
  const {root,project}=await fixture(),server=await createRenderServer(root),browser=await chromium.launch(browserLaunchOptions());
  try{
    const page=await browser.newPage();await page.goto(server.origin);await page.waitForFunction(()=>window.joeFluxReady);
    const result=await page.evaluate(async project=>{
      const {createSceneRenderer}=await import('/packages/renderer/src/browser-scene.js'),{compositionErrors}=await import('/packages/composition/src/model.js');
      const render=createSceneRenderer(project),canvas=document.createElement('canvas'),scene=project.scenes[0];await render(canvas,scene,30);const defaults=canvas.toDataURL();
      const raw=structuredClone(scene);for(const component of raw.components){for(const key of ['color','treatment','shape','scale','radius','fit'])delete component.inputs[key];}
      const errors=compositionErrors(raw,project);let renderError='';try{await render(canvas,raw,30);}catch(error){renderError=error.message;}
      const same=defaults===canvas.toDataURL();await render.dispose();return {errors,renderError,same};
    },project);assert.deepEqual(result,{errors:[],renderError:'',same:true});
  }finally{await browser.close();await server.close();}
});
test('a landscape project can preview and add a composition template with supporting copy',{timeout:60000},async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'composition-template-'));
  await writeFile(path.join(root,'project.json'),JSON.stringify({version:1,name:'Landscape',output:{width:1920,height:1080,fps:24,audio:false},assets:{},scenes:[]}));
  const server=await startPreview(root,0),browser=await chromium.launch(browserLaunchOptions());
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto(server.url);
    await page.getByRole('button',{name:'Add a shot',exact:true}).click();
    await page.getByRole('menuitem',{name:/Browse templates/}).click();
    await page.getByRole('button',{name:/Choose Brand reveal template/}).click();
    await expect(page.getByRole('button',{name:'Add shot',exact:true}).last()).toBeEnabled();
    await page.getByRole('button',{name:'Add shot',exact:true}).last().click();
    await expect.poll(async()=>(await createProjectTools(root).call('project_get',{detail:'full'})).scenes[0]?.kind).toBe('composition');
  }finally{await browser.close();await server.close();}
});
