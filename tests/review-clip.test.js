import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createProjectTools } from '../packages/tools/src/index.js';
import { probeSilentVideo } from '../packages/assembly/src/media.js';

test('review intervals render precise silent frames, retain uncertainty and leave authored data unchanged', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'review-clip-'));
  t.after(() => rm(root, {recursive:true,force:true}));
  const json = JSON.stringify({version:1,name:'Review',output:{width:320,height:180,fps:24,audio:false},assets:{},scenes:[{id:'title',preset:'text-settle',durationFrames:48,params:{title:''}}]});
  await writeFile(path.join(root,'project.json'),json);
  const tools = createProjectTools(root);
  await assert.rejects(tools.call('review_clip',{id:'title',startFrame:20,endFrame:10}),/interval/i);
  const result = await tools.call('review_clip',{id:'title',startFrame:6,endFrame:18,width:160});
  assert.deepEqual(result.timecodes,{start:.25,end:.75});
  assert.equal(result.frames,12);
  assert.equal(result.reviewStatus,'unreviewed');
  assert.ok(result.unverifiedDimensions.includes('timing-readability'));
  assert.ok(result.fingerprint);
  const media=await probeSilentVideo(result.outputPath);
  assert.deepEqual([media.frames,media.width,media.audioStreams],[12,160,0]);
  assert.equal(await readFile(path.join(root,'project.json'),'utf8'),json);
});
