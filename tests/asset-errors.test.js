import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {startPreview} from '../packages/preview-server/src/index.js';
test('missing declared assets return an error and keep the preview server alive',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'missing-preview-'));
 await writeFile(path.join(root,'project.json'),JSON.stringify({version:1,name:'Missing',output:{width:640,height:360,fps:24,audio:false},assets:{missing:'assets/missing.svg'},scenes:[]}));
 const server=await startPreview(root,0,{production:true});
 try {
  const result=await fetch(new URL('/project-assets/assets/missing.svg',server.url));
  assert.equal(result.status,404);
  const head=await fetch(new URL('/project-assets/assets/missing.svg',server.url),{method:'HEAD'});
  assert.equal(head.status,404);
  const after=await fetch(new URL('/api/project',server.url),{headers:{'x-joeflux-token':server.token}});
  assert.equal(after.status,200);
 }finally{await server.close();}
});
