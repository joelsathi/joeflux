#!/usr/bin/env node
// Regenerate the compact review project without changing any source media.
import {copyFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'projects/studio-foundation-review');
const source=path.join(root,'projects/template-gallery/assets');
await mkdir(path.join(target,'assets'),{recursive:true});
await mkdir(path.join(target,'scenes'),{recursive:true});
for(const name of ['overview.mp4','activity.mp4'])await copyFile(path.join(source,name),path.join(target,'assets',name));
const output={width:960,height:540,fps:24,codec:'h264',colorSpace:'bt709',audio:false};
const project={version:1,name:'Studio foundation review',theme:'oxygen-wso2-dark',style:{themes:['oxygen-wso2-dark','oxygen-acrylic-purple-light'],pacing:'balanced',look:'cinematic'},output,assets:{overview:'assets/overview.mp4',activity:'assets/activity.mp4',spark:'assets/spark.svg',orbit:'assets/orbit.json'},scenes:[{id:'glass-title',file:'scenes/glass-title.json'},{id:'focus-tour',file:'scenes/focus-tour.json'},{id:'screen-handoff',file:'scenes/screen-handoff.json'}]};
const scenes=[
  {id:'glass-title',preset:'text-template',durationFrames:72,theme:'oxygen-wso2-dark',background:{style:'static'},params:{eyebrow:'A NEW STUDIO',title:'Ideas in motion',subtitle:'Create with clarity. Finish with confidence.'},textAnimation:{template:'word-stagger',placement:'center'},compositor:{look:'neutral',light:.15},layers:[{type:'svg',asset:'spark',x:.08,y:.1,width:.11,height:.2,opacity:.9},{type:'lottie',asset:'orbit',x:.78,y:.68,width:.14,height:.24,opacity:.85}],transition:{type:'circle-reveal',frames:10}},
  {id:'focus-tour',kind:'screen',durationFrames:96,theme:'oxygen-wso2-dark',background:{style:'static'},screen:{asset:'overview',presentation:'studio',backdrop:'slate',fit:'contain',padding:.12,radius:22,shadow:'floating',frame:'browser-dark',frameTitle:'console.example.com',lighting:{style:'glow',intensity:.65}},camera:{ease:'gentle',shots:[{at:0},{at:.24,focus:[.57,.5],zoom:1.65},{at:.68,focus:[.57,.5],zoom:1.65},{at:1}]},caption:{text:'Focus on what matters.',placement:'bottom',animation:'line-wipe'},compositor:{look:'cinematic',depthOfField:.18,light:.4},motionBlur:{enabled:true,samples:4,shutter:.65,accumulator:'webgl'},transition:{type:'dip-black',frames:8}},
  {id:'screen-handoff',preset:'screen-handoff',connectionStyle:'continuous',durationFrames:96,theme:'oxygen-wso2-dark',background:{style:'static'},params:{title:'From insight to action',subtitle:'A smoother way to tell the story.',outgoingAsset:'overview',incomingAsset:'activity'},compositor:{look:'cinematic',depthOfField:.12,light:.3}},
];
await writeFile(path.join(target,'project.json'),JSON.stringify(project,null,2)+'\n');
for(const scene of scenes)await writeFile(path.join(target,'scenes',`${scene.id}.json`),JSON.stringify(scene,null,2)+'\n');
await writeFile(path.join(target,'assets/spark.svg'),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><path d="M80 8 96 64 152 80 96 96 80 152 64 96 8 80 64 64Z" fill="#fff" opacity=".92"/><circle cx="80" cy="80" r="18" fill="#ff7043"/></svg>\n`);
const orbit={v:'5.13.0',fr:24,ip:0,op:72,w:192,h:192,nm:'Orbit accent',ddd:0,assets:[],layers:[{ddd:0,ind:1,ty:4,nm:'Orb',sr:1,ks:{o:{a:0,k:100},r:{a:0,k:0},p:{a:0,k:[0,0,0]},a:{a:0,k:[0,0,0]},s:{a:0,k:[100,100,100]}},ao:0,shapes:[{ty:'el',p:{a:1,k:[{t:0,s:[28,96],e:[164,96],i:{x:1,y:1},o:{x:0,y:0}},{t:71,s:[164,96]}]},s:{a:0,k:[46,46]},nm:'Orb'},{ty:'fl',c:{a:0,k:[.09,.17,.31,1]},o:{a:0,k:100},r:1,nm:'Navy'},{ty:'tr',p:{a:0,k:[0,0]},a:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:{a:0,k:100}}],ip:0,op:72,st:0,bm:0}]};
await writeFile(path.join(target,'assets/orbit.json'),JSON.stringify(orbit,null,2)+'\n');
console.log(target);
