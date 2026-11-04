import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {createRenderServer} from '../packages/renderer/src/server.js';
import {startPreview} from '../packages/preview-server/src/index.js';
import {browserLaunchOptions} from '../packages/renderer/src/index.js';

async function fixture(){
 const root=await mkdtemp(path.join(tmpdir(),'text templates '));await mkdir(path.join(root,'scenes'));
 const scene={id:'text',preset:'text-template',durationFrames:96,theme:'oxygen-acrylic-purple-dark',background:{style:'static'},textAnimation:{template:'masked-lines',entryFrames:24,holdFrames:48,exitFrames:16},params:{title:'Make the next step clear',eyebrow:'Product story',subtitle:'One idea. Enough time to read.'}};
 await writeFile(path.join(root,'scenes/text.json'),JSON.stringify(scene));await writeFile(path.join(root,'project.json'),JSON.stringify({version:1,name:'Text review',output:{width:640,height:360,fps:24,audio:false},assets:{},scenes:[{id:'text',file:'scenes/text.json'}]}));return root;
}
test('every text template enters, holds without jitter, exits and scrubs deterministically',async()=>{
 const root=await fixture(),server=await createRenderServer(root),browser=await chromium.launch(browserLaunchOptions());
 try{const page=await browser.newPage({viewport:{width:640,height:360}});await page.goto(server.origin);await page.waitForFunction(()=>window.joeFluxReady);
 const rows=await page.evaluate(async()=>{
  const {createSceneRenderer}=await import('/packages/renderer/src/browser-scene.js'),project=await(await fetch('/project.json')).json(),render=createSceneRenderer(project),canvas=document.querySelector('canvas'),rows=[];
  for(const template of ['masked-lines','word-stagger','blur-reveal','keyword-highlight','title-sequence','typing']){
   const scene={...project.scenes[0],textAnimation:{...project.scenes[0].textAnimation,template}},pictures=[];
   for(const f of [0,8,18,40,60,95,8]){await render(canvas,scene,f);pictures.push(canvas.toDataURL());}
   rows.push({template,blankEnds:pictures[0]===pictures[5],holdStable:pictures[3]===pictures[4],holdVisible:pictures[0]!==pictures[3],entryChanges:pictures[1]!==pictures[2],scrubStable:pictures[1]===pictures[6]});
  }return rows;
 });for(const row of rows)for(const key of ['blankEnds','holdStable','holdVisible','entryChanges','scrubStable'])assert.equal(row[key],true,`${row.template}: ${key}`);
 }finally{await browser.close();await server.close();}
});

test('new animation controls save and preview agrees with export at an intermediate frame',async()=>{
 const root=await fixture(),preview=await startPreview(root,0,{app:'classic'}),server=await createRenderServer(root),browser=await chromium.launch(browserLaunchOptions());
 try{const page=await browser.newPage({viewport:{width:1600,height:1000}});await page.goto(preview.url);await page.waitForSelector('canvas[data-rendered-scene]');
 await page.getByLabel('Text animation',{exact:true}).selectOption('word-stagger');await page.getByLabel('Background style',{exact:true}).selectOption('soft-light');
 const [saved]=await Promise.all([page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('/api/scenes/')),page.getByRole('button',{name:'Save',exact:true}).click()]);assert.equal(saved.status(),200,await saved.text());
 await page.reload();await page.waitForSelector('canvas[data-rendered-scene]');assert.equal(await page.getByLabel('Text animation',{exact:true}).inputValue(),'word-stagger');assert.equal(await page.getByLabel('Background style',{exact:true}).inputValue(),'soft-light');
 await page.addStyleTag({content:'.canvas-wrap{width:640px!important;height:360px!important;border-radius:0!important}'});
 const exp=await browser.newPage({viewport:{width:640,height:360}});await exp.goto(server.origin);await exp.waitForFunction(()=>window.joeFluxReady);
 for(const f of [12,60,12]){
  await exp.evaluate(frame=>window.renderScene({sceneId:'text',frame}),f);
  await page.locator('.transport input').evaluate((node,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,String(value));node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));},f);
  await page.waitForFunction(f=>document.querySelector('canvas').dataset.renderedFrame===String(f),f);
  assert.deepEqual(await page.locator('.canvas-wrap').screenshot(),await exp.locator('#stage').screenshot(),`frame ${f}`);
 }
 }finally{await browser.close();await preview.close();await server.close();}
});

test('template layout honors line breaks, fits long copy, and types whole Unicode graphemes',async()=>{
 const root=await fixture(),server=await createRenderServer(root),browser=await chromium.launch(browserLaunchOptions());
 try{const page=await browser.newPage();await page.goto(server.origin);await page.waitForFunction(()=>window.joeFluxReady);
 const result=await page.evaluate(async()=>{
  const {drawTextTemplate}=await import('/packages/motion/src/text-animation.js'),{resolveTheme}=await import('/packages/presets/src/themes.js');
  const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;const ctx=canvas.getContext('2d'),theme=resolveTheme('light-blue'),output={width:1920,height:1080};
  const scene={id:'long',preset:'text-template',durationFrames:96,params:{title:'One idea.\nClearly revealed.',subtitle:'A longer explanatory line can wrap naturally without moving the heading or colliding with adjacent text.'}};
  const result=drawTextTemplate(ctx,scene,40,output,theme),calls=[],original=ctx.fillText.bind(ctx);ctx.fillText=(text,...args)=>{calls.push(text);return original(text,...args);};
  drawTextTemplate(ctx,{...scene,params:{title:'👨‍👩‍👧‍👦 Café'},textAnimation:{template:'typing',entryFrames:24}},4,output,theme);
  let overflow=false;try{drawTextTemplate(ctx,{...scene,params:{title:'W'.repeat(500)}},40,output,theme);}catch(error){overflow=/Scene long/.test(error.message);}
  return {lines:result.title.lines,bounds:result.bounds,typed:calls.filter(Boolean),overflow};
 });assert.deepEqual(result.lines,['One idea.','Clearly revealed.']);assert.ok(result.bounds.y>=96&&result.bounds.y+result.bounds.height<=984);assert.deepEqual(result.typed,['👨‍👩‍👧‍👦']);assert.equal(result.overflow,true);
 }finally{await browser.close();await server.close();}
});
