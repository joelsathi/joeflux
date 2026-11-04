import test from 'node:test';
import assert from 'node:assert/strict';
import {getFrameState} from '../packages/motion/src/index.js';
import {validateProject} from '../packages/core/src/index.js';
import {CAMERA_MOTIONS} from '../packages/motion/src/camera-motion.js';
import {toV2} from '../packages/schema/src/migrate.js';
import {screenSceneErrors,sceneJsonSchema} from '../packages/schema/src/scene.js';

const output={width:1920,height:1080,fps:24,audio:false};
const shots=[{at:0},{at:.2,focus:[.25,.3],zoom:2},{at:.4,focus:[.75,.3],zoom:2},{at:.6,focus:[.5,.75],zoom:2.5},{at:1}];
const scene={id:'tour',kind:'screen',durationFrames:101,screen:{asset:'screen'},camera:{shots}};
const check=s=>validateProject({output,assets:{screen:'a.mp4'},scenes:[s]});

test('a screen scene visits any number of focus shots and returns to the full view',()=>{
 const at=f=>getFrameState(scene,f,output).zoom;
 assert.deepEqual(at(20),{scale:2,x:.5,y:.4,strength:1});
 assert.deepEqual(at(40),{scale:2,x:-.5,y:.4,strength:1});
 assert.equal(at(60).scale,2.5);
 assert.deepEqual(at(100),{scale:1,x:0,y:0,strength:0});
 assert.equal(getFrameState(scene,50,output).recipe.planes[0].assetId,'screen');
});

test('screen scenes validate against the schema with readable errors',()=>{
 assert.equal(check(scene).valid,true);
 const errors=s=>check(s).errors.join('\n');
 assert.match(errors({...scene,camera:{shots:[{at:.5},{at:.2}]}}),/time order/);
 assert.match(errors({...scene,camera:{shots:[{at:0,zoom:6}]}}),/camera\.shots\.0\.zoom/);
 assert.match(errors({...scene,screen:{asset:'missing'}}),/missing declared asset/);
 assert.match(errors({...scene,kind:'other'}),/unknown scene kind/);
});

test('every legacy camera preset converts to a schema-valid shot list',()=>{
 for(const preset of CAMERA_MOTIONS)for(const presentation of ['fullscreen','studio']){
  const v2=toV2({id:'legacy',preset:'recorded-showcase',durationFrames:144,params:{asset:'screen'},cameraMotion:{preset,presentation}});
  assert.deepEqual(screenSceneErrors(v2),[],`${preset}/${presentation}`);
 }
 assert.equal(sceneJsonSchema().properties.camera.properties.shots.type,'array');
});

test('focus areas round-trip through paced shot lists and reframe without retiming', async () => {
 const { cameraStops, shotsFromStops, reframeStop } = await import('../packages/motion/src/camera-motion.js');
 const stops = [{ focus: [.2, .3], zoom: 2 }, { focus: [.7, .6], zoom: 2.5 }, { focus: [.5, .5], zoom: 1.5 }];
 for (const options of [{}, { startFull: false }, { returnToFull: false }, { startFull: false, returnToFull: false }]) {
  const shots = shotsFromStops(stops, options);
  assert.deepEqual(cameraStops(shots), stops);
  assert.equal(shots[0].at, 0); assert.equal(shots.at(-1).at, 1);
  assert.equal(Boolean(shots[0].focus), options.startFull === false); assert.equal(Boolean(shots.at(-1).focus), options.returnToFull === false);
  assert.deepEqual(screenSceneErrors({ ...scene, camera: { shots } }), []);
 }
 const shots = shotsFromStops(stops), moved = reframeStop(shots, 1, { focus: [.6, .4], zoom: 3 });
 assert.deepEqual(moved.map((shot) => shot.at), shots.map((shot) => shot.at));
 assert.deepEqual(cameraStops(moved)[1], { focus: [.6, .4], zoom: 3 });
 assert.deepEqual(shotsFromStops([]), [{ at: 0 }]);
 assert.deepEqual(toV2({ id: 'x', preset: 'recorded-showcase', durationFrames: 48, params: { asset: 'screen' }, cameraMotion: { preset: 'orbit', strength: .5 } }).camera.move, { preset: 'orbit', strength: .5 });
});
