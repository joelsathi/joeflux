import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {validateProject,buildAssemblyPlan,TRANSITION_TYPES} from '../packages/core/src/index.js';
import {buildFilterGraph} from '../packages/assembly/src/index.js';
import {createRenderServer} from '../packages/renderer/src/server.js';
import {renderProject,renderPreview} from '../packages/renderer/src/render.js';
import {probeSilentVideo} from '../packages/assembly/src/media.js';
import {browserLaunchOptions} from '../packages/renderer/src/index.js';

const output={width:640,height:360,fps:24,audio:false};
const title={id:'title',preset:'text-settle',durationFrames:48,params:{title:'A better view'}};

test('new transitions produce frame accurate assembly plans',()=>{
  for(const type of TRANSITION_TYPES.filter(value=>value!=='cut')){
    const project={output,assets:{},scenes:[{...title,transition:{type,frames:8}},{...title,id:'end'}]};
    assert.equal(validateProject(project).valid,true,type);
    assert.equal(buildAssemblyPlan(project).totalFrames,88,type);
    assert.match(buildFilterGraph({fps:24,clips:buildAssemblyPlan(project).clips}).filter,/xfade=transition=/,type);
  }
});

test('WebGL compositor applies the cinematic LUT on exact preview frames',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'webgl look '));await mkdir(path.join(root,'scenes'));
  await writeFile(path.join(root,'scenes/title.json'),JSON.stringify(title));
  await writeFile(path.join(root,'project.json'),JSON.stringify({name:'Look',version:1,output,assets:{},scenes:[{id:'title',file:'scenes/title.json'}]}));
  const server=await createRenderServer(root);let browser;
  try{
    browser=await chromium.launch(browserLaunchOptions());
    const page=await browser.newPage({viewport:{width:640,height:360}});
    await page.goto(server.origin);await page.waitForFunction(()=>window.joeFluxReady);
    const result=await page.evaluate(async()=>{
      const scene=(await(await fetch('/project.json')).json()).scenes[0],canvas=document.querySelector('canvas');
      await window.renderPreviewScene({scene,frame:22});
      const original=[...canvas.getContext('2d').getImageData(50,50,1,1).data];
      const originalFar=[...canvas.getContext('2d').getImageData(550,310,1,1).data];
      await window.renderPreviewScene({scene:{...scene,compositor:{look:'cinematic',depthOfField:.6,light:.7}},frame:22});
      const styled=[...canvas.getContext('2d').getImageData(50,50,1,1).data];
      const styledFar=[...canvas.getContext('2d').getImageData(550,310,1,1).data];
      return {original,styled,originalFar,styledFar,transform:canvas.getContext('2d').getTransform().a,dimensions:[canvas.width,canvas.height],webgl:!!document.createElement('canvas').getContext('webgl2')};
    });
    assert.equal(result.webgl,true);
    assert.notDeepEqual(result.original,result.styled);
    assert.ok(result.originalFar.slice(0,3).reduce((change,value,index)=>change+Math.abs(value-result.styledFar[index]),0)>12,'look must cover the full scaled output');
  }finally{await browser?.close();await server.close();}
});

test('WebGL temporal accumulation exports exact silent frames',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'webgl temporal '));await mkdir(path.join(root,'scenes'));
  const blurred={...title,durationFrames:8,motionBlur:{enabled:true,samples:2,shutter:.5,accumulator:'webgl'}};
  await writeFile(path.join(root,'scenes/title.json'),JSON.stringify(blurred));
  await writeFile(path.join(root,'project.json'),JSON.stringify({name:'Temporal',version:1,output:{width:320,height:180,fps:24,audio:false},assets:{},scenes:[{id:'title',file:'scenes/title.json'}]}));
  assert.equal(validateProject({output:{width:320,height:180,fps:24,audio:false},assets:{},scenes:[blurred]}).valid,true);
  const server=await createRenderServer(root);let browser;
  try{
    browser=await chromium.launch(browserLaunchOptions());
    const page=await browser.newPage();await page.goto(server.origin);await page.waitForFunction(()=>window.joeFluxReady);
    const colors=await page.evaluate(async()=>{
      const source=document.createElement('canvas');source.width=8;source.height=8;
      const context=source.getContext('2d');context.fillStyle='#ff0000';context.fillRect(0,0,8,4);context.fillStyle='#0000ff';context.fillRect(0,4,8,4);
      const encoded=source.toDataURL('image/png').split(',')[1];
      const result=await window.accumulateFramesWebgl([encoded,encoded]);
      const image=new Image();image.src=`data:image/png;base64,${result}`;await image.decode();context.drawImage(image,0,0);
      return {top:[...context.getImageData(4,1,1,1).data],bottom:[...context.getImageData(4,6,1,1).data]};
    });
    assert.ok(colors.top[0]>colors.top[2]&&colors.bottom[2]>colors.bottom[0],`GPU blur inverted the image: ${JSON.stringify(colors)}`);
  }finally{await browser?.close();await server.close();}
  const result=await renderProject(root);
  const media=await probeSilentVideo(result.scenes[0].outputPath);
  assert.equal(media.frames,8);
  assert.equal(media.audioStreams,0);
  const preview=await renderPreview(root,{sceneId:'title',seconds:.2,width:160});
  const previewMedia=await probeSilentVideo(preview.outputPath);
  assert.equal(previewMedia.width,160);
  assert.equal(previewMedia.frames,5);
});
