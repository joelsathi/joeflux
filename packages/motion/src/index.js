/** Deterministic canvas renderer for silent scenes. */
import { evaluateCamera, mapSourceFrame, ease } from './timing.js';
import { layoutScene, layoutText } from './layout.js';
import { drawFittedText } from './text.js';
import { evaluateZoom } from './zoom.js';
import { evaluateRecipe, RECIPE_NAMES } from '../../presets/src/recipes.js';
import { fitMediaRect } from './spatial-stage.js';
import { resolveTheme } from '../../presets/src/themes.js';
import { drawThemeBackground, backgroundFrame } from './background.js';
import { drawTextTemplate } from './text-animation.js';
import { evaluateShots } from './camera-motion.js';
import { toV2 } from '../../schema/src/migrate.js';
import { drawScreenLighting, screenBounds } from './lighting.js';

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smooth = (value) => ease(value, 'easeInOut');
function seeded(seed) { let value = (seed ?? 3109) >>> 0; return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; }; }
function particlesFor(seed, frame, width, height, fps) { const random = seeded(seed); const seconds = frame / fps; return Array.from({ length: 54 }, (_, id) => { const x = random() * width; const y = height * .14 + random() * height * .74; const phase = random() * Math.PI * 2; const rate = .1 + random() * .22; const depth = .3 + random() * .7; return { id, x: x + Math.sin(phase + seconds * rate) * 30, y: y + Math.cos(phase * .8 + seconds * rate * .9) * 20, radius: 1 + depth * 1.8, alpha: .1 + depth * .2 }; }); }

export function getFrameState(scene, frame, output, project = {}) {
  scene = toV2(scene); const shot = scene.kind === 'screen' ? evaluateShots(scene.camera, frame, scene.durationFrames) : null;
  const progress = scene.durationFrames <= 1 ? 1 : frame / (scene.durationFrames - 1); const params = scene.params ?? {};
  const background=backgroundFrame(scene.background,frame,output.fps);
  const particles=background.style==='legacy'?particlesFor(params.seed,frame,output.width,output.height,output.fps):background.style==='particles'&&background.intensity>0?particlesFor(params.seed,frame*(scene.background?.speed??1),output.width,output.height,output.fps).map(dot=>({...dot,alpha:dot.alpha*background.intensity})):[];
  return { id:scene.id, frame, progress, background, preset: scene.preset, title: params.title ?? '', eyebrow: params.eyebrow ?? '', subtitle: params.subtitle ?? '', items: params.items ?? [], titleOpacity: smooth((progress - .07) / .18), camera: shot?shot.pose:evaluateCamera(scene.camera, frame, scene.durationFrames), sourceFrame: mapSourceFrame(scene.playback, frame, output.fps), zoom: shot?shot.zoom:evaluateZoom(scene.zoom, frame), particles, theme: resolveTheme(project.theme, scene.theme), layout: layoutScene(scene, output), recipe: evaluateRecipe(scene,frame,output) };
}

export function renderFrameToCanvas(canvas, scene, frame, output, asset, project = {}, options = {}) {
  scene=toV2(scene); const size=output.width/1920; const design={...output,width:1920,height:output.height/size}; const state = getFrameState(scene, frame, design, project); const context = canvas.getContext('2d'); canvas.width = output.width; canvas.height = output.height; context.scale(size,size); output=design;
  const backdrop=scene.screen?.backdrop??'theme';
  if(options.backgroundImage && scene.background?.image){
    const image=options.backgroundImage,scale=Math.max(output.width/image.naturalWidth,output.height/image.naturalHeight);
    const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
    context.drawImage(image,(output.width-width)/2,(output.height-height)/2,width,height);
  }else if(backdrop!=='theme'){
    const dark=backdrop==='slate',gradient=context.createRadialGradient(output.width*.5,output.height*.46,output.width*.08,output.width*.5,output.height*.48,output.width*.9);
    gradient.addColorStop(0,dark?'#243344':'#ffffff');gradient.addColorStop(1,dark?'#0e1826':'#eef3f7');
    context.fillStyle=gradient;context.fillRect(0,0,output.width,output.height);
  }else drawThemeBackground(context,state.theme,output.width,output.height,state.background);
  if(backdrop==='theme'&&!scene.background?.image)drawParticles(context,state);
  const lighting=scene.screen?.lighting,plane=state.recipe.planes[0];
  if(lighting&&plane)drawScreenLighting(context,lighting,screenBounds(plane,output,scene.perspective),output,{accent:state.theme.accent,dark:backdrop==='slate'||backdrop==='theme'&&(state.theme.mode??(state.theme.id==='navy-dark'?'dark':'light'))==='dark'});
  if(scene.preset==='text-template') state.text=drawTextTemplate(context,scene,frame,output,state.theme);
  else if (scene.kind==='screen' || RECIPE_NAMES.includes(scene.preset) || ['recorded-showcase','focus-transition'].includes(scene.preset)) drawRecipeLayer(context,state,output,asset,options);
  else if (scene.preset === 'text-settle') drawTextSettle(context, state, output);
  else if (scene.preset === 'floating-cards') drawFloatingCards(context, state, output);
  else if (scene.preset === 'feature-list') drawFeatureList(context, state, output);
  else drawParticleTitle(context, state, output); return state;
}

