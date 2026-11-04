import { getComponentDefinition } from '../../composition/src/catalog.js';
import { ToolError } from './runner.js';
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
export function assertCompositionLocks(before, after) {
 for (const scene of before.scenes ?? []) {
  for (const component of scene.components ?? []) {
   const locks=component.locks ?? {}; if (!Object.values(locks).some(Boolean)) continue;
   const nextScene=after.scenes?.find(item=>item.id===scene.id), next=nextScene?.components?.find(item=>item.id===component.id);
   const fail=scope=>{throw new ToolError(`Component ${component.id} ${scope} is locked. Unlock it in a separate change first.`);};
   if(!nextScene)continue;
   if(!next)fail('content');
   const definition=getComponentDefinition(component.component,component.version);
   if(!definition)continue;
   const changedInputs=[...definition.slots,...definition.controls].filter(field=>!same(component.inputs?.[field.id],next.inputs?.[field.id]));
   if(locks.copy && changedInputs.some(field=>field.type==='text'))fail('copy');
   if(locks.asset && changedInputs.some(field=>field.type==='asset'))fail('asset');
   if(locks.layout && !same(component.layout,next.layout))fail('layout');
   if(locks.motion && (!same(component.component,next.component)||!same(component.version,next.version)||component.seed!==next.seed||changedInputs.some(field=>!['text','asset'].includes(field.type))||component.timing.entranceFrames!==next.timing?.entranceFrames||component.timing.exitFrames!==next.timing?.exitFrames))fail('motion');
   if(locks.timing && !same(component.timing,next.timing))fail('timing');
   if(locks.beat && (!same(component.timing,next.timing)||scene.durationFrames!==nextScene.durationFrames))fail('beat');
  }
 }
}
