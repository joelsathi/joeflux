import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectManifest,validateProject} from '../packages/core/src/index.js';
const check=scene=>validateProject({...createProjectManifest(),assets:{screen:'screen.mp4'},scenes:[{id:'shot',preset:'recorded-showcase',durationFrames:144,...scene}]});
for(const [name,scene] of Object.entries({
  'overlapping segments':{playback:{segments:[{outputStart:0,outputEnd:48,rate:1},{outputStart:24,outputEnd:60,rate:2}]}},
  'reversed trim':{playback:{startSeconds:3,endSeconds:1}},
  'nonfinite pose':{camera:{end:{z:NaN}}},
  'invalid zoom focus':{zoom:{startFrame:0,endFrame:144,scale:2,focusX:2}},
  'zoom shorter than entry plus exit':{zoom:{startFrame:0,endFrame:12,entryFrames:12,exitFrames:12,scale:2}},
  'extra cards':{preset:'floating-cards',params:{items:['1','2','3','4','5']}},
  'missing named asset':{params:{asset:'missing'}},
  'unknown transition':{transition:{type:'glitch',frames:12}},
  'unordered keyframes':{camera:{keyframes:[{frame:48,x:0},{frame:0,x:0}]}},
})) test(`rejects ${name}`,()=>assert.equal(check(scene).valid,false));
test('validates a multi-pose silent scene',()=>assert.equal(check({params:{asset:'screen'},camera:{keyframes:[{frame:0,x:0},{frame:143,z:-1000}]}}).valid,true));
