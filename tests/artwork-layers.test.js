import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { validateProject } from '../packages/core/src/index.js';
import { createRenderServer } from '../packages/renderer/src/server.js';
import { browserLaunchOptions } from '../packages/renderer/src/index.js';
import { createProjectTools } from '../packages/tools/src/index.js';

const output={width:640,height:360,fps:24,audio:false};
const scene={id:'title',preset:'text-settle',durationFrames:48,params:{title:'Artwork'},layers:[
  {type:'svg',asset:'mark',x:.04,y:.08,width:.18,height:.24},
  {type:'lottie',asset:'motion',x:.7,y:.1,width:.2,height:.34},
]};
const motion={v:'5.13.0',fr:24,ip:0,op:48,w:160,h:160,nm:'Moving dot',ddd:0,assets:[],layers:[{ddd:0,ind:1,ty:4,nm:'Dot',sr:1,ks:{o:{a:0,k:100},r:{a:0,k:0},p:{a:0,k:[0,0,0]},a:{a:0,k:[0,0,0]},s:{a:0,k:[100,100,100]}},ao:0,shapes:[{ty:'el',p:{a:1,k:[{t:0,s:[30,80],e:[130,80],i:{x:1,y:1},o:{x:0,y:0}},{t:47,s:[130,80]}]},s:{a:0,k:[32,32]},nm:'Circle'},{ty:'fl',c:{a:0,k:[1,.3,.1,1]},o:{a:0,k:100},r:1,nm:'Fill'},{ty:'tr',p:{a:0,k:[0,0]},a:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:{a:0,k:100}}],ip:0,op:48,st:0,bm:0}]};

test('artwork layers validate asset types, bounds and timing',()=>{
  const project={output,assets:{mark:'assets/mark.svg',motion:'assets/motion.json'},scenes:[scene]};
  assert.equal(validateProject(project).valid,true,validateProject(project).errors.join('\n'));
  assert.match(validateProject({...project,scenes:[{...scene,layers:[{...scene.layers[0],x:.9}]}]}).errors.join(' '),/exceeds the stage/);
  assert.match(validateProject({...project,scenes:[{...scene,layers:[{...scene.layers[1],asset:'mark'}]}]}).errors.join(' '),/Bodymovin JSON/);
});

test('SVG and Lottie layers render and Lottie seeks to the requested frame',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'artwork layers '));
  await mkdir(path.join(root,'assets'));await mkdir(path.join(root,'scenes'));
  await writeFile(path.join(root,'assets/mark.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><circle cx="40" cy="40" r="36" fill="#ff7043"/></svg>');
  await writeFile(path.join(root,'assets/motion.json'),JSON.stringify(motion));
  await writeFile(path.join(root,'scenes/title.json'),JSON.stringify(scene));
  await writeFile(path.join(root,'project.json'),JSON.stringify({name:'Artwork',version:1,output,assets:{mark:'assets/mark.svg',motion:'assets/motion.json'},scenes:[{id:'title',file:'scenes/title.json'}]}));
  const server=await createRenderServer(root);let browser;
  try{
    browser=await chromium.launch(browserLaunchOptions());
    const page=await browser.newPage({viewport:{width:640,height:360}});
    await page.goto(server.origin);await page.waitForFunction(()=>window.joeFluxReady);
    const frames=await page.evaluate(async()=>{
      const result=[];
      for(const frame of [0,24,47]){
        await window.renderScene({sceneId:'title',frame});
        const nodes=[...document.querySelectorAll('[data-artwork-layer]')];
        const shape=nodes[1]?.querySelector('path'),box=shape?.getBBox();
        result.push({count:nodes.length,svg:!!nodes[0]?.querySelector('img'),lottie:!!nodes[1]?.querySelector('svg'),x:box?.x,html:nodes[1]?.innerHTML.slice(0,600)});
      }
      return result;
    });
    assert.ok(frames.every(item=>item.count===2&&item.svg&&item.lottie),JSON.stringify(frames));
    assert.ok(frames.every(item=>item.x>0),'artwork must be visible inside its SVG viewport');
    assert.ok(frames[0].x<frames[1].x&&frames[1].x<frames[2].x,'the visible artwork must move at the requested frames');
  }finally{await browser?.close();await server.close();}
});

test('studio artwork import is one undoable tool change',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'artwork import '));
  await mkdir(path.join(root,'scenes'));
  await writeFile(path.join(root,'scenes/title.json'),JSON.stringify({...scene,layers:[]}));
  await writeFile(path.join(root,'project.json'),JSON.stringify({name:'Artwork',version:1,output,assets:{},scenes:[{id:'title',file:'scenes/title.json'}]}));
  const tools=createProjectTools(root);
  await tools.call('artwork_import',{name:'mark',type:'svg',content:'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"></svg>'});
  assert.equal((await tools.call('project_get')).assets.mark,'assets/mark.svg');
  await tools.call('history_undo');
  assert.equal((await tools.call('project_get')).assets.mark,undefined);
  await assert.rejects(tools.call('artwork_import',{name:'bad',type:'svg',content:'<svg onload="alert(1)"></svg>'}),/self-contained/);
});
