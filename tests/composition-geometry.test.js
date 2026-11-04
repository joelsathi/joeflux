import test from 'node:test';
import assert from 'node:assert/strict';
import {cropRect,drawCrop,moveCrop,resizeCrop,motionFromCrop} from '../apps/preview/src/composition-geometry.js';
import {validateProject} from '../packages/core/src/index.js';

test('drawing in either direction keeps a bounded crop and enforces the zoom limit',()=>{
  assert.deepEqual(drawCrop({x:.75,y:.75},{x:.25,y:.25}),{x:.25,y:.25,size:.5});
  assert.deepEqual(drawCrop({x:.95,y:.95},{x:1,y:1}),{x:.75,y:.75,size:.25});
  assert.deepEqual(moveCrop({x:.25,y:.25,size:.5},-2,2),{x:0,y:.5,size:.5});
});
test('corner resizing preserves the opposite corner and constrains both pan endpoints',()=>{
  const rect={x:.25,y:.25,size:.5};
  assert.deepEqual(resizeCrop(rect,'nw',{x:.5,y:.5}),{x:.5,y:.5,size:.25});
  assert.deepEqual(resizeCrop(rect,'se',{x:2,y:2}),{x:.25,y:.25,size:.75});
  const m=motionFromCrop({preset:'detail-pan',scale:4,focusX:.125,focusY:.125,endFocusX:.875,endFocusY:.875},rect,'to');
  assert.equal(m.scale,2);assert.equal(m.focusX,.25);assert.equal(m.endFocusX,.5);
  assert.deepEqual(cropRect(m,'from'),{x:0,y:0,size:.5});
  assert.deepEqual(cropRect(m,'to'),rect);
});
test('composition fit is validated instead of silently rendering unknown modes',()=>{
  const project={output:{width:1920,height:1080,fps:24,audio:false},assets:{screen:'a.mp4'},scenes:[{id:'crop',preset:'recorded-showcase',durationFrames:144,params:{asset:'screen'},cameraMotion:{preset:'focus-zoom',fit:'stretch'}}]};
  assert.equal(validateProject(project).valid,false);
  project.scenes[0].cameraMotion.fit='cover';assert.equal(validateProject(project).valid,true);
});
