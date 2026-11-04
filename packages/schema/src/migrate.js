import {cameraShots} from '../../motion/src/camera-motion.js';

// v1 camera-motion scenes render through the v2 screen model; other scenes pass through.
export function toV2(scene){
 if(scene.kind||!scene.cameraMotion||!['recorded-showcase','focus-transition'].includes(scene.preset))return scene;
 const {preset,params,cameraMotion:m,...rest}=scene,studio=m.presentation==='studio';
 return {...rest,params,kind:'screen',
  screen:{asset:params?.asset,presentation:studio?'studio':'fullscreen',backdrop:studio?m.backdrop??'paper':'theme',fit:m.fit??'contain',size:studio?m.stageScale??1:1,tilt:studio?[m.rotateX??14,m.rotateY??-9,m.rotateZ??-3]:[0,0,0]},
  camera:{shots:cameraShots(m,scene.durationFrames),move:{preset:m.preset,...(m.strength===undefined?{}:{strength:m.strength})}}};
}

// Refuse to discard behavior that the shot model cannot represent. Ordinary
// caption-free recordings can adopt it; authored legacy scenes stay editable in Classic.
export function screenConversionIssue(scene) {
 if(scene.module)return 'custom scene module';
 if(scene.kind==='screen')return null;
 if(!['recorded-showcase','focus-transition'].includes(scene.preset)||!scene.params?.asset)return 'not a screen shot';
 if(scene.cameraMotion)return null;
 const issues=[];
 if(['title','subtitle','eyebrow'].some(k=>scene.params?.[k]))issues.push('captions');
 if(scene.camera&&Object.keys(scene.camera).length)issues.push('manual camera track');
 if(scene.zoom)issues.push('manual zoom track');
 if(scene.composition&&scene.composition!=='full')issues.push('custom composition');
 return issues.length?`conversion would replace ${issues.join(', ')}; keep editing this scene in Classic`:null;
}
export function toScreenScene(scene) {
 const issue=screenConversionIssue(scene);
 if(issue)throw new Error(`Scene "${scene.id}": ${issue}.`);
 if(scene.kind==='screen')return scene;
 if(scene.cameraMotion)return toV2(scene);
 const {preset,camera,zoom,composition,...rest}=scene;
 return {...rest,kind:'screen',screen:{asset:scene.params.asset},camera:{shots:[{at:0}]}};
}
