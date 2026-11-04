import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {validateProject} from '../packages/core/src/index.js';
import {createRenderServer} from '../packages/renderer/src/server.js';
import {browserLaunchOptions} from '../packages/renderer/src/index.js';

const output={width:960,height:540,fps:24,audio:false};
const motions=['line-wipe','scale-pop','word-stagger','caption-over-screen'];
const scene=(animation='line-wipe',durationFrames=96,text='One clear point')=>({id:animation,kind:'screen',durationFrames,screen:{asset:'demo',presentation:'studio'},camera:{shots:[{at:0}]},caption:{text,animation}});
const validate=(value,fps=24)=>validateProject({output:{...output,fps},assets:{demo:'assets/demo.svg'},scenes:[value]});

test('screen captions reserve a settled reading hold at output fps, including very short scenes',()=>{
 for(const motion of motions){
  assert.equal(validate(scene(motion)).valid,true,motion);
  const report=validate(scene(motion,2,'A long caption needs enough time to read every word before it disappears.'));
  assert.equal(report.valid,false,motion);
  assert.match(report.errors.join('\n'),/caption.*reading hold/i);
 }
 assert.equal(validate(scene('line-wipe',48,'One clear point'),24).valid,true);
 assert.equal(validate(scene('line-wipe',48,'One clear point'),60).valid,false,'same frames at 60 fps are too brief');
 assert.equal(validate(scene('line-wipe',96,'   \n  ')).valid,false,'blank caption is invalid');
 assert.equal(validate(scene('word-stagger',96,'你好，世界 👨‍👩‍👧‍👦 cafe\u0301')).valid,true);
 assert.equal(validate({...scene('line-wipe',2),caption:undefined}).valid,true,'caption-free short scenes stay valid');
 // Frames a transition blends with a neighbour do not count as reading time.
 const shot={...scene('line-wipe',48,'Ship faster'),transition:{type:'side-slide',frames:36}},next={...scene('scale-pop',48),id:'next'};
 const project=(scenes)=>validateProject({output,assets:{demo:'assets/demo.svg'},scenes});
 assert.equal(validate(shot).valid,true,'a last shot never plays its transition');
 const report=project([shot,next]);
 assert.equal(report.valid,false);assert.match(report.errors.join('\n'),/frames at 24 fps, not counting frames blended by transitions/);
 assert.equal(project([{...shot,transition:{type:'crossfade',frames:6}},next]).valid,true);
});

test('all four caption motions have distinct intermediate frames, a stable hold, and deterministic exit',async(t)=>{
 const root=await mkdtemp(path.join(tmpdir(),'caption-review-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(path.join(root,'assets'));await mkdir(path.join(root,'scenes'));
 await writeFile(path.join(root,'assets/demo.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#e7eaf0"/><rect x="100" y="70" width="760" height="320" rx="12" fill="#21436d"/></svg>');
 const unicode='你好，世界 👨‍👩‍👧‍👦 cafe\u0301';
 const scenes=[...motions.map(motion=>scene(motion,96,motion==='word-stagger'?unicode:'One clear point')),{...scene('word-stagger',96,'“Ship faster!” (today)'),id:'punctuation'}];
 for(const value of scenes)await writeFile(path.join(root,'scenes',`${value.id}.json`),JSON.stringify(value));
 await writeFile(path.join(root,'project.json'),JSON.stringify({name:'Caption review',version:1,output,assets:{demo:'assets/demo.svg'},scenes:scenes.map(({id})=>({id,file:`scenes/${id}.json`}))}));
 const server=await createRenderServer(root);let browser;
 try{
  browser=await chromium.launch(browserLaunchOptions());const page=await browser.newPage({viewport:{width:960,height:540}});
  await page.goto(server.origin);await page.waitForFunction(()=>window.joeFluxReady);
  const inspect=async(id,frame)=>page.evaluate(async({id,frame})=>{
   await window.renderScene({sceneId:id,frame});const node=document.querySelector('[data-screen-caption]');
   return {text:node.textContent,opacity:+node.style.opacity,transform:node.style.transform,clip:node.style.clipPath,blur:node.style.backdropFilter,words:[...node.querySelectorAll('[data-caption-word]')].map(word=>({text:word.textContent,opacity:+word.style.opacity,transform:word.style.transform})),width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height};
  },{id,frame});
  const entries={};
  for(const id of motions){
   assert.equal((await inspect(id,0)).opacity,0,id);
   entries[id]=await inspect(id,7.5);
   await page.screenshot({path:path.join(root,`${id}-entry.png`)});
   const hold=await inspect(id,30),late=await inspect(id,65);
   assert.deepEqual(hold,late,`${id} remains fully settled while reading`);
   assert.equal(hold.opacity,1);assert.ok(hold.width<=560&&hold.height<180,`${id} remains in the safe area`);
   assert.equal(hold.text,id==='word-stagger'?unicode:'One clear point');
   for(const word of hold.words){assert.equal(word.opacity,1);assert.match(word.transform,/0px/);}
   await page.screenshot({path:path.join(root,`${id}-hold.png`)});
   const exiting=await inspect(id,88);assert.ok(exiting.opacity>0&&exiting.opacity<1,id);
   assert.equal((await inspect(id,95)).opacity,0,id);
   assert.deepEqual(await inspect(id,7.5),entries[id],`${id} seeking is deterministic`);
  }
  assert.match(entries['line-wipe'].clip,/inset/);
  assert.equal(entries['scale-pop'].clip,'none');assert.match(entries['scale-pop'].transform,/scale\(0\./);
  const words=entries['word-stagger'].words;
  assert.ok(words.length>=3,'stagger creates independently animated word spans');
  assert.ok(words[0].opacity>words.at(-1).opacity,'later words enter after earlier words');
  assert.ok(words.some(word=>word.text==='👨‍👩‍👧‍👦'),'emoji graphemes stay intact');
  assert.ok(words.some(word=>word.text==='cafe\u0301'),'combining marks stay attached');
  for(const id of motions)assert.equal(entries[id].blur,id==='caption-over-screen'?'blur(24px)':'none',id);
  assert.deepEqual((await inspect('punctuation',30)).words.map(word=>word.text),['“Ship','faster!”','(today)'],'punctuation stays with its word');
  assert.match(entries['caption-over-screen'].transform,/translateY/);
 }finally{await browser?.close();await server.close();}
});
