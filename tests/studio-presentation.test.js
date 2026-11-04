import test from 'node:test';
import assert from 'node:assert/strict';
import {getFrameState} from '../packages/motion/src/index.js';
import {validateProject} from '../packages/core/src/index.js';

const output={width:1920,height:1080,fps:24,audio:false};
const scene={id:'screen',preset:'recorded-showcase',durationFrames:144,params:{asset:'screen'},cameraMotion:{preset:'detail-pan',scale:1.8,focusX:.4,focusY:.5,endFocusX:.7,endFocusY:.5,presentation:'studio',backdrop:'paper',rotateX:14,rotateY:-9,rotateZ:-3,stageScale:1.2}};

test('studio presentation frames media as a floating screen while keeping source timing independent',()=>{
 const stage=getFrameState(scene,60,output),original=getFrameState({...scene,cameraMotion:{...scene.cameraMotion,presentation:undefined}},60,output);
 assert.ok(stage.recipe.planes[0].rect.width<output.width);
 assert.ok(stage.recipe.planes[0].rect.height<output.height);
 assert.equal(stage.recipe.planes[0].pose.rotateX,14);
 assert.equal(stage.recipe.planes[0].pose.rotateY,-9);
 assert.equal(stage.recipe.planes[0].pose.rotateZ,-3);
 assert.equal(stage.recipe.planes[0].pose.scale,1.2);
 assert.equal(stage.sourceFrame,original.sourceFrame);
 assert.equal(stage.zoom.scale,original.zoom.scale);
 assert.equal(original.recipe.planes[0].rect.width,output.width);
});

test('studio presentation validates backdrop and rotation ranges',()=>{
 const valid=m=>validateProject({output,assets:{screen:'a.mp4'},scenes:[{...scene,cameraMotion:m}]}).valid;
 assert.equal(valid(scene.cameraMotion),true);
 assert.equal(valid({...scene.cameraMotion,backdrop:'unknown'}),false);
 assert.equal(valid({...scene.cameraMotion,rotateY:60}),false);
 assert.equal(valid({...scene.cameraMotion,stageScale:3}),false);
});
