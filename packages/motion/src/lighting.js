// Backdrop light for screen.lighting, drawn on the background canvas under the CSS stage.
const rgba=(hex,alpha)=>{const n=Number.parseInt(hex.replace('#','').slice(0,6),16);return `rgba(${n>>16}, ${(n>>8)&255}, ${n&255}, ${alpha})`;};

// Where the stage shows the screen: its center projected through the stage perspective (rotation ignored).
export function screenBounds(plane,output,perspective=1800) {
  const {rect,pose}=plane,f=perspective/Math.max(1,perspective-pose.z),cx=output.width/2,cy=output.height/2;
  return {x:cx+(rect.x+rect.width/2+pose.x-cx)*f,y:cy+(rect.y+rect.height/2+pose.y-cy)*f,width:rect.width*pose.scale*f,height:rect.height*pose.scale*f};
}

export function drawScreenLighting(context,lighting,bounds,output,{accent,dark}) {
  const amount=lighting.intensity??.6;
  if(lighting.style==='none'||amount<=0)return;
  const {x,y,width,height}=bounds,size=Math.max(width,height),tone=dark?'#ffffff':'#0b182c';
  const fill=(gradient,area=[0,0,output.width,output.height])=>{context.fillStyle=gradient;context.fillRect(...area);};
  context.save();
  if(lighting.style==='spotlight') {
    const shade=context.createRadialGradient(x,y,size*.4,x,y,Math.hypot(output.width,output.height)*.8);
    shade.addColorStop(0,'rgba(0, 0, 0, 0)');shade.addColorStop(1,`rgba(0, 0, 0, ${(dark?.45:.22)*amount})`);fill(shade);
    const light=context.createRadialGradient(x,y-height*.1,0,x,y-height*.1,size*.8);
    light.addColorStop(0,`rgba(255, 255, 255, ${(dark?.2:.75)*amount})`);light.addColorStop(1,'rgba(255, 255, 255, 0)');fill(light);
  }
  if(lighting.style==='glow') {
    const glow=context.createRadialGradient(x,y,Math.min(width,height)*.3,x,y,size*.85);
    glow.addColorStop(0,rgba(accent,.55*amount));glow.addColorStop(.55,rgba(accent,.18*amount));glow.addColorStop(1,rgba(accent,0));fill(glow);
  }
  if(lighting.style==='floor') {
    const bottom=y+height/2,horizon=Math.min(output.height,bottom-height*.12),glint=dark?'#ffffff':'#6b8aa8',reach=width*.55,area=[-reach,-reach,reach*2,reach*2];
    const floor=context.createLinearGradient(0,horizon,0,output.height);
    floor.addColorStop(0,rgba(tone,0));floor.addColorStop(1,rgba(tone,(dark?.1:.14)*amount));fill(floor,[0,horizon,output.width,output.height-horizon]);
    // Elliptical gradients: a soft reflection under the screen, then a tighter contact shadow.
    context.translate(x,bottom);context.scale(1,.3);
    const reflection=context.createRadialGradient(0,0,0,0,0,reach);
    reflection.addColorStop(0,rgba(glint,(dark?.18:.26)*amount));reflection.addColorStop(1,rgba(glint,0));fill(reflection,area);
    context.scale(1,.25);
    const contact=context.createRadialGradient(0,0,0,0,0,reach);
    contact.addColorStop(0,`rgba(0, 0, 0, ${(dark?.5:.3)*amount})`);contact.addColorStop(1,'rgba(0, 0, 0, 0)');fill(contact,area);
  }
  context.restore();
}
