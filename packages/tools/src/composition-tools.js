import { z } from 'zod';
import { defineTool, ToolError } from './runner.js';
import { editScene } from './scene-edits.js';
import { listComponentDefinitions, getComponentDefinition, COMPONENT_ANCHORS } from '../../composition/src/catalog.js';
import { instantiateComponent, retimeComponent, replacementErrors, componentInputErrors } from '../../composition/src/model.js';
const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const target = { id, componentId: id };
const value = z.union([z.string(), z.number(), z.boolean()]);
const fieldsFor = definition => [...definition.slots, ...definition.controls];
function assertComposition(scene) { if (scene.kind !== 'composition') throw new ToolError('Select a composition shot.'); }
function updateComponent(tx, args, change) {
 return editScene(tx, args.id, async scene => {
  assertComposition(scene);
  const index = scene.components.findIndex(component => component.id === args.componentId);
  if (index < 0) throw new ToolError(`No component ${args.componentId}.`);
  const project = await tx.project();
  scene.components[index] = await change(scene.components[index], scene, project);
  return scene;
 });
}
export const COMPOSITION_TOOLS = [
 defineTool({name:'component_list',description:'List composable title, proof, shape, CTA and terminal definitions, typed inputs, formats, anchors and protected timing.',run:()=>listComponentDefinitions()}),
 defineTool({name:'component_add',description:'Add a compatible transparent component to a composition shot in one undoable edit.',mutates:true,input:z.object({...target,component:z.string(),inputs:z.record(z.string(),value).optional(),anchor:z.enum(COMPONENT_ANCHORS).optional()}),summary:({componentId})=>`Add component ${componentId}`,run:({tx},args)=>editScene(tx,args.id,async scene=>{
  assertComposition(scene);if(scene.components.some(c=>c.id===args.componentId))throw new ToolError('Component id already exists.');
  const project=await tx.project();
  scene.components.push(instantiateComponent(args.component,{id:args.componentId,inputs:args.inputs,durationFrames:scene.durationFrames,fps:project.output.fps,...(args.anchor?{layout:{anchor:args.anchor}}:{})}));return scene;
 })}),
 defineTool({name:'component_set_input',description:'Set one component input. Locks, asset declarations and minimum reading holds are enforced.',mutates:true,input:z.object({...target,input:z.string(),value}),summary:({componentId,input})=>`Set ${componentId} ${input}`,run:({tx},args)=>updateComponent(tx,args,(instance,scene,project)=>{
  const definition=getComponentDefinition(instance.component,instance.version),inputs={...instance.inputs,[args.input]:args.value};
  const errors=componentInputErrors(definition,inputs,project);if(errors.length)throw new ToolError(errors.join(' '));
  return {...instance,inputs};
 })}),
 defineTool({name:'component_replace',description:'Swap a compatible component while preserving matching inputs, layout, timing, seed and locks.',mutates:true,input:z.object({...target,component:z.string()}),summary:({componentId})=>`Replace ${componentId}`,run:({tx},args)=>updateComponent(tx,args,(instance,scene,project)=>{
  const definition=getComponentDefinition(args.component),issues=replacementErrors(instance,definition);if(issues.length)throw new ToolError(issues.join(' '));
  const keys=new Set(fieldsFor(definition).map(field=>field.id));
  return instantiateComponent(definition,{...instance,inputs:Object.fromEntries(Object.entries(instance.inputs).filter(([key])=>keys.has(key))),fps:project.output.fps});
 })}),
 defineTool({name:'component_retime',description:'Retiming preserves the minimum reading hold and requires the interval to fit its shot.',mutates:true,input:z.object({...target,durationFrames:z.int().min(2)}),summary:({componentId})=>`Retime ${componentId}`,run:({tx},args)=>updateComponent(tx,args,(instance,scene,project)=>retimeComponent(instance,args.durationFrames,project.output.fps))}),
 defineTool({name:'component_bind_anchor',description:'Bind a component to a shared layout anchor across supported formats.',mutates:true,input:z.object({...target,anchor:z.enum(COMPONENT_ANCHORS)}),summary:({componentId,anchor})=>`Place ${componentId} at ${anchor}`,run:({tx},args)=>updateComponent(tx,args,instance=>({...instance,layout:{anchor:args.anchor}}))}),
 defineTool({name:'component_lock',description:'Lock or unlock a component copy, asset, layout, motion or beat. All transaction tools respect these locks.',mutates:true,input:z.object({...target,scope:z.enum(['copy','asset','layout','motion','beat']),locked:z.boolean()}),summary:({componentId,scope,locked})=>`${locked?'Lock':'Unlock'} ${componentId} ${scope}`,run:({tx},args)=>updateComponent(tx,args,instance=>({...instance,locks:{...instance.locks,[args.scope]:args.locked}}))}),
 defineTool({name:'composition_retime',description:'Change shot duration and retime every component while preserving protected holds and locked beats.',mutates:true,input:z.object({id,durationFrames:z.int().min(2)}),summary:({id})=>`Retime composition ${id}`,run:({tx},args)=>editScene(tx,args.id,async scene=>{
  assertComposition(scene);const project=await tx.project(),ratio=args.durationFrames/scene.durationFrames;
  scene.components=scene.components.map(instance=>{
   const t=instance.timing,end=t.startFrame+t.entranceFrames+t.holdFrames+t.exitFrames;
   if(instance.locks?.motion||instance.locks?.timing){if(end>args.durationFrames)throw new ToolError(`Component ${instance.id} timing is locked and would end after the shot.`);return instance;}
   const startFrame=Math.round(t.startFrame*ratio);return retimeComponent({...instance,timing:{...t,startFrame}},Math.round(end*ratio)-startFrame,project.output.fps);
  });scene.durationFrames=args.durationFrames;return scene;
 })}),
];
