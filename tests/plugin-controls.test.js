import test from 'node:test';
import assert from 'node:assert/strict';
import { listTemplates, instantiateTemplate } from '../packages/presets/src/templates.js';
import { sceneVariations } from '../packages/presets/src/variations.js';
import { instantiateComponent } from '../packages/composition/src/model.js';

test('composition variations change visible unlocked inputs and preserve protected layers',()=>{
  const scene={id:'composition',kind:'composition',durationFrames:120,components:[instantiateComponent('harness/title',{id:'title',inputs:{title:'Result'},durationFrames:120,fps:24,locks:{motion:true}}),instantiateComponent('harness/shape',{id:'shape',durationFrames:120,fps:24})]};
  const variants=sceneVariations(scene,{output:{fps:24}});
  assert.equal(variants.length,3);
  for(const item of variants.slice(1)) {
    assert.deepEqual(item.scene.components[0],scene.components[0]);
    assert.notEqual(item.scene.components[1].inputs.color,scene.components[1].inputs.color);
    assert.equal(item.scene.compositor,undefined);
    assert.deepEqual(item.scene.components[1].timing,scene.components[1].timing);
  }
  scene.components[1].locks.motion=true;
  assert.equal(sceneVariations(scene,{output:{fps:24}}).length,1);
});

test('plugin variations change rendered color while preserving copy, quality and unrelated data', () => {
  const scene = { id: 'plugin', plugin: 'react-three', durationFrames: 120, params: { title: 'My product', subtitle: '' }, pluginOptions: { color: '#123456', quality: 2 }, transition: { type: 'crossfade', frames: 12 } };
  const variants = sceneVariations(scene, { output: { fps: 24 }, style: { themes: ['oxygen-wso2-light'] } });
  assert.equal(variants.length, 3);
  assert.deepEqual(variants[0].scene, scene);
  assert.equal(new Set(variants.map(item => item.scene.pluginOptions.color)).size, 3);
  for (const { scene: candidate } of variants) {
    assert.deepEqual(candidate.params, scene.params);
    assert.equal(candidate.pluginOptions.quality, 2);
    assert.deepEqual(candidate.transition, scene.transition);
    assert.equal(candidate.theme, undefined);
    assert.equal(candidate.compositor, undefined);
  }
});

test('template instantiation uses current copy, color and duration and rejects unsupported colors', async () => {
  const templates = await listTemplates(), template = templates.find(item => item.id === 'plugin-animejs');
  const scene = instantiateTemplate(template, { slots: { title: 'My own title', subtitle: '' }, color: '#ff5500', duration: 'long', fps: 30, style: { themes: ['oxygen-wso2-light'], look: 'cinematic' } });
  assert.equal(scene.durationFrames, 210);
  assert.deepEqual(scene.params, { title: 'My own title', subtitle: '' });
  assert.equal(scene.pluginOptions.color, '#ff5500');
  assert.equal(scene.theme, undefined);
  assert.equal(scene.compositor, undefined);
  assert.throws(() => instantiateTemplate(template, { color: 'red' }), /six-digit hex/);
  assert.throws(() => instantiateTemplate(templates.find(item => item.id === 'chapter-opener'), { color: '#ff5500' }), /color/);
});

test('preset templates retain remembered pacing and styling in the shared instantiation path', async () => {
  const template = (await listTemplates()).find(item => item.id === 'chapter-opener');
  const scene = instantiateTemplate(template, { style: { pacing: 'measured', themes: ['oxygen-wso2-light'], look: 'cinematic' } });
  assert.equal(scene.durationFrames, template.controls.durations.long * 24);
  assert.equal(scene.theme, 'oxygen-wso2-light');
  assert.equal(scene.compositor.look, 'cinematic');
});
