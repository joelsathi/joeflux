const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=value=>{const x=clamp(value);return x*x*(3-2*x);};
const segments=(text,granularity)=>Array.from(new Intl.Segmenter(undefined,{granularity}).segment(text));

// The complete caption settles at entryFrames and stays still until exitStart.
// Fractional render frames are supported for export's temporal sampling.
export function screenCaptionTiming(scene){
 const last=scene.durationFrames-1,entryFrames=Math.max(1,Math.round(last*.18)),exitFrames=Math.max(1,Math.round(last*.18));
 return {entryFrames,exitFrames,exitStart:last-exitFrames,holdFrames:Math.max(0,last-entryFrames-exitFrames)};
}
// Frames the whole caption is settled and no transition blends the shot with a neighbour.
export function captionReadingFrames(scene,scenes=[]){
 const {entryFrames,exitStart}=screenCaptionTiming(scene),index=scenes.findIndex(item=>item.id===scene.id);
 const overlap=item=>item?.transition?.type&&item.transition.type!=='cut'?item.transition.frames??0:0;
 const incoming=index>0?overlap(scenes[index-1]):0,outgoing=index>=0&&index<scenes.length-1?overlap(scene):0;
 return Math.max(0,Math.min(exitStart,scene.durationFrames-outgoing)-Math.max(entryFrames,incoming));
}
// Stagger units: words keep adjacent punctuation, so "faster!" never leaves "!" alone on a line.
function captionWords(text){
 const units=[];let opening='';
 for(const part of segments(text,'word')){
  const value=part.segment,last=units.at(-1);
  if(!value.trim()){if(opening){units.push({word:opening});opening='';}units.push({space:value});}
  else if(part.isWordLike){units.push({word:opening+value});opening='';}
  else if(/^[\p{Ps}\p{Pi}]+$/u.test(value))opening+=value;
  else if(last?.word!==undefined&&!opening)last.word+=value;
  else{units.push({word:opening+value});opening='';}
 }
 if(opening)units.push({word:opening});
 return units;
}
export function minimumCaptionReadingHold(text,fps=24){
 const characters=segments(text.trim(),'grapheme').length;
 const words=segments(text,'word').filter(part=>part.isWordLike).length;
 return Math.ceil(Math.max(.8+characters/70,words/3)*fps);
}
export function createScreenCaption(scene,frame,font){
 const spec=scene.caption,timing=screenCaptionTiming(scene),entry=clamp(frame/timing.entryFrames);
 const entrance=smooth(entry),exit=smooth((frame-timing.exitStart)/timing.exitFrames);
 const animation=spec.animation??'caption-over-screen',glass=animation==='caption-over-screen';
 const caption=document.createElement('div');caption.dataset.screenCaption='';
 Object.assign(caption.style,{
  position:'absolute',left:'50%',top:spec.placement==='top'?'100px':'auto',bottom:spec.placement==='top'?'auto':'100px',
  width:'max-content',maxWidth:'1040px',boxSizing:'border-box',padding:'20px 30px',borderRadius:glass?'20px':'10px',
  border:glass?'1px solid rgba(255,255,255,.28)':'none',background:glass?'rgba(12,21,37,.74)':'rgba(12,21,37,.92)',
  backdropFilter:glass?'blur(24px)':'none',boxShadow:glass?'0 22px 60px rgba(0,0,0,.25)':'none',
  color:'#ffffff',font:`600 36px ${font}`,lineHeight:'1.3',textAlign:'center',whiteSpace:'pre-wrap',overflowWrap:'anywhere',
  opacity:String(entrance*(1-exit)),transform:'translateX(-50%)',clipPath:'none',
 });
 if(animation==='scale-pop')caption.style.transform+=` scale(${.88+.12*entrance-.04*exit})`;
 if(animation==='line-wipe')caption.style.clipPath=`inset(0 ${(1-entrance)*100}% 0 ${exit*100}% round 10px)`;
 if(glass)caption.style.transform+=` translateY(${(spec.placement==='top'?-1:1)*(22*(1-entrance)+12*exit)}px)`;
 if(animation==='word-stagger'){
  // Segment at Unicode word boundaries without splitting emoji or combining marks.
  // Keep whitespace as real text so layout is identical at every animation frame.
  const units=captionWords(spec.text),count=units.filter(unit=>unit.word!==undefined).length;
  let index=0;
  for(const unit of units){
   if(unit.space!==undefined){caption.append(document.createTextNode(unit.space));continue;}
   const word=document.createElement('span');word.dataset.captionWord='';word.textContent=unit.word;
   const delay=count<=1?0:index++/(count-1)*.6,progress=smooth((entry-delay)/.4);
   Object.assign(word.style,{display:'inline-block',maxWidth:'100%',verticalAlign:'top',opacity:String(progress),transform:`translateY(${18*(1-progress)}px)`});
   caption.append(word);
  }
 }else caption.textContent=spec.text;
 return caption;
}
