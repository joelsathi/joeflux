import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTemplateControls, captureTemplateOverrides } from '../packages/presets/src/template-controls.js';

test('declared field values reach their rendered paths and reject invalid or unknown controls',()=>{
 const fields=[{id:'accent',type:'color',path:'pluginOptions.color',default:'#112233'},{id:'quality',type:'number',path:'pluginOptions.quality',default:1,min:1,max:2,step:1}];
 const input={plugin:'threejs'};
 assert.deepEqual(applyTemplateControls(input,fields,{accent:'#abcdef',quality:2}),{plugin:'threejs',pluginOptions:{color:'#abcdef',quality:2}});
 assert.deepEqual(input,{plugin:'threejs'});
 for(const values of [{foo:1},{accent:'red'},{quality:1.5},{quality:3}])assert.throws(()=>applyTemplateControls(input,fields,values));
 assert.throws(()=>applyTemplateControls(input,[{id:'bad',type:'text',path:'__proto__.polluted',default:'yes'}],{}));
 assert.equal({}.polluted,undefined);
});

test('scene edits record local overrides without losing versioned input bindings',()=>{
 const before={id:'one',params:{title:'Saved title'},templateInstance:{package:'example/pack',version:'1.0.0',inputs:{title:'Saved title'},overrides:{}}};
 const after={...structuredClone(before),params:{title:'Local title'},pluginOptions:{color:'#ffffff'}};
 const tracked=captureTemplateOverrides(before,after);
 assert.equal(tracked.templateInstance.inputs.title,'Saved title');
 assert.equal(tracked.templateInstance.overrides['params.title'],'Local title');
 assert.equal(tracked.templateInstance.overrides['pluginOptions.color'],'#ffffff');
 assert.equal(before.params.title,'Saved title');
});

test('a declared component control edits one array entry without dropping siblings',()=>{
 const scene={components:[{inputs:{color:'#111111'}},{inputs:{color:'#222222'}}]};
 const result=applyTemplateControls(scene,[{id:'accent',type:'color',path:'components.0.inputs.color'}],{accent:'#abcdef'});
 assert.equal(result.components[0].inputs.color,'#abcdef');
 assert.deepEqual(result.components[1],scene.components[1]);assert.ok(Array.isArray(result.components));
});
