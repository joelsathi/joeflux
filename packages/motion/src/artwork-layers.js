const playerByDocument=new WeakMap();
const layerStates=new WeakMap();

function lottiePlayer(){
  if(window.lottie)return Promise.resolve(window.lottie);
  if(!playerByDocument.has(document))playerByDocument.set(document,new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='/vendor/lottie-web/player.min.js';
    script.onload=()=>window.lottie?resolve(window.lottie):reject(new Error('Lottie player did not initialize.'));
    script.onerror=()=>reject(new Error('Could not load Lottie player.'));
    document.head.append(script);
  }));
  return playerByDocument.get(document);
}

function assetUrl(project,asset,assetBase){
  const file=project.assets?.[asset];
  if(!file)throw new Error(`Missing declared artwork asset "${asset}".`);
  return `${assetBase}/${file.split('/').map(encodeURIComponent).join('/')}`;
}

async function makeLayer(spec,project,assetBase){
  const holder=document.createElement('div');
  holder.dataset.artworkLayer=spec.asset;
  Object.assign(holder.style,{position:'absolute',left:`${spec.x*100}%`,top:`${spec.y*100}%`,width:`${spec.width*100}%`,height:`${spec.height*100}%`,opacity:String(spec.opacity??1),pointerEvents:'none',overflow:'hidden'});
  const url=assetUrl(project,spec.asset,assetBase);
  if(spec.type==='svg'){
    const image=new Image();image.src=url;
    Object.assign(image.style,{width:'100%',height:'100%',objectFit:'contain'});
    await image.decode();holder.append(image);
    return {holder,spec};
  }
  const [player,response]=await Promise.all([lottiePlayer(),fetch(url)]);
  if(!response.ok)throw new Error(`Could not load Bodymovin asset "${spec.asset}".`);
  const data=await response.json();
  if(!Number.isFinite(data.fr)||!Number.isFinite(data.ip)||!Number.isFinite(data.op)||!Array.isArray(data.layers))throw new Error(`Asset "${spec.asset}" is not Bodymovin JSON.`);
  const animation=player.loadAnimation({container:holder,renderer:'svg',loop:false,autoplay:false,animationData:structuredClone(data),rendererSettings:{preserveAspectRatio:'xMidYMid meet',runExpressions:false}});
  await new Promise((resolve,reject)=>{
    animation.addEventListener('DOMLoaded',resolve);
    animation.addEventListener('data_failed',()=>reject(new Error(`Could not initialize Bodymovin asset "${spec.asset}".`)));
  });
  return {holder,spec,animation,data};
}

export async function prepareArtworkLayers(canvas,scene,project,assetBase='/assets'){
  const key=JSON.stringify([scene.id,scene.layers??[],project.assets]);
  const prior=layerStates.get(canvas);
  if(prior?.key===key)return prior.items;
  for(const item of prior?.items??[])item.animation?.destroy();
  const items=await Promise.all((scene.layers??[]).map(spec=>makeLayer(spec,project,assetBase)));
  layerStates.set(canvas,{key,items});
  return items;
}

export function renderArtworkLayers(stage,items,frame,outputFps){
  for(const item of items){
    const {spec,holder,animation,data}=item;
    const visible=frame>=(spec.startFrame??0)&&frame<(spec.endFrame??Infinity);
    holder.style.display=visible?'block':'none';
    if(!visible)continue;
    stage.append(holder);
    if(animation){
      const local=(frame-(spec.startFrame??0))*data.fr/outputFps*(spec.speed??1);
      animation.goToAndStop(Math.min(data.op-1,Math.max(data.ip,data.ip+local)),true);
    }
  }
}
