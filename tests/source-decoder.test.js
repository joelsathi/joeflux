import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as frames from '../packages/renderer/src/source-frames.js';

test('PTS selection uses the containing presentation interval including VFR gaps',()=>{
  assert.equal(typeof frames.selectSourceFrame,'function');
  const pts=[0,.04,.12,.2];
  assert.equal(frames.selectSourceFrame(pts,.119),1);
  assert.equal(frames.selectSourceFrame(pts,.12),2);
  assert.equal(frames.selectSourceFrame(pts,99),3);
  assert.equal(frames.selectSourceFrame(pts,-1),0);
});
test('decodes actual VFR sources once, retains timestamps, and recovers after cancellation',async()=>{
  const {getSourceFrame}=await import('../packages/renderer/src/decoder.js');
  const root=await mkdtemp(path.join(tmpdir(),'video source with spaces '));
  const source=path.join(root,'source clip.mp4');
  execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc2=s=160x90:r=30:d=1','-vf',"select='eq(mod(n,3),0)+eq(n,1)'",'-fps_mode','vfr','-an','-c:v','libx264',source]);
  const original=await readFile(source), cache=path.join(root,'.runtime');
  const aborted=new AbortController();aborted.abort();
  await assert.rejects(getSourceFrame(source,.1,{cacheRoot:cache,signal:aborted.signal}), /abort/i);
  const a=await getSourceFrame(source,.05,{cacheRoot:cache});
  const b=await getSourceFrame(source,.09,{cacheRoot:cache});
  const c=await getSourceFrame(source,.1,{cacheRoot:cache});
  assert.equal(a.index,1);assert.equal(b.index,1);assert.equal(c.index,2);
  assert.equal(a.path,b.path);assert.ok((await readFile(a.path)).length>100);
  assert.deepEqual(await readFile(source),original);
  await assert.rejects(getSourceFrame(path.join(root,'missing.mp4'),0,{cacheRoot:cache}));
  await writeFile(path.join(root,'broken.mp4'),'invalid');
  await assert.rejects(getSourceFrame(path.join(root,'broken.mp4'),0,{cacheRoot:cache}));
});
