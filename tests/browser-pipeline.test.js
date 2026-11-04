import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium} from '@playwright/test';
import {browserLaunchOptions} from '../packages/renderer/src/index.js';
import {createRenderServer} from '../packages/renderer/src/server.js';
import {startPreview} from '../packages/preview-server/src/index.js';
import {renderProject} from '../packages/renderer/src/render.js';

async function fixture(){
 const root=await mkdtemp(path.join(tmpdir(),'harness browser with spaces '));await mkdir(path.join(root,'scenes'));await mkdir(path.join(root,'assets'));
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=320x180:r=30:d=1','-an','-c:v','libx264',path.join(root,'assets','source clip.mp4')]);
 const scene={id:'sample',preset:'recorded-showcase',composition:'full',durationFrames:12,params:{asset:'screen'},playback:{sourceFps:30},zoom:{startFrame:0,endFrame:11,entryFrames:3,exitFrames:3,scale:2,focusX:.75,focusY:.25}};
 await writeFile(path.join(root,'scenes','sample.json'),JSON.stringify(scene));
 await writeFile(path.join(root,'project.json'),JSON.stringify({name:'Browser regression',version:1,output:{width:320,height:180,fps:24,audio:false},assets:{screen:'assets/source clip.mp4'},scenes:[{id:'sample',file:'scenes/sample.json'}]}));return root;
}
test('preview and export produce identical pixels after forward and backward scrubbing',async()=>{
 const root=await fixture(),server=await createRenderServer(root),preview=await startPreview(root,0,{app:'classic'}),browser=await chromium.launch(browserLaunchOptions());
 try{
  const exportPage=await browser.newPage({viewport:{width:320,height:180}}),previewPage=await browser.newPage({viewport:{width:1600,height:1000}});
  await exportPage.goto(server.origin);await exportPage.waitForFunction(()=>window.joeFluxReady);
  await previewPage.goto(preview.url);await previewPage.waitForSelector('canvas[data-rendered-scene="sample"]');
  await previewPage.addStyleTag({content:'.canvas-wrap{width:320px!important;height:180px!important;border-radius:0!important}'});
  for(const frame of [0,8,3,11,0]){
   await exportPage.evaluate(frame=>window.renderScene({sceneId:'sample',frame}),frame);
   await previewPage.locator('.transport input').evaluate((node,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,String(value));node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));},frame);
   await previewPage.waitForFunction(frame=>document.querySelector('canvas')?.dataset.renderedFrame===String(frame),frame);
   const a=await exportPage.locator('#frame').screenshot(),b=await previewPage.locator('.canvas-wrap').screenshot();assert.deepEqual(a,b,`frame ${frame}`);
  }
 }finally{await browser.close();await preview.close();await server.close();}
});
test('cancelled rendering preserves sources, recovers, and exports exact silent frames',async()=>{
 const root=await fixture(),source=path.join(root,'assets','source clip.mp4'),original=await readFile(source),controller=new AbortController();
 await assert.rejects(renderProject(root,{signal:controller.signal,onProgress:event=>{if(event.frame===2)controller.abort();}}),/cancel|abort/i);
 await assert.rejects(access(path.join(root,'exports','clips','sample.rendering.mp4')));
 const result=await renderProject(root);assert.equal(result.rendered,1);
 const media=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',path.join(root,'exports','clips','sample.mp4')],{encoding:'utf8'}));
 assert.equal(media.streams.length,1);assert.equal(media.streams[0].codec_type,'video');assert.equal(Number(media.streams[0].nb_frames),12);
 assert.deepEqual(await readFile(source),original);assert.equal((await renderProject(root)).cached,1);
});
test('optional dark font and wordmark render entirely from loopback assets',async()=>{
 const root=await fixture(),server=await createRenderServer(root),browser=await chromium.launch(browserLaunchOptions());
 try{const page=await browser.newPage({viewport:{width:320,height:180}});const external=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(server.origin)){external.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(server.origin);
 const loaded=await page.evaluate(async()=>{
  const {createSceneRenderer}=await import('/packages/renderer/src/browser-scene.js');const project=await(await fetch('/project.json')).json();project.theme='navy-dark';
  await createSceneRenderer(project)(document.querySelector('canvas'),project.scenes[0],6);
  return {font:document.fonts.check('600 32px "Harness Inter"')};
 });assert.equal(loaded.font,true);assert.deepEqual(external,[]);
 }finally{await browser.close();await server.close();}
});
test('clearing and adding a reading freeze creates a valid saved range',async()=>{
 const root=await fixture();const scenePath=path.join(root,'scenes','sample.json');const scene=JSON.parse(await readFile(scenePath,'utf8'));scene.durationFrames=144;scene.playback.holds=[];await writeFile(scenePath,JSON.stringify(scene));
 const preview=await startPreview(root,0,{app:'classic'}),browser=await chromium.launch(browserLaunchOptions());
 try{const page=await browser.newPage({viewport:{width:1600,height:1000}});await page.goto(preview.url);await page.waitForSelector('canvas[data-rendered-scene="sample"]');
 await page.getByRole('button',{name:'Clear freezes',exact:true}).click();await page.getByRole('button',{name:'Add reading freeze',exact:true}).click();
 const [response]=await Promise.all([page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('/api/scenes/')),page.getByRole('button',{name:'Save',exact:true}).click()]);assert.equal(response.status(),200,await response.text());
 const saved=JSON.parse(await readFile(scenePath,'utf8'));assert.ok(saved.playback.holds[0].outputEnd>=saved.playback.holds[0].outputStart);
 }finally{await browser.close();await preview.close();}
});
test('invalid and stale scene saves return structured errors and leave the service alive',async()=>{
 const root=await fixture(),preview=await startPreview(root,0,{app:'classic'}),headers={'x-joeflux-token':preview.token,'content-type':'application/json'};
 try{const project=await(await fetch(new URL('/api/project',preview.url),{headers})).json(),scene=project.scenes[0];
 for(const body of [{scene:{...scene,durationFrames:0},fingerprint:scene.fingerprint},{scene,fingerprint:'stale'}]){
  const response=await fetch(new URL('/api/scenes/sample',preview.url),{method:'PUT',headers,body:JSON.stringify(body)});
  assert.equal(response.status,400);assert.equal(typeof(await response.json()).error,'string');
 }
 assert.equal((await fetch(new URL('/api/project',preview.url),{headers})).status,200);
 }finally{await preview.close();}
});
