import { pluginCapabilities } from '../../animation-plugins/src/catalog.js';
import { getComponentDefinition } from '../../composition/src/catalog.js';

export function sceneVariations(scene,project){
  const original=structuredClone(scene);
  if (scene.kind === 'composition') {
    const variants = [{id:'original',label:'Current direction',scene:original}];
    for (const {id,label,value} of [{id:'warm',label:'Warm accent',value:'#ff9f66'},{id:'cool',label:'Cool accent',value:'#9faaff'},{id:'mint',label:'Mint accent',value:'#74e7cd'}]) {
      const next=structuredClone(scene); let changed=false;
      for(const component of next.components??[]) {
        const definition=getComponentDefinition(component.component,component.version);
        if(component.locks?.motion || !definition?.controls.some(field=>field.id==='color'&&field.type==='color') || component.inputs?.color?.toLowerCase()===value) continue;
        component.inputs={...component.inputs,color:value}; changed=true;
      }
      if(changed)variants.push({id,label,scene:next});
      if(variants.length===3)break;
    }
    return variants;
  }
  if (scene.plugin) {
    const color = pluginCapabilities(scene.plugin)?.color;
    const current = scene.pluginOptions?.color ?? color?.default;
    return [
      { id: 'original', label: 'Current direction', scene: original },
      ...(color?.variations ?? []).filter(item => item.value.toLowerCase() !== current?.toLowerCase()).slice(0, 2).map(item => ({
        id: item.id, label: item.label,
        scene: { ...structuredClone(scene), pluginOptions: { ...scene.pluginOptions, color: item.value } },
      })),
    ];
  }
  const themes=project.style?.themes??[];
  const dark=themes.find(id=>id.endsWith('-dark'))??'oxygen-wso2-dark';
  const light=themes.find(id=>id.endsWith('-light'))??'oxygen-acrylic-purple-light';
  const candidate=(id,label,theme,compositor,lighting)=>{
    const next={...structuredClone(scene),theme,compositor:{...scene.compositor,...compositor}};
    if(next.kind==='screen'&&lighting)next.screen={...next.screen,lighting};
    return {id,label,scene:next};
  };
  return [
    {id:'original',label:'Current direction',scene:original},
    candidate('cinematic','Cinematic',dark,{look:'cinematic',depthOfField:.25,light:.55},{style:'glow',intensity:.7}),
    candidate('editorial','Editorial',light,{look:'neutral',depthOfField:.08,light:.16},{style:'spotlight',intensity:.35}),
  ];
}

export function styleChecks(scene,project){
  const findings=[],fps=project.output.fps,duration=scene.durationFrames/fps;
  if(duration<2)findings.push({level:'warning',topic:'Pacing',message:'This shot may be too brief for its idea to land.'});
  if(scene.kind==='screen'){
    if((scene.camera?.shots?.length??0)>4&&duration<5)findings.push({level:'warning',topic:'Camera',message:'Many focus points compete for a short reading window.'});
    if(scene.caption?.text?.length>80&&duration<4)findings.push({level:'warning',topic:'Copy',message:'The screen caption may need more reading time.'});
    if(scene.screen?.presentation==='studio'&&scene.screen.padding===0)findings.push({level:'warning',topic:'Composition',message:'The floating screen reaches the stage edge.'});
  }
  if(scene.preset==='text-template'&&scene.params?.title?.length>70)findings.push({level:'warning',topic:'Copy',message:'The title is long for a motion card; split it or shorten it.'});
  if(scene.compositor?.depthOfField>.7)findings.push({level:'warning',topic:'Clarity',message:'Strong soft focus can obscure supporting details.'});
  return findings;
}