function drawParticles(context, state) { context.save(); for (const dot of state.particles) { context.fillStyle = hexAlpha(state.theme.particle, dot.alpha); context.beginPath(); context.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2); context.fill(); } context.restore(); }
function drawEyebrow(context, state, x, y, align = 'left') {
  if (!state.eyebrow) return;
  context.save(); context.globalAlpha *= state.titleOpacity;
  const width=align==='center'?1240:(state.layout.copyRect?.width??1240);
  drawFittedText(context,state.eyebrow.toUpperCase(),{x:align==='center'?x-width/2:x,y,width},{font:state.theme.font,size:22,minSize:18,maxLines:2,align,color:state.theme.muted,label:`Scene ${state.id} eyebrow`});
  context.restore();
}
function drawTextBlock(context, state, rect, { titleSize = 76, titleLines = 2, align = 'left', subtitle = true } = {}) {
  context.save(); context.globalAlpha *= state.titleOpacity;
  const title=drawFittedText(context,state.title,rect,{font:state.theme.font,size:titleSize,minSize:32,maxLines:titleLines,align,color:state.theme.text,label:`Scene ${state.id} title`});
  if(subtitle && state.subtitle) drawFittedText(context,state.subtitle,{...rect,y:rect.y+title.bounds.height+32,height:Math.max(0,(rect.height??600)-title.bounds.height-32)},{font:state.theme.font,weight:400,size:32,minSize:28,maxLines:4,align,color:state.theme.muted,label:`Scene ${state.id} subtitle`});
  context.restore(); return title;
}
function drawTextSettle(context, state, output) { const width = Math.min(output.width - 192, 1240); const rect = { x: (output.width - width) / 2, y: output.height / 2 - 72, width }; drawEyebrow(context, state, output.width / 2, rect.y - 104, 'center'); drawTextBlock(context, state, rect, { align: 'center' }); }
function drawParticleTitle(context, state, output) { const rect = { x: 120, y: output.height * .42, width: output.width - 240 }; drawEyebrow(context, state, output.width / 2, rect.y - 110, 'center'); drawTextBlock(context, state, rect, { align: 'center' }); }
function drawFloatingCards(context, state, output) { if(state.items.length>4) throw new Error(`Scene ${state.id}: at most four cards fit; split into another scene.`); const cards = state.items; const top = { x: 160, y: 330, width: output.width - 320 }; drawEyebrow(context, state, output.width / 2, 168, 'center'); drawTextBlock(context, state, top, { titleSize: 62, titleLines: 2, align: 'center', subtitle: false }); const cardWidth = Math.min(356, (output.width - 260 - (cards.length - 1) * 28) / Math.max(cards.length, 1)); cards.forEach((card, index) => { const phase = smooth((state.progress - .16 - index * .08) / .28); drawCard(context, { x: (output.width - cards.length * cardWidth - (cards.length-1)*28)/2 + cardWidth / 2 + index * (cardWidth + 28), y: 730 + (1 - phase) * 90, width: cardWidth, height: 200, label: card, opacity: phase, rotate: (index - (cards.length - 1) / 2) * .035, theme: state.theme }); }); }
function drawFeatureList(context, state) { if(state.items.length>4) throw new Error(`Scene ${state.id}: at most four list items fit; split into another scene.`); const items = state.items; const rect = { x: 180, y: 268, width: 800 }; drawEyebrow(context, state, rect.x, 158); drawTextBlock(context, state, rect, { titleSize: 64, titleLines: 2, subtitle: false }); items.forEach((item, index) => { const y = 480 + index * 112; const opacity = smooth((state.progress - .22 - index * .1) / .2); context.save(); context.globalAlpha = opacity; context.fillStyle = state.theme.surface; context.strokeStyle = state.theme.border; context.lineWidth = 1; roundRect(context, rect.x, y, rect.width, 76, 16); context.fill(); context.stroke(); context.fillStyle = state.theme.accent; context.beginPath(); context.arc(rect.x + 38, y + 38, 8, 0, Math.PI * 2); context.fill(); context.fillStyle = state.theme.text; context.font = `500 28px ${state.theme.font}`; drawFittedText(context,item,{x:rect.x+68,y:y+18,width:rect.width-92,height:48},{font:state.theme.font,weight:500,size:28,minSize:24,maxLines:1,color:state.theme.text,label:`Scene ${state.id} feature`}); context.restore(); }); }
function drawRecipeLayer(context,state,output,asset,options) {
  const recipe=state.recipe,copy=recipe.copyRect;
  if(recipe.cardsAlpha>0) {
    const labels=state.items.length?state.items:['Context','A clear next step'];
    labels.slice(0,3).forEach((label,index)=>drawCard(context,{x:state.preset==='screen-handoff'?370+index*155:430+index*410,y:state.preset==='screen-handoff'?700-index*30:740,width:state.preset==='screen-handoff'?260:360,height:150,label,opacity:recipe.cardsAlpha*.85,rotate:(index-1)*.03,theme:state.theme}));
  }
  if(recipe.accent!==undefined && recipe.accent>0 && recipe.accent<1) {
    context.fillStyle=state.theme.accent;context.fillRect(-output.width+recipe.accent*output.width*2,0,output.width*.12,output.height);
  }
  if(recipe.captionAlpha>0) {
    const caption={...state,title:recipe.title??state.title,titleOpacity:recipe.captionAlpha};
    drawEyebrow(context,caption,copy.x,copy.y);
    if(state.theme.id==='navy-dark'){context.save();context.globalAlpha=recipe.captionAlpha;context.fillStyle=state.theme.accent;context.fillRect(copy.x,copy.y+42,48,4);context.restore();}
    drawTextBlock(context,caption,{...copy,y:copy.y+64,height:copy.height-64},{titleSize:state.preset==='chapter-opener'?76:54,titleLines:2});
  }
  // Direct Canvas custom scenes retain a flat fallback; browser preview/export use the CSS stage.
  if(options.media!==false && asset) for(const plane of recipe.planes) {
    if(plane.pose.opacity<=0) continue;
    const rect=fitMediaRect(plane.rect,asset.naturalWidth??asset.width,asset.naturalHeight??asset.height);
    context.save();context.globalAlpha=plane.pose.opacity;context.translate(rect.x+rect.width/2+plane.pose.x,rect.y+rect.height/2+plane.pose.y);context.rotate(plane.pose.rotateZ*Math.PI/180);
    context.drawImage(asset,-rect.width/2,-rect.height/2,rect.width,rect.height);context.restore();
  }
}
function drawCard(context, { x, y, width, height, label, opacity, rotate, theme }) { context.save(); context.globalAlpha = opacity; context.translate(x, y); context.rotate(rotate); context.shadowColor = 'rgba(0,0,0,.14)'; context.shadowBlur = 28; context.shadowOffsetY = 14; context.fillStyle = theme.surface; roundRect(context, -width / 2, -height / 2, width, height, 20); context.fill(); context.shadowColor = 'transparent'; context.strokeStyle = theme.border; context.stroke(); context.fillStyle = theme.text; context.font = `600 25px ${theme.font}`; drawFittedText(context,label,{x:-width/2+24,y:-height/2+48,width:width-48,height:height-72},{font:theme.font,size:25,minSize:20,maxLines:3,color:theme.text,label:'Card'}); context.restore(); }
function hexAlpha(hex, alpha) { const value = hex.replace('#', ''); const number = Number.parseInt(value, 16); return `rgba(${number >> 16}, ${(number >> 8) & 255}, ${number & 255}, ${alpha})`; }
function roundRect(context, x, y, width, height, radius) { context.beginPath(); context.roundRect(x, y, width, height, radius); }
