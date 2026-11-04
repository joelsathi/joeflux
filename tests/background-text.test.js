import test from 'node:test';
import assert from 'node:assert/strict';
import {getFrameState} from '../packages/motion/src/index.js';
import {validateProject} from '../packages/core/src/index.js';
const output={width:1920,height:1080,fps:24,audio:false};
const scene={id:'sample',preset:'text-template',durationFrames:96,params:{title:'One clear next step',subtitle:'Keep the detail readable.'}};

test('background styles are deterministic, independently selectable and leave theme tokens untouched',()=>{
 for(const style of ['gradient-drift','soft-light','particles']){
  const s={...scene,background:{style,intensity:.6,speed:1}};
  const a=getFrameState(s,12,output),b=getFrameState(s,70,output),again=getFrameState(s,12,output);
  assert.ok(a.background,'background state must reach the renderer');
  assert.deepEqual(a,again);assert.notDeepEqual(a.background,b.background);
  assert.deepEqual(a.theme,b.theme);assert.equal(a.theme.id,'light-blue');
 }
 assert.equal(getFrameState({...scene,background:{style:'static'}},30,output).particles.length,0);
 assert.equal(getFrameState({...scene,background:{style:'particles',intensity:0}},30,output).particles.length,0);
});

test('all text templates validate and reject settings that erase the reading hold or exceed the scene',()=>{
 const check=s=>validateProject({output,assets:{},scenes:[s]});
 for(const template of ['masked-lines','word-stagger','blur-reveal','keyword-highlight','title-sequence','typing']){
  assert.deepEqual(check({...scene,textAnimation:{template,entryFrames:24,holdFrames:48,exitFrames:16}}).errors,[]);
 }
 for(const invalid of [{entryFrames:0},{exitFrames:-1},{holdFrames:90},{entryFrames:2.5},{template:'unknown'}])assert.equal(check({...scene,textAnimation:invalid}).valid,false);
 for(const background of [{style:'unknown'},{style:'soft-light',speed:0},{style:'particles',intensity:2}])assert.equal(check({...scene,background}).valid,false);
 assert.equal(check({...scene,preset:'recorded-showcase',textAnimation:{template:'typing'}}).valid,false);
});
