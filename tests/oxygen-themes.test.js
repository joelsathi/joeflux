import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveTheme} from '../packages/presets/src/themes.js';
import {getFrameState} from '../packages/motion/src/index.js';
import {validateProject} from '../packages/core/src/index.js';

test('Oxygen light and dark themes flow through project validation and scene overrides',()=>{
 const scene={id:'theme',preset:'text-settle',durationFrames:72,params:{title:'Readable detail'}};
 for(const family of ['acrylic-orange','acrylic-purple','wso2','pale-indigo','pale-gray'])for(const mode of ['light','dark']){
  const theme=`oxygen-${family}-${mode}`,project={theme,assets:{},scenes:[scene],output:{width:1920,height:1080,fps:24,audio:false}};
  assert.deepEqual(validateProject(project).errors,[],theme);
  assert.equal(getFrameState(scene,40,project.output,project).theme.mode,mode);
  assert.equal(getFrameState({...scene,theme:'light-blue'},40,project.output,project).theme.id,'light-blue');
 }
});
test('imported radial themes retain layered backgrounds and flat themes remain quiet',()=>{
 const purple=resolveTheme('oxygen-acrylic-purple-dark'),orange=resolveTheme('oxygen-acrylic-orange-light');
 assert.ok(purple.backgroundLayers.length>=3);assert.ok(orange.backgroundLayers.length>=3);
 assert.notDeepEqual(purple.backgroundLayers,orange.backgroundLayers);
 assert.equal(resolveTheme('oxygen-pale-gray-light').backgroundLayers.length,0);
 assert.throws(()=>resolveTheme('oxygen-nonexistent'),/Unknown theme/);
});
