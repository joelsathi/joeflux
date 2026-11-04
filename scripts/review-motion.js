import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {createRenderServer} from '../packages/renderer/src/server.js';
import {browserLaunchOptions} from '../packages/renderer/src/index.js';
import {loadProject} from '../packages/core/src/io.js';
const root=path.resolve(process.argv[2]??'projects/motion-showcase'),project=await loadProject(root);
const directory=path.join(root,'exports','review');await mkdir(directory,{recursive:true});
const server=await createRenderServer(root),browser=await chromium.launch(browserLaunchOptions());
try {
 const page=await browser.newPage({viewport:{width:project.output.width,height:project.output.height}});
 page.on('pageerror',error=>console.error(error.message));await page.goto(server.origin);await page.waitForFunction(()=>window.joeFluxReady);
 const evidence=[];
 for(const scene of project.scenes.filter(s=>!process.argv[3]||s.id===process.argv[3])) {
  const frames=[0,Math.floor(scene.durationFrames*.35),Math.floor(scene.durationFrames*.55),Math.floor(scene.durationFrames*.8),scene.durationFrames-1];
  for(const frame of frames){await page.evaluate(({sceneId,frame})=>window.renderScene({sceneId,frame}),{sceneId:scene.id,frame});const file=`${scene.id}-${String(frame).padStart(3,'0')}.png`;await page.screenshot({path:path.join(directory,file)});evidence.push({scene:scene.id,frame,file});}
  console.log(`Reviewed samples: ${scene.id}`);
 }
 await writeFile(path.join(directory,'samples.json'),JSON.stringify(evidence,null,2));
}finally{await browser.close();await server.close();}
