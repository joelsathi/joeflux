import {mkdir,writeFile,copyFile,access} from 'node:fs/promises';
import path from 'node:path';
import {CAMERA_MOTIONS} from '../packages/motion/src/camera-motion.js';
const root=path.resolve('projects/camera-review');
await mkdir(path.join(root,'scenes'),{recursive:true});await mkdir(path.join(root,'assets'),{recursive:true});
async function fresh(file,content){try{await access(file);}catch(e){if(e.code!=='ENOENT')throw e;await writeFile(file,typeof content==='string'?content:JSON.stringify(content,null,2)+'\n');}}
const asset=path.join(root,'assets/overview.mp4');try{await access(asset);}catch(e){if(e.code!=='ENOENT')throw e;await copyFile('projects/motion-showcase/assets/overview.mp4',asset);}
for(const preset of CAMERA_MOTIONS)await fresh(path.join(root,`scenes/${preset}.json`),{id:preset,preset:'recorded-showcase',durationFrames:144,theme:'oxygen-acrylic-purple-dark',background:{style:'static'},params:{asset:'screen'},cameraMotion:{preset,scale:1.8,focusX:.45,focusY:.58,endFocusX:.82,endFocusY:.58},playback:{startSeconds:0}});
await fresh(path.join(root,'project.json'),{version:1,name:'Step 5 · Camera motion review',output:{width:1920,height:1080,fps:24,codec:'h264',colorSpace:'bt709',audio:false},assets:{screen:'assets/overview.mp4'},scenes:CAMERA_MOTIONS.map(id=>({id,file:`scenes/${id}.json`}))});
await fresh(path.join(root,'WORKING_STATE.md'),"# Camera review\n\nFive six-second camera presets, in order: focus zoom, detail pan, orbit, tilt and settle, and return to full screen. Source recordings are copied into the project and never modified.\n\n## Current objective\n\nReference sample. No production work is in progress.\n\n## Last change\n\nNone recorded since the project was generated.\n\n## Checks run\n\nNone recorded. List each command or review with its result and date, for example: `pnpm run validate -- <project>` passed; scene `opening` played at 1920×1080, 24 fps, at normal speed.\n\n## Open decisions\n\nNone.\n\n## Next action\n\nRegenerate the project with `node scripts/create-camera-review.js`, then render and inspect the preset under review.\n");
console.log(root);
