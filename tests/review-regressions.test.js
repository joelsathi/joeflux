import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutText } from '../packages/motion/src/layout.js';
import { evaluateSourceTime, mapSourceFrame, evaluateCamera } from '../packages/motion/src/timing.js';
import { sourceSecondsForFrame } from '../packages/renderer/src/source-frames.js';
import { evaluateZoom } from '../packages/motion/src/zoom.js';

test('rejects unbreakable text outside its width', () => {
  assert.throws(() => layoutText('X'.repeat(50), {maxWidth:100,maxLines:2,fontSize:40,minFontSize:20,lineHeight:46,measure:t=>({width:t.length*20})}), /fit/);
});
test('1x uses seconds across different source and output frame rates', () => {
  const scene={playback:{startFrame:30,endFrame:300,sourceFps:30}};
  assert.equal(sourceSecondsForFrame(scene,24,24),2);
  assert.equal(mapSourceFrame(scene.playback,24,24),60);
  assert.equal(evaluateSourceTime({},24,24),1);
});
test('fixed-frame hold resumes from its held source position', () => {
  const p={sourceFps:30,startFrame:0,endFrame:300,holds:[{outputStart:24,outputEnd:47,sourceFrame:60}]};
  assert.equal(sourceSecondsForFrame({playback:p},24,24),2);
  assert.equal(sourceSecondsForFrame({playback:p},47,24),2);
  assert.equal(sourceSecondsForFrame({playback:p},48,24),2);
  assert.equal(sourceSecondsForFrame({playback:p},72,24),3);
});
test('source-time integration preserves fractional seconds and ramp area', () => {
  assert.equal(sourceSecondsForFrame({playback:{sourceFps:30,endFrame:300,segments:[{outputStart:0,outputEnd:48,rate:.5}]}},1,24),1/48);
  assert.equal(evaluateSourceTime({segments:[{outputStart:0,outputEnd:24,rate:1,endRate:3}]},24,24),2);
});
test('focus reaches selected point at 2x with covered edges', () => {
  for (const [focusX,focusY] of [[0,0],[1,0],[0,1],[1,1]]) {
    const z=evaluateZoom({startFrame:0,endFrame:100,scale:2,focusX,focusY},50);
    assert.equal(z.x, focusX===0 ? .5 : -.5);
    assert.equal(z.y, focusY===0 ? .5 : -.5);
  }
});
test('camera supports a held intermediate pose with random-access evaluation', () => {
  const camera={keyframes:[{frame:0,x:0},{frame:24,x:100},{frame:48,x:100},{frame:72,x:0}]};
  assert.equal(evaluateCamera(camera,36,73).x,100);
  assert.equal(evaluateCamera(camera,72,73).x,0);
  assert.equal(evaluateCamera(camera,0,73).x,0);
});
test('pans between source details without pumping the zoom scale',()=>{
  const z=evaluateZoom({startFrame:0,endFrame:100,scale:2,focusKeyframes:[{frame:20,focusX:.25,focusY:.5},{frame:80,focusX:.75,focusY:.5}]},20);
  assert.equal(z.scale,2);assert.equal(z.x,.5);
  assert.equal(evaluateZoom({startFrame:0,endFrame:100,scale:2,focusKeyframes:[{frame:20,focusX:.25,focusY:.5},{frame:80,focusX:.75,focusY:.5}]},80).x,-.5);
});
