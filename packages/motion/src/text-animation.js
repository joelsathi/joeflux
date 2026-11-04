import {ease} from './timing.js';
import {layoutText} from './layout.js';

export const TEXT_TEMPLATES=['masked-lines','word-stagger','blur-reveal','keyword-highlight','title-sequence','typing','line-wipe','scale-pop','character-cascade','number-roll','underline-sweep','caption-over-screen'];
export const TEXT_PLACEMENTS=['center','top-left','lower-third'];
const clamp=n=>Math.max(0,Math.min(1,n));
const smooth=n=>ease(clamp(n),'smootherstep');
const graphemes=text=>Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text),part=>part.segment);
const cleanWord=text=>text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,'').toLocaleLowerCase();

export function textTiming(scene){
 const span=scene.durationFrames-1,a=scene.textAnimation??{};
 const entryFrames=a.entryFrames??Math.max(1,Math.round(span*.25));
 const exitFrames=a.exitFrames??Math.max(1,Math.round(span*.16));
 const holdFrames=a.holdFrames??Math.max(0,span-entryFrames-exitFrames);
 return {entryFrames,holdFrames,exitFrames,exitStart:entryFrames+holdFrames,end:entryFrames+holdFrames+exitFrames};
}
export function minimumReadingHold(scene,fps=24){
 const length=[scene.params?.title,scene.params?.subtitle].filter(Boolean).join(' ').length;
 return Math.ceil((.8+length/70)*fps);
}
export function textAnimationFrame(scene,frame){
 const timing=textTiming(scene),entrance=clamp(frame/timing.entryFrames),exit=clamp((frame-timing.exitStart)/timing.exitFrames);
 return {...timing,entrance,exit,opacity:1-smooth(exit),template:scene.textAnimation?.template??'masked-lines'};
}

