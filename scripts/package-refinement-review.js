import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

// Compose only the disposable review projects. FFmpeg always drops audio.
const root=path.resolve('projects/connection-review/exports');
const font=path.resolve('packages/presets/assets/InterVariable.woff2');
const ffmpeg=args=>execFileSync('ffmpeg',['-v','error','-y',...args],{stdio:'inherit'});
const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
async function concat(files,target){
 const list=target+'.txt';await writeFile(list,files.map(file=>`file ${quote(file)}`).join('\n')+'\n');
 ffmpeg(['-f','concat','-safe','0','-i',list,'-map','0:v:0','-an','-c:v','copy','-movflags','+faststart',target]);
}
await mkdir(path.join(root,'comparisons'),{recursive:true});
const pairs=[];
for(const [preset,title] of [['screen-handoff','01  SCREEN HANDOFF'],['product-reveal','02  FULLSCREEN REFRAME'],['side-slide','03  SIDE SLIDE']]){
 const target=path.join(root,'comparisons',`${preset}.mp4`);pairs.push(target);
 const label=(text,x,y)=>`drawtext=fontfile='${font}':text='${text}':fontcolor=white:fontsize=22:x=${x}:y=${y}`;
 ffmpeg(['-i',path.join(root,'clips',`${preset}-classic.mp4`),'-i',path.join(root,'clips',`${preset}-continuous.mp4`),'-filter_complex',
  `[0:v]scale=960:540,setsar=1[a];[1:v]scale=960:540,setsar=1[b];[a][b]hstack=inputs=2,pad=1920:640:0:64:color=0x111827[out]`,
  '-map','[out]','-an','-c:v','libx264','-crf','16','-pix_fmt','yuv420p','-r','24','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-movflags','+faststart',target]);
}
await concat(pairs,path.join(root,'comparison.mp4'));
await concat(['screen-handoff','product-reveal','side-slide'].map(p=>path.join(root,'clips',`${p}-continuous.mp4`)),path.join(root,'refined.mp4'));
const gallery=path.resolve('projects/oxygen-review'),manifest=JSON.parse(await readFile(path.join(gallery,'project.json'),'utf8'));
await concat(manifest.scenes.map(({id})=>path.join(gallery,'exports/clips',`${id}.mp4`)),path.join(gallery,'exports/themes.mp4'));
const stills=path.join(gallery,'exports/review/theme-stills.txt');
await writeFile(stills,manifest.scenes.map(({id})=>`file ${quote(path.join(gallery,'exports/review',`${id}-039.png`))}`).join('\n')+'\n');
ffmpeg(['-f','concat','-safe','0','-i',stills,'-vf','scale=640:360,tile=3x4','-frames:v','1','-update','1',path.join(gallery,'exports/review/themes.jpg')]);
const files=[path.join(root,'comparison.mp4'),path.join(root,'refined.mp4'),path.join(gallery,'exports/themes.mp4')];
const evidence=files.map(file=>{
 const data=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8'}));
 if(data.streams.some(s=>s.codec_type==='audio'))throw new Error(`Audio found: ${file}`);
 const video=data.streams.find(s=>s.codec_type==='video');return {file,frames:Number(video.nb_frames),duration:Number(data.format.duration),width:video.width,height:video.height,fps:video.r_frame_rate,audioStreams:0};
});
await writeFile(path.join(root,'review-evidence.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
