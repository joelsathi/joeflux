import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createRenderServer } from '../packages/renderer/src/server.js';
import { browserLaunchOptions } from '../packages/renderer/src/index.js';

test('actual Canvas title and subtitle glyphs remain inside their copy region', async () => {
  const server=await createRenderServer(new URL('../projects/demo',import.meta.url).pathname);
  const browser=await chromium.launch(browserLaunchOptions());
  try {
    const page=await browser.newPage(); await page.goto(server.origin);
    const drawn=await page.evaluate(async () => {
      const {renderFrameToCanvas}=await import('/modules/motion.js');
      const canvas=document.createElement('canvas'), ctx=canvas.getContext('2d'), calls=[];
      const original=ctx.fillText.bind(ctx);
      ctx.fillText=(text,x,y)=>{calls.push({text,x,y,width:ctx.measureText(text).width,font:ctx.font}); original(text,x,y);};
      renderFrameToCanvas(canvas,{id:'long-copy',preset:'recorded-showcase',durationFrames:120,params:{title:'A thoughtful product story with clarity',subtitle:'Keep the supporting explanation within its own column.'}},60,{width:1920,height:1080,fps:24});
      return calls;
    });
    assert.ok(drawn.length>2);
    for (const line of drawn) assert.ok(line.width<=536,`${line.text}: ${line.width}px (${line.font})`);
  } finally {await browser.close();await server.close();}
});
test('camera movement cannot silently cover a visible caption',async()=>{
 const server=await createRenderServer(new URL('../projects/demo',import.meta.url).pathname),browser=await chromium.launch(browserLaunchOptions());
 try{const page=await browser.newPage({viewport:{width:1920,height:1080}});await page.goto(server.origin);
 await assert.rejects(page.evaluate(async()=>{
  const {createSceneRenderer}=await import('/packages/renderer/src/browser-scene.js');const project=await(await fetch('/project.json')).json();
  await createSceneRenderer(project)(document.querySelector('canvas'),{id:'overlap',preset:'recorded-showcase',durationFrames:120,params:{title:'Keep this readable',asset:'productScreen'},camera:{start:{x:-500},end:{x:-500}}},60);
 }),/overlaps.*copy/);
 }finally{await browser.close();await server.close();}
});