// Lay out the COMPLETE text before revealing it, keeping word wrapping and
// centering fixed during typing/stagger. All measurements use the actual font.
function fit(ctx,text,width,height,{font,size,minSize,weight,maxLines}){
 const paragraphs=String(text).trim()?String(text).split(/\r?\n/):[];
 for(let s=size;s>=minSize;s--){
  ctx.font=`${weight} ${s}px ${font}`;
  try{
   const lines=paragraphs.flatMap(paragraph=>paragraph.trim()?layoutText(paragraph,{maxWidth:width,maxHeight:height,maxLines,fontSize:s,minFontSize:s,lineHeight:s*1.2,measure:value=>ctx.measureText(value)}).lines:['']);
   const bounds={width:Math.max(0,...lines.map(line=>ctx.measureText(line).width)),height:lines.length*s*1.2};
   if(lines.length<=maxLines&&bounds.height<=height)return {lines,bounds,fontSize:s,font,weight,lineHeight:s*1.2};
  }catch{/* Try a smaller measured size; never truncate the text. */}
 }
 throw new Error(`Text cannot fit in ${maxLines} lines at the minimum ${minSize}px font size.`);
}
function drawLines(ctx,layout,x,y,alpha=1){
 ctx.save();ctx.globalAlpha*=alpha;ctx.font=`${layout.weight} ${layout.fontSize}px ${layout.font}`;
 layout.lines.forEach((line,i)=>ctx.fillText(line,x+(layout.width-ctx.measureText(line).width)/2,y+i*layout.lineHeight));ctx.restore();
}
export function drawTextTemplate(ctx,scene,frame,output,theme){
 const a=textAnimationFrame(scene,frame),p=scene.params??{},width=Math.min(1280,output.width-320),placement=scene.textAnimation?.placement??'center',x=placement==='top-left'?120:(output.width-width)/2;
 let title,subtitle,eyebrow;
 try{
  title=fit(ctx,p.title??'',width,310,{font:theme.font,size:80,minSize:44,weight:600,maxLines:3});
  subtitle=fit(ctx,p.subtitle??'',width-120,160,{font:theme.font,size:32,minSize:28,weight:400,maxLines:3});
  eyebrow=fit(ctx,(p.eyebrow??'').toUpperCase(),width,60,{font:theme.font,size:22,minSize:18,weight:600,maxLines:2});
 }catch(error){throw new Error(`Scene ${scene.id} text animation: ${error.message}`);}
 title.width=width;subtitle.width=width-120;eyebrow.width=width;
 const pre=eyebrow.lines.length?eyebrow.bounds.height+28:0,post=subtitle.lines.length?subtitle.bounds.height+32:0;
 const height=pre+title.bounds.height+post,y=placement==='top-left'?120:placement==='lower-third'?output.height-height-112:(output.height-height)/2;
 if(y<96||y+height>output.height-96)throw new Error(`Scene ${scene.id}: text animation exceeds the safe area; shorten the copy.`);
 ctx.save();ctx.textBaseline='top';ctx.textAlign='left';ctx.globalAlpha*=a.opacity;
 if(a.template==='caption-over-screen'){
  ctx.save();ctx.globalAlpha*=smooth(a.entrance);ctx.fillStyle='rgba(8, 17, 32, .78)';ctx.beginPath();ctx.roundRect(x-28,y-22,width+56,height+44,24);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.22)';ctx.stroke();ctx.restore();
 }
 ctx.fillStyle=theme.muted;drawLines(ctx,eyebrow,x,y,smooth(a.entrance/.45));
 const titleY=y+pre,e=a.entrance,template=a.template;
 ctx.font=`600 ${title.fontSize}px ${theme.font}`;ctx.fillStyle=template==='caption-over-screen'?'#ffffff':theme.text;
 const words=title.lines.flatMap(line=>line.split(/\s+/)),totalWords=words.length;
 const chars=title.lines.map(graphemes),charCount=chars.reduce((n,line)=>n+line.length,0);
 const visibleChars=Math.floor(e*charCount),highlight=cleanWord(scene.textAnimation?.highlight??words.at(-1)??'');
 let wordIndex=0,charIndex=0;
 title.lines.forEach((line,index)=>{
  const lineY=titleY+index*title.lineHeight,lineWidth=ctx.measureText(line).width,lineX=x+(width-lineWidth)/2;
  ctx.save();
  if(template==='masked-lines'){
   const delay=title.lines.length<=1?0:index/(title.lines.length-1)*.4,progress=smooth((e-delay)/(1-delay));
   ctx.beginPath();ctx.rect(x-8,lineY-4,width+16,title.lineHeight+8);ctx.clip();ctx.globalAlpha*=progress;
   ctx.fillText(line,lineX,lineY+(1-progress)*title.lineHeight);
  }else if(template==='word-stagger'||template==='keyword-highlight'){
   let prefix='';
   for(const word of line.split(/\s+/)){
    const left=lineX+ctx.measureText(prefix).width,wordWidth=ctx.measureText(word).width;
    const delay=totalWords<=1?0:wordIndex/(totalWords-1)*.6,progress=template==='word-stagger'?smooth((e-delay)/(1-delay)):smooth(e/.4);
    ctx.save();ctx.globalAlpha*=progress;
    if(template==='keyword-highlight'&&cleanWord(word)===highlight){
     const amount=smooth((e-.35)/.65);ctx.save();ctx.globalAlpha*=.18;ctx.fillStyle=theme.accent;ctx.fillRect(left-3,lineY-2,(wordWidth+6)*amount,title.lineHeight);ctx.restore();
     ctx.save();ctx.fillStyle=theme.accent;ctx.fillRect(left,lineY+title.fontSize+4,wordWidth*amount,4);ctx.restore();
    }
    ctx.fillText(word,left,lineY+(template==='word-stagger'?(1-progress)*18:0));ctx.restore();prefix+=word+' ';wordIndex++;
   }
  }else if(template==='line-wipe'||template==='caption-over-screen'){
   const progress=smooth(e);ctx.beginPath();ctx.rect(lineX-2,lineY-3,(lineWidth+4)*progress,title.lineHeight+6);ctx.clip();ctx.fillText(line,lineX,lineY);
  }else if(template==='scale-pop'){
   const progress=smooth(e),scale=.82+.18*progress;ctx.globalAlpha*=progress;ctx.translate(lineX+lineWidth/2,lineY+title.lineHeight/2);ctx.scale(scale,scale);ctx.fillText(line,-lineWidth/2,-title.lineHeight/2);
  }else if(template==='character-cascade'){
   let prefix='';for(const character of chars[index]){const delay=charCount<=1?0:charIndex/(charCount-1)*.65,progress=smooth((e-delay)/(1-delay));ctx.save();ctx.globalAlpha*=progress;ctx.fillText(character,lineX+ctx.measureText(prefix).width,lineY+(1-progress)*25);ctx.restore();prefix+=character;charIndex++;}
  }else if(template==='number-roll'){
   let prefix='';for(const character of chars[index]){const left=lineX+ctx.measureText(prefix).width,progress=smooth(e);if(/^[0-9]$/.test(character)){const previous=String((Number(character)+9)%10);ctx.save();ctx.beginPath();ctx.rect(left-2,lineY-2,ctx.measureText(character).width+4,title.lineHeight+4);ctx.clip();ctx.fillText(previous,left,lineY-title.lineHeight*progress);ctx.fillText(character,left,lineY+title.lineHeight*(1-progress));ctx.restore();}else{ctx.save();ctx.globalAlpha*=progress;ctx.fillText(character,left,lineY);ctx.restore();}prefix+=character;}
  }else if(template==='underline-sweep'){
   const progress=smooth(e);ctx.globalAlpha*=progress;ctx.fillText(line,lineX,lineY);ctx.save();ctx.fillStyle=theme.accent;ctx.fillRect(lineX,lineY+title.fontSize+7,lineWidth*smooth((e-.22)/.78),4);ctx.restore();
  }else if(template==='typing'){
   const count=Math.max(0,Math.min(chars[index].length,visibleChars-charIndex)),part=chars[index].slice(0,count).join('');
   ctx.fillText(part,lineX,lineY);
   if(e>0&&e<1&&visibleChars>=charIndex&&visibleChars<charIndex+chars[index].length){ctx.fillStyle=theme.accent;ctx.fillRect(lineX+ctx.measureText(part).width+4,lineY+5,3,title.fontSize);}
   charIndex+=chars[index].length;
  }else{
   const progress=smooth(template==='title-sequence'?e/.6:e);ctx.globalAlpha*=progress;
   if(template==='blur-reveal')ctx.filter=`blur(${(1-progress)*12}px)`;
   ctx.fillText(line,lineX,lineY+(1-progress)*16);
  }
  ctx.restore();
 });
 ctx.fillStyle=theme.muted;
 const subtitleAlpha=smooth((e-(template==='title-sequence'?.6:.65))/(template==='title-sequence'?.4:.35));
 drawLines(ctx,subtitle,x+60,titleY+title.bounds.height+32,subtitleAlpha);
 ctx.restore();
 return {title,subtitle,eyebrow,bounds:{x,y,width,height},animation:a};
}
