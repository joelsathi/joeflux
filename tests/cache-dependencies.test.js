import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('cache identity covers source decoding, render page, fonts and each declared scene dependency',async()=>{
  const {sceneFingerprint,engineFingerprint}=await import('../packages/renderer/src/render.js');
  assert.equal(typeof engineFingerprint,'function');assert.equal(typeof sceneFingerprint,'function');
  const root=await mkdtemp(path.join(tmpdir(),'cache paths with spaces '));
  const files=['packages/renderer/src/source-frames.js','packages/motion/src/custom.js','apps/preview/render.html','packages/presets/assets/InterVariable.woff2'];
  for(const file of files){await mkdir(path.dirname(path.join(root,file)),{recursive:true});await writeFile(path.join(root,file),'initial');}
  let previous=await engineFingerprint(root);
  for(const file of files){await writeFile(path.join(root,file),'changed');const next=await engineFingerprint(root);assert.notEqual(next,previous,file);previous=next;}
  await writeFile(path.join(root,'before.png'),'before');await writeFile(path.join(root,'after.png'),'after');await writeFile(path.join(root,'extra.png'),'extra');
  const project={root,output:{fps:24},assets:{before:'before.png',after:'after.png',extra:'extra.png'}};
  const scene={params:{outgoingAsset:'before',incomingAsset:'after'}};
  const a=await sceneFingerprint(project,scene);
  await writeFile(path.join(root,'extra.png'),'unrelated');assert.equal(await sceneFingerprint(project,scene),a);
  await writeFile(path.join(root,'after.png'),'changed');assert.notEqual(await sceneFingerprint(project,scene),a);
});
