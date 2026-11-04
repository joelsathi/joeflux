// Generates original sample UI footage; never modifies existing demo assets.
import {mkdir,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from '@playwright/test';
import {browserLaunchOptions} from '../packages/renderer/src/index.js';
const root=path.resolve('projects/motion-showcase');
await mkdir(path.join(root,'assets'),{recursive:true});await mkdir(path.join(root,'scenes'),{recursive:true});
const browser=await chromium.launch(browserLaunchOptions());
try {
 const page=await browser.newPage();await page.setContent('<canvas width="1280" height="720"></canvas>');
 for(const kind of ['overview','activity']) {
  const target=path.join(root,'assets',`${kind}.mp4`);
  if(await stat(target).then(()=>true,()=>false))continue;
  const encoder=spawn('ffmpeg',['-v','error','-y','-f','image2pipe','-framerate','30','-i','pipe:0','-an','-c:v','libx264','-crf','16','-pix_fmt','yuv420p',target],{stdio:['pipe','inherit','inherit']});
  const done=once(encoder,'close');
  for(let frame=0;frame<180;frame++) {
   const png=await page.evaluate(({kind,frame})=>{
    const canvas=document.querySelector('canvas'),c=canvas.getContext('2d');
    const box=(x,y,w,h,color,r=10)=>{c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();};
    const text=(value,x,y,size=20,color='#173249',weight=500)=>{c.font=`${weight} ${size}px system-ui`;c.fillStyle=color;c.fillText(value,x,y);};
    c.fillStyle='#f5f7fa';c.fillRect(0,0,1280,720);box(0,0,230,720,'#18263d',0);box(230,0,1050,78,'white',0);
    text('SAMPLE WORKSPACE',28,46,17,'white',700);text('Developer console',270,48,22);
    text(kind==='overview'?'Overview':'Activity',30,125,19,'#bce7f2');text('Applications',30,180,18,'#bcc8d8');text('Integrations',30,235,18,'#bcc8d8');text('Observability',30,290,18,'#bcc8d8');
    text('Production',1070,47,16,'#597285');
    text(kind==='overview'?'One view. Every service.':'From signal to action.',278,140,32,'#173249',650);
    text('Original demonstration UI · no customer data',278,179,16,'#597285');
    for(let i=0;i<3;i++){box(278+i*314,213,292,125,'white');text(['Healthy services','Requests / minute','Success rate'][i],300+i*314,248,16,'#597285');text([String(24+Math.floor(frame/60)),String(12400+frame*3),'99.98%'][i],300+i*314,302,34,'#173249',650);}
    box(278,365,605,296,'white');text(kind==='overview'?'Service traffic':'Deployment activity',304,406,20);
    for(let i=0;i<5;i++){c.strokeStyle='#edf0f4';c.beginPath();c.moveTo(306,443+i*43);c.lineTo(850,443+i*43);c.stroke();}
    c.strokeStyle='#2f93ae';c.lineWidth=4;c.beginPath();for(let i=0;i<60;i++){const x=306+i*9,y=570-Math.sin(i*.12+frame*.012)*40-i*.9; i?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();
    box(908,365,290,296,'white');text('Latest events',930,406,20);
    for(let i=0;i<3;i++){box(929,436+i*61,9,9,['#2f93ae','#f14e23','#2f93ae'][i],5);text(['Service connected','Policy verified','Ready to publish'][i],950,445+i*61,15);text(['All checks passed','Secure by default','Workspace ready'][i],950,468+i*61,12,'#597285');}
    box(1010,604,164,36,kind==='overview'?'#2f93ae':'#f14e23',7);text('View details',1032,628,16,'white');
    const cx=1045+Math.sin(frame/40)*50,cy=620;c.fillStyle='#173249';c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+5,cy+19);c.lineTo(cx+10,cy+12);c.lineTo(cx+20,cy+10);c.closePath();c.fill();
    text(`FRAME ${String(frame).padStart(3,'0')} · 30 FPS`,1025,700,12,'#597285');
    return canvas.toDataURL('image/png').split(',')[1];
   },{kind,frame});
   if(!encoder.stdin.write(Buffer.from(png,'base64')))await once(encoder.stdin,'drain');
  }
  encoder.stdin.end();const [code]=await done;if(code!==0)throw new Error('Fixture encoding failed.');console.log(`Created ${target}`);
 }
}finally{await browser.close();}
const scenes=[
 {id:'chapter',preset:'chapter-opener',durationFrames:96,params:{eyebrow:'A clearer product story',title:'Make the next step obvious.',subtitle:'Quiet motion. Space to understand.'}},
 {id:'reveal',preset:'product-reveal',durationFrames:144,params:{asset:'overview',eyebrow:'Start with clarity',title:'One view. Every service.',subtitle:'Introduce the product, then let it speak.'}},
 {id:'handoff',preset:'screen-handoff',durationFrames:144,theme:'navy-dark',params:{outgoingAsset:'overview',incomingAsset:'activity',outgoingSeconds:143/24,incomingSeconds:0,eyebrow:'From context to action',title:'Move into the decision.',subtitle:'The next screen arrives with purpose.',items:['Context','Policy','Action']}},
 {id:'focus',preset:'recorded-showcase',durationFrames:144,theme:'navy-dark',composition:'full',params:{asset:'activity'},playback:{sourceFps:30,startSeconds:0,endSeconds:179/30,segments:[{outputStart:0,outputEnd:48,rate:1,endRate:2}],holds:[{outputStart:48,outputEnd:95}]},zoom:{startFrame:0,endFrame:143,entryFrames:32,exitFrames:32,scale:1.8,focusX:.82,focusY:.75}},
 {id:'problem',preset:'problem-to-product',durationFrames:192,theme:'navy-dark',params:{asset:'overview',eyebrow:'Designed for a clear next step',title:'Too many signals. One decision.',benefit:'Bring the picture together.',subtitle:'Understand the context before you act.',items:['Connect the context','See what matters','Choose the next step']}},
];
for(const scene of scenes)await writeFile(path.join(root,'scenes',`${scene.id}.json`),JSON.stringify(scene,null,2)+'\n');
await writeFile(path.join(root,'project.json'),JSON.stringify({version:1,name:'Motion showcase — silent',theme:'light-blue',output:{width:1920,height:1080,fps:24,codec:'h264',colorSpace:'bt709',audio:false},assets:{overview:'assets/overview.mp4',activity:'assets/activity.mp4'},scenes:scenes.map(s=>({id:s.id,file:`scenes/${s.id}.json`}))},null,2)+'\n');
// Keep recorded working state when regenerating.
await stat(path.join(root,'WORKING_STATE.md')).catch(()=>writeFile(path.join(root,'WORKING_STATE.md'),"# Motion showcase\n\nA 30-second product story at 1920×1080 and 24 fps, built from original sample dashboard recordings (30 fps sources). It uses the default light-blue theme, with navy/orange styling in the later scenes. The dashboard numbers are example data. Camera and focus keyframes stay editable in the scene JSON.\n\n## Current objective\n\nReference sample. No production work is in progress.\n\n## Last change\n\nNone recorded since the project was generated.\n\n## Checks run\n\nNone recorded. List each command or review with its result and date, for example: `pnpm run validate -- <project>` passed; scene `opening` played at 1920×1080, 24 fps, at normal speed.\n\n## Open decisions\n\nNone.\n\n## Next action\n\nTune a scene in the Studio, render that clip, and inspect it before assembling. Regenerate the project with `node scripts/create-motion-showcase.js`.\n"));
