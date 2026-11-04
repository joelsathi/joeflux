import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {browserLaunchOptions} from '../packages/renderer/src/index.js';
import {createRenderServer} from '../packages/renderer/src/server.js';
import {startPreview} from '../packages/preview-server/src/index.js';

async function fixture(){
 const root=await mkdtemp(path.join(tmpdir(),'harness refinement '));await mkdir(path.join(root,'scenes'));await mkdir(path.join(root,'assets'));
 for(const [name,color] of [['a','#176d99'],['b','#d9672c']])await writeFile(path.join(root,`assets/${name}.svg`),`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="${color}"/><path d="M0 540H1920M960 0V1080" stroke="white" stroke-width="12"/></svg>`);
 const scene={id:'connection',preset:'screen-handoff',connectionStyle:'continuous',durationFrames:144,params:{asset:'a',outgoingAsset:'a',incomingAsset:'b',title:'A clear next step',subtitle:'Keep the important detail in view.'}};
 await writeFile(path.join(root,'scenes/connection.json'),JSON.stringify(scene));
 await writeFile(path.join(root,'project.json'),JSON.stringify({version:1,name:'Refinement',output:{width:640,height:360,fps:24,audio:false},assets:{a:'assets/a.svg',b:'assets/b.svg'},scenes:[{id:scene.id,file:'scenes/connection.json'}]}));return root;
}

test('Oxygen gradients render spatial color variation with offline fonts',async()=>{
 const root=await fixture(),server=await createRenderServer(root),browser=await chromium.launch(browserLaunchOptions());
 try{const page=await browser.newPage({viewport:{width:640,height:360}}),external=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(server.origin)){external.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(server.origin);await page.waitForFunction(()=>window.joeFluxReady);
 const result=await page.evaluate(async()=>{
  const {createSceneRenderer}=await import('/packages/renderer/src/browser-scene.js');
  const {THEME_NAMES}=await import('/packages/presets/src/themes.js');
  const project=await(await fetch('/project.json')).json(),canvas=document.querySelector('canvas'),results=[];
  for(const theme of THEME_NAMES.filter(n=>n.startsWith('oxygen-'))){
   await createSceneRenderer({...project,theme})(canvas,{id:'palette',preset:'text-settle',durationFrames:72,params:{title:'One clear idea'}},40);
   results.push({theme,font:document.fonts.check('600 32px "Harness Inter"'),pixels:[[420,108],[96,180],[320,320]].map(([x,y])=>Array.from(canvas.getContext('2d').getImageData(x,y,1,1).data))});
  }return results;
 });
 assert.equal(result.length,10);
 for(const row of result)assert.equal(row.font,true);
 const purple=result.find(r=>r.theme==='oxygen-acrylic-purple-dark');assert.notDeepEqual(purple.pixels[0],purple.pixels[1]);
 assert.deepEqual(external,[]);
 }finally{await browser.close();await server.close();}
});

test('continuous scenes keep copy clear at every frame and preview saves the shared theme/style choices',async()=>{
 const root=await fixture(),server=await createRenderServer(root),preview=await startPreview(root,0,{app:'classic'}),browser=await chromium.launch(browserLaunchOptions());
 try{const page=await browser.newPage({viewport:{width:640,height:360}});await page.goto(server.origin);await page.waitForFunction(()=>window.joeFluxReady);
 await page.evaluate(async()=>{
  const {createSceneRenderer}=await import('/packages/renderer/src/browser-scene.js');const project=await(await fetch('/project.json')).json();const render=createSceneRenderer(project),canvas=document.querySelector('canvas');
  for(const preset of ['screen-handoff','product-reveal','side-slide'])for(let frame=0;frame<144;frame++)await render(canvas,{...project.scenes[0],preset},frame);
 });
 const ui=await browser.newPage({viewport:{width:1600,height:1000}});await ui.goto(preview.url);await ui.waitForSelector('canvas[data-rendered-scene]');
 await ui.getByLabel('Connection style',{exact:true}).selectOption('classic');
 await ui.getByLabel('Theme',{exact:true}).selectOption('oxygen-acrylic-purple-dark');
 const [saved]=await Promise.all([ui.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('/api/scenes/')),ui.getByRole('button',{name:'Save',exact:true}).click()]);assert.equal(saved.status(),200);
 await ui.reload();await ui.waitForSelector('canvas[data-rendered-scene]');assert.equal(await ui.getByLabel('Connection style',{exact:true}).inputValue(),'classic');assert.equal(await ui.getByLabel('Theme',{exact:true}).inputValue(),'oxygen-acrylic-purple-dark');
 const [themeSaved]=await Promise.all([ui.waitForResponse(r=>r.request().method()==='PUT'&&r.url().endsWith('/api/project')),ui.getByLabel('Project theme',{exact:true}).selectOption('oxygen-wso2-light')]);
 assert.equal(themeSaved.status(),200,await themeSaved.text());
 await ui.waitForFunction(()=>document.querySelector('[aria-label="Project theme"]').value==='oxygen-wso2-light');
 assert.equal(await ui.getByLabel('Project theme',{exact:true}).inputValue(),'oxygen-wso2-light');
 }finally{await browser.close();await preview.close();await server.close();}
});
