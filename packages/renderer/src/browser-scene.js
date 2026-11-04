import { createPluginHost, loadAnimationPlugins } from './plugin-host.js';
import { createCompositionHost } from '../../composition/src/render.js';
import { getFrameState, renderFrameToCanvas } from '../../motion/src/index.js';
import { renderSpatialStage, clearSpatialStage } from '../../motion/src/spatial-stage.js';
import { renderModuleFrame } from '../../motion/src/custom.js';
import { createAssetLoader, sourceSecondsForFrame } from './source-frames.js';
import { toV2 } from '../../schema/src/migrate.js';
import { getPackBackground } from '../../presets/src/background-packs.js';
import { BRAND_FONTS, brandLogo } from '../../presets/src/brand-kits.js';
import { prepareArtworkLayers, renderArtworkLayers } from '../../motion/src/artwork-layers.js';
import { applyWebglLook } from '../../motion/src/webgl-compositor.js';

const fontPromises=new Map(),brandImages=new Map(),backgroundImages=new Map();
async function loadBackground(id){
  const item=getPackBackground(id);
  if(!item)throw new Error(`Unknown background ${id}.`);
  if(!backgroundImages.has(id))backgroundImages.set(id,(async()=>{const image=new Image();image.src=item.url;await image.decode();return image;})());
  return backgroundImages.get(id);
}
const FONTS=[{family:'Harness Inter',url:'/brand/InterVariable.woff2',weight:'100 900',style:'normal'},...BRAND_FONTS];
async function loadFont(theme) {
  const faces=FONTS.filter(font=>theme.font.includes(font.family));
  for(const font of faces){
    const key=`${font.family}|${font.url}`;
    if(!fontPromises.has(key)) fontPromises.set(key,(async()=>{
      const face=new FontFace(font.family,`url(${font.url})`,{weight:font.weight,style:font.style});
      document.fonts.add(await face.load());
    })());
  }
  await Promise.all(faces.map(font=>fontPromises.get(`${font.family}|${font.url}`)));
  if(faces.length)await document.fonts.ready;
}
async function loadBrand(theme,brand) {
  const logo=brandLogo(brand,theme.mode??(theme.id==='navy-dark'?'dark':'light'));
  if(!logo)return null;
  if(!brandImages.has(logo.url))brandImages.set(logo.url,(async()=>{const image=new Image();image.src=logo.url;await image.decode();return image;})());
  return {...logo,image:await brandImages.get(logo.url)};
}

// Prepare immutable inputs first; commit only if this request is still current.
export function createSceneRenderer(project,options={}) {
  const load=createAssetLoader(project,options),modules=new Map();
  let generation=0;
  const plugins=createPluginHost({transient:options.transient});
  const compositions=createCompositionHost({loadAsset:load,loadRuntime:loadAnimationPlugins,transient:options.transient});
  const render = async (canvas,original,frame,{isCurrent=()=>true}={})=>{
    const ticket=++generation,scene=toV2(original);
    const current=()=>ticket===generation&&isCurrent();
    if(scene.kind==='composition') {
      await loadFont({font:'Harness Inter'});
      await plugins.release(canvas);
      if(!current())return null;
      clearSpatialStage(canvas);
      return compositions.render(canvas,scene,frame,project.output,project,current);
    }
    await compositions.release(canvas);
    if(!current())return null;
    if(scene.plugin) {
      await loadFont({font:'Harness Inter'});
      if(!current())return null;
      clearSpatialStage(canvas);
      return plugins.render(canvas,scene,frame,project.output,project,current);
    }
    if(scene.module)await plugins.retain(canvas,original,project.output);
    else await plugins.release(canvas);
    if(!current())return null;
    const design={...project.output,width:1920,height:project.output.height/(project.output.width/1920)};
    const state=getFrameState(scene,frame,design,project),assets={};
    await loadFont(state.theme);
    const brand=await loadBrand(state.theme,scene.brand??project.brand);
    if(brand) assets.__brand=brand;
    const backgroundImage=scene.background?.image?await loadBackground(scene.background.image):null;
    await Promise.all(state.recipe.planes.map(async(spec,index)=>{
      spec.key=`plane-${index}`;
      assets[spec.key]=await load(spec.assetId,spec.sourceSeconds??sourceSecondsForFrame(scene,frame,project.output.fps));
    }));
    const asset=scene.params?.asset??scene.screen?.asset,image=asset ? await load(asset,sourceSecondsForFrame(scene,frame,project.output.fps)):null;
    const artwork=await prepareArtworkLayers(canvas,scene,project,options.assetBase??'/assets');
    if(ticket!==generation||!isCurrent())return null;
    const renderBuiltin=async()=>{
      const result=renderFrameToCanvas(canvas,scene,frame,project.output,null,project,{media:false,backgroundImage});
      await applyWebglLook(canvas,scene.compositor);
      // Use the prepared plane keys and identical evaluated poses.
      result.recipe=state.recipe;
      const stage=renderSpatialStage(canvas,result,assets,scene);
      renderArtworkLayers(stage,artwork,frame,project.output.fps);
      canvas.dataset.renderedFrame=String(frame);canvas.dataset.renderedScene=scene.id;return result;
    };
    if(scene.module) {
      clearSpatialStage(canvas);
      return renderModuleFrame(original,frame,{canvas,context:canvas.getContext('2d'),output:project.output,project,scene:original,assetImage:image,renderBuiltin,loadAnimationPlugins,renderPlugin:(factory)=>plugins.render(canvas,original,frame,project.output,project,current,factory)},url=>{
        if(!modules.has(url))modules.set(url,import(/* @vite-ignore */ url));return modules.get(url);
      },'/project-modules');
    }
    return renderBuiltin();
  };
  render.dispose=()=>{generation++;return Promise.all([plugins.dispose(),compositions.dispose()]);};
  return render;
}
