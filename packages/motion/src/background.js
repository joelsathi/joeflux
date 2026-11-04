export const BACKGROUND_STYLES=['static','gradient-drift','soft-light','particles'];

export function backgroundFrame(config,frame,fps){
 const style=config?.style??'legacy',intensity=config?.intensity??.5,speed=config?.speed??1;
 const time=frame/fps*speed;
 return {style,intensity,time,dx:Math.sin(time*.24)*.12*intensity,dy:(Math.cos(time*.19)-1)*.08*intensity,
  lightX:.5+Math.sin(time*.3)*.3,lightY:.3+Math.sin(time*.21)*.16};
}

/** Shared frame-based painter; omitted options preserve accepted backgrounds. */
export function drawThemeBackground(context,theme,width,height,motion={style:'legacy'}){
 context.save();
 if(!theme.backgroundLayers){
  // Preserve the two original themes byte-for-byte in the Canvas path.
  const gradient=context.createLinearGradient(0,0,width,height);
  gradient.addColorStop(0,theme.background);gradient.addColorStop(1,theme.backgroundEnd);
  context.fillStyle=gradient;context.fillRect(0,0,width,height);
 }else{
  context.fillStyle=theme.background;context.fillRect(0,0,width,height);
  context.globalCompositeOperation=theme.backgroundBlend??'source-over';
  // CSS backgrounds list the top layer first. Radial circles use farthest-corner.
  for(const layer of [...theme.backgroundLayers].reverse()){
   if(layer.color)context.fillStyle=layer.color;
   else{
    const drift=motion.style==='gradient-drift';
    const x=(layer.x+(drift?motion.dx:0))*width,y=(layer.y+(drift?motion.dy:0))*height,radius=Math.hypot(Math.max(Math.abs(x),Math.abs(width-x)),Math.max(Math.abs(y),Math.abs(height-y)));
    const gradient=context.createRadialGradient(x,y,0,x,y,radius);
    for(const [at,color] of layer.stops)gradient.addColorStop(at,color);
    context.fillStyle=gradient;
   }
   context.fillRect(0,0,width,height);
  }
 }
 if((motion.style==='soft-light'||(motion.style==='gradient-drift'&&!theme.backgroundLayers?.length))&&motion.intensity>0){
  context.globalCompositeOperation='source-over';context.globalAlpha=motion.intensity*.16;
  const x=motion.lightX*width,y=motion.lightY*height;
  const glow=context.createRadialGradient(x,y,0,x,y,width*.6);
  glow.addColorStop(0,theme.accent);glow.addColorStop(1,theme.accent+'00');
  context.fillStyle=glow;context.fillRect(0,0,width,height);
 }
 context.restore();
}
