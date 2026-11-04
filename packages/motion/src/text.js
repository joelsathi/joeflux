import { layoutText } from './layout.js';

export function drawFittedText(context, text, rect, {font='system-ui, sans-serif',weight=600,size=54,minSize=32,maxLines=2,lineHeight=1.18,align='left',color='#173249',label='Text'}={}) {
  let layout;
  try {
    layout=layoutText(text,{maxWidth:rect.width,maxHeight:rect.height??Infinity,maxLines,fontSize:size,minFontSize:minSize,lineHeight:size*lineHeight,measure:(value,fontSize)=>{
      context.font=`${weight} ${fontSize}px ${font}`;
      return context.measureText(value);
    }});
  } catch(error) { throw new Error(`${label}: ${error.message}`); }
  context.font=`${weight} ${layout.fontSize}px ${font}`;
  context.textBaseline='top'; context.textAlign=align; context.fillStyle=color;
  const x=align==='center'?rect.x+rect.width/2:rect.x;
  layout.lines.forEach((line,index)=>context.fillText(line,x,rect.y+index*layout.fontSize*lineHeight));
  return layout;
}
