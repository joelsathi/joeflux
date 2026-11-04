import {mkdir,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('projects/background-text-review');
await mkdir(path.join(root,'scenes'),{recursive:true});
async function writeNew(file,value){try{await access(file);return;}catch(e){if(e.code!=='ENOENT')throw e;}await writeFile(file,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');}
const entries=[
 ['masked-lines','One idea.\nClearly revealed.','gradient-drift','oxygen-acrylic-purple-dark','01 · Masked line reveal'],
 ['word-stagger','Every word has its moment.','soft-light','light-blue','02 · Word stagger'],
 ['blur-reveal','Bring the detail into focus.','particles','oxygen-acrylic-orange-dark','03 · Blur to sharp'],
 ['keyword-highlight','Make the important thing clear.','gradient-drift','oxygen-acrylic-orange-light','04 · Keyword highlight'],
 ['title-sequence','A title with room to breathe.','soft-light','oxygen-wso2-dark','05 · Title then subtitle'],
 ['typing','How can we help you today?','particles','oxygen-pale-indigo-light','06 · Typing opener'],
];
const scenes=entries.map(([template,title,style,theme,eyebrow])=>({id:template,preset:'text-template',durationFrames:120,theme,
 background:{style,intensity:.65,speed:1},textAnimation:{template,entryFrames:30,holdFrames:65,exitFrames:24,...(template==='keyword-highlight'?{highlight:'important'}:{})},
 params:{title,eyebrow,subtitle:'A quiet background. A readable hold. A clean exit.'}}));
for(const scene of scenes)await writeNew(path.join(root,'scenes',`${scene.id}.json`),scene);
await writeNew(path.join(root,'project.json'),{version:1,name:'Steps 3–4 · Background and text motion',theme:'light-blue',output:{width:1920,height:1080,fps:24,codec:'h264',colorSpace:'bt709',audio:false},assets:{},scenes:scenes.map(({id})=>({id,file:`scenes/${id}.json`}))});
await writeNew(path.join(root,'WORKING_STATE.md'),"# Background and text review\n\nSix text templates shown across three background styles. Each scene is five seconds: 30 entrance frames, 65 hold frames and 24 exit frames.\n\n## Current objective\n\nReference sample. No production work is in progress.\n\n## Last change\n\nNone recorded since the project was generated.\n\n## Checks run\n\nNone recorded. List each command or review with its result and date, for example: `pnpm run validate -- <project>` passed; scene `opening` played at 1920×1080, 24 fps, at normal speed.\n\n## Open decisions\n\nNone.\n\n## Next action\n\nRegenerate the project with `node scripts/create-background-text-review.js`, then render and inspect the scene under review.\n");
console.log(root);
