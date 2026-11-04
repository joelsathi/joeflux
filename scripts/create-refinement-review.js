import {mkdir,writeFile,copyFile,access} from 'node:fs/promises';
import path from 'node:path';
import {THEME_OPTIONS} from '../packages/presets/src/themes.js';

// Separate review projects: never overwrite a user's existing scene or source.
const output={width:1920,height:1080,fps:24,codec:'h264',colorSpace:'bt709',audio:false};
async function writeNew(file,data){try{await access(file);return;}catch(error){if(error.code!=='ENOENT')throw error;}await writeFile(file,typeof data==='string'?data:JSON.stringify(data,null,2)+'\n');}
async function project(name,title,scenes){
 const root=path.resolve('projects',name);await mkdir(path.join(root,'scenes'),{recursive:true});await mkdir(path.join(root,'assets'),{recursive:true});
 for(const asset of ['overview','activity']){
  const destination=path.join(root,'assets',`${asset}.mp4`);
  try{await access(destination);}catch(error){if(error.code!=='ENOENT')throw error;await copyFile(path.resolve('projects/motion-showcase/assets',`${asset}.mp4`),destination);}
 }
 for(const scene of scenes)await writeNew(path.join(root,'scenes',`${scene.id}.json`),scene);
 await writeNew(path.join(root,'project.json'),{version:1,name:title,theme:'light-blue',output,assets:{overview:'assets/overview.mp4',activity:'assets/activity.mp4'},scenes:scenes.map(({id})=>({id,file:`scenes/${id}.json`}))});
 await writeNew(path.join(root,'WORKING_STATE.md'),`# ${title}\n\nSide-by-side review project. Existing projects are unchanged. Samples and clips are written to exports/.\n\n## Current objective\n\nCompare the review samples side by side.\n\n## Last change\n\nProject generated.\n\n## Checks run\n\nNone recorded.\n\n## Open decisions\n\nNone.\n\n## Next action\n\nRender the samples and inspect them at normal speed.\n`);
 console.log(root);
}
const connections=[];
for(const [preset,label,durationFrames] of [['screen-handoff','Context to action',144],['product-reveal','Make room for detail',144],['side-slide','A connected next step',48]])for(const connectionStyle of ['classic','continuous']){
 connections.push({id:`${preset}-${connectionStyle}`,preset,connectionStyle,durationFrames,params:{asset:'overview',outgoingAsset:'overview',incomingAsset:'activity',outgoingSeconds:2,incomingSeconds:1,eyebrow:'Screen choreography',title:label,subtitle:'One clear movement. Time to read.',items:['Context','Policy','Action']},playback:{startSeconds:0}});
}
await project('connection-review','Step 1 · Connection comparisons',connections);
const themes=THEME_OPTIONS.map(({id,label})=>({id,preset:'recorded-showcase',theme:id,durationFrames:72,params:{asset:'overview',eyebrow:id.startsWith('oxygen-')?'Oxygen UI · '+(id.endsWith('-dark')?'Dark':'Light'):'Existing theme · Preserved',title:label.replace(/^Oxygen · /,'').replace(/ · (light|dark)$/,'').replace(' (original)',''),subtitle:'Space for your product.\nClarity for your story.'},camera:{start:{rotateY:-7},end:{rotateY:-7}},playback:{startSeconds:1}}));
await project('oxygen-review','Step 2 · Oxygen theme gallery',themes);
