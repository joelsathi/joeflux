import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {startPreview} from '../packages/preview-server/src/index.js';
import {browserLaunchOptions} from '../packages/renderer/src/index.js';

const A={focus:[.3,.3],zoom:2},B={focus:[.7,.6],zoom:2};
async function eventually(check){const end=Date.now()+8000;for(;;){try{return await check();}catch(e){if(Date.now()>end)throw e;await new Promise(r=>setTimeout(r,75));}}}
async function fixture(){
 const root=await mkdtemp(path.join(tmpdir(),'harness studio fixes '));await mkdir(path.join(root,'scenes'));await mkdir(path.join(root,'assets'));
 await writeFile(path.join(root,'assets/screen.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#345"/><rect x="100" y="50" width="200" height="200" fill="#ef8"/></svg>');
 const shots=[{at:0},{at:.15,...A},{at:.25,...A},{at:.45,...B,ease:'gentle'},{at:.6,...B},{at:.75,...A},{at:.85,...A},{at:1}];
 const scene={id:'tour',kind:'screen',durationFrames:48,screen:{asset:'clip',presentation:'studio',shadow:'deep'},camera:{shots},motionBlur:{samples:12,shutter:.7}};
 const plain={id:'plain',preset:'recorded-showcase',composition:'full',durationFrames:48,params:{asset:'clip'}};
 const unsafe={...plain,id:'unsafe',composition:undefined,params:{asset:'clip',title:'Preserve caption'}};
 for(const item of [scene,plain,unsafe])await writeFile(path.join(root,'scenes',item.id+'.json'),JSON.stringify(item));
 await writeFile(path.join(root,'project.json'),JSON.stringify({name:'Studio fixes',version:1,output:{width:320,height:180,fps:12,audio:false},assets:{clip:'assets/screen.svg'},scenes:['tour','plain','unsafe'].map(id=>({id,file:`scenes/${id}.json`}))}));
 return root;
}
test('Studio edits area pacing, preserves blur quality, previews exports and selects matching shots', {timeout:120000},async()=>{
 const root=await fixture(),preview=await startPreview(root,0,{agents:{}}),browser=await chromium.launch(browserLaunchOptions());
 const page=await browser.newPage({viewport:{width:1500,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const saved=async(id='tour')=>JSON.parse(await readFile(path.join(root,'scenes',id+'.json'),'utf8'));
 try{
  await page.goto(preview.url);await page.waitForSelector('canvas[data-rendered-scene="tour"]');
  const before=(await saved()).camera.shots;
  await page.getByRole('group',{name:'Area 1 pacing',exact:true}).getByRole('button',{name:'Pass through'}).click();
  await eventually(async()=>{const camera=(await saved()).camera;assert.equal(camera.flow,true);assert.equal(camera.shots.length,before.length-1);assert.deepEqual(camera.shots.slice(2),before.slice(3));});
  await page.getByRole('group',{name:'Area 1 pacing',exact:true}).getByRole('button',{name:'Hold',exact:true}).click();
  const hold=page.getByRole('spinbutton',{name:'Area 1 hold (seconds)',exact:true});await hold.fill('0.1');await hold.press('Enter');
  await eventually(async()=>{const shots=(await saved()).camera.shots;assert.ok(Math.abs(shots[2].at-shots[1].at-.1*12/47)<1e-8);assert.deepEqual(shots.slice(3),before.slice(3));});
  const timed=(await saved()).camera.shots;
  await page.getByRole('button',{name:'Move area 1 later',exact:true}).click();
  await eventually(async()=>{const shots=(await saved()).camera.shots;assert.deepEqual(shots.map(s=>s.at),timed.map(s=>s.at));assert.deepEqual(shots[1].focus,B.focus);assert.equal(shots[3].ease,'gentle');});
  await page.getByRole('tab',{name:'Look',exact:true}).click();
  await page.getByText(/12 samples per frame/).waitFor();
  const blur=page.getByLabel('Motion blur (export)',{exact:true});await blur.uncheck();
  await eventually(async()=>assert.deepEqual((await saved()).motionBlur,{enabled:false,samples:12,shutter:.7}));
  await blur.check();await eventually(async()=>assert.deepEqual((await saved()).motionBlur,{enabled:true,samples:12,shutter:.7}));
  await page.getByRole('button',{name:'Draft',exact:true}).click();await eventually(async()=>assert.equal((await saved()).motionBlur.samples,4));
  await eventually(async()=>assert.equal(await page.getByRole('slider',{name:'Motion blur shutter',exact:true}).isEnabled(),true));
  await page.getByRole('slider',{name:'Motion blur shutter',exact:true}).focus();await page.keyboard.press('ArrowRight');
  await eventually(async()=>assert.equal((await saved()).motionBlur.shutter,.75));
  await page.getByRole('button',{name:'Preview 1 second',exact:true}).click();
  const video=page.getByLabel('Export sample video');await video.waitFor({timeout:30000});
  await eventually(async()=>assert.equal(await video.evaluate(v=>v.readyState>=2),true));
  const partial=await page.request.get(new URL(await video.getAttribute('src'),page.url()).href,{headers:{Range:'bytes=0-15'}});
  assert.equal(partial.status(),206);assert.equal((await partial.body()).length,16);
  assert.equal((await page.request.get(new URL('/project-assets/.runtime/previews/missing.mp4',page.url()).href)).status(),404);
  await page.screenshot({animations:'disabled',path:'/tmp/harness-studio-blur-review.png'});
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await eventually(async()=>assert.equal(await page.getByRole('button',{name:'Export',exact:true}).isEnabled(),true));
  await page.getByRole('tab',{name:'Screen',exact:true}).click();
  await page.getByRole('button',{name:'Apply to all shots',exact:true}).click();
  await page.getByText('1 eligible · 1 skipped',{exact:true}).waitFor();
  assert.equal((await saved('plain')).kind,undefined,'opening preview makes no changes');
  await page.getByText(/unsafe:.*captions/).waitFor();
  await page.screenshot({animations:'disabled',path:'/tmp/harness-studio-match-review.png'});
  await page.getByRole('button',{name:'Apply to 1 shot',exact:true}).click();
  await eventually(async()=>assert.equal((await saved('plain')).screen.shadow,'deep'));
  assert.equal((await saved('unsafe')).params.title,'Preserve caption');
  await page.getByRole('button',{name:/Shot 2: plain/}).click();
  await page.getByRole('tab',{name:'Look',exact:true}).click();
  await page.getByRole('button',{name:'High',exact:true}).click();
  await eventually(async()=>assert.deepEqual((await saved('plain')).motionBlur,{enabled:false,samples:16,shutter:.5}));
  assert.equal(await page.getByLabel('Motion blur (export)',{exact:true}).isChecked(),false);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await preview.close();}
});
