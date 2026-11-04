import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { listTemplates, instantiateTemplate } from '../packages/presets/src/templates.js';
import { getComponentDefinition } from '../packages/composition/src/catalog.js';
import { minimumComponentHold, retimeComponent } from '../packages/composition/src/model.js';
import { validateProject } from '../packages/core/src/index.js';
import { createProjectTools } from '../packages/tools/src/index.js';
import { validateTemplateDefinition } from '../packages/plugins/src/schema.js';

test('light and dark terminal templates remain editable and valid across formats, durations and frame rates', async () => {
  const templates = await listTemplates();
  const definition = getComponentDefinition('harness/terminal');
  assert.ok(definition, 'trusted terminal component is registered');
  assert.equal(definition.slots.find(slot => slot.id === 'transcript').multiline, true);
  for (const palette of ['light', 'dark']) {
    const template = templates.find(item => item.id === `terminal-${palette}`);
    assert.ok(template, `${palette} recipe is discoverable`);
    const { origin, ...data } = template;
    assert.equal(validateTemplateDefinition(data).id, template.id);
    for (const fps of [24, 30]) for (const duration of ['short', 'medium', 'long']) for (const [width, height] of [[1920, 1080], [1080, 1080], [1080, 1920]]) {
      const transcript = '$ app start\nReady\n\n$ app status\n{"ok":true}';
      const scene = instantiateTemplate(template, { id: 'terminal', fps, duration, slots: { transcript } });
      assert.equal(scene.components[0].inputs.transcript, transcript);
      assert.equal(scene.components[0].inputs.palette, palette);
      assert.equal(scene.components[0].component, 'harness/terminal');
      const result = validateProject({ output: { width, height, fps, audio: false }, assets: {}, scenes: [scene] });
      assert.equal(result.valid, true, result.errors.join('\n'));
    }
  }
});

test('terminal timing protects typed commands and settles, with an optional single pane', async () => {
  const template = (await listTemplates()).find(item => item.id === 'terminal-dark');
  assert.ok(template);
  const scene = instantiateTemplate(template, { id: 'terminal', fps: 24, duration: 'long' });
  const component = scene.components[0], original = structuredClone(component);
  const single = { ...component, inputs: { ...component.inputs, secondTranscript: '' } };
  assert.ok(minimumComponentHold(single, 24) < minimumComponentHold(component, 24));
  const lengthy = { ...component, inputs: { ...component.inputs, transcript: '$ ' + 'long-command '.repeat(60), typingSpeed: 10 } };
  assert.ok(minimumComponentHold(lengthy, 24) > minimumComponentHold(component, 24));
  assert.throws(() => retimeComponent(lengthy, 384, 24), /reading hold/);
  assert.deepEqual(component, original);
  const changed = instantiateTemplate(template, { id: 'custom', duration: 'long', controls: { palette: 'light', color: '#235dd0', 'typing-speed': 60 } });
  assert.equal(changed.components[0].inputs.palette, 'light');
  assert.equal(changed.components[0].inputs.color, '#235dd0');
  assert.equal(changed.components[0].inputs.typingSpeed, 60);
});

test('terminal transcripts persist through apply/edit/undo and refuse edits that overrun protected timing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'terminal-template-'));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ version: 1, name: 'Terminal template', output: { width: 640, height: 360, fps: 24, audio: false }, assets: {}, scenes: [] }));
  const tools = createProjectTools(root), transcript = '$ app init\nCreated project';
  await tools.call('template_apply', { template: 'terminal-light', id: 'terminal', slots: { transcript }, duration: 'long' });
  let scene = (await tools.call('project_get',{detail:'full'})).scenes[0];
  const componentId = scene.components[0].id;
  assert.equal(scene.components[0].inputs.transcript, transcript);
  await tools.call('component_set_input', { id: 'terminal', componentId, input: 'transcript', value: '$ app init\nCreated project\nDone' });
  await tools.call('history_undo');
  scene = (await tools.call('project_get',{detail:'full'})).scenes[0];
  assert.equal(scene.components[0].inputs.transcript, transcript);
  await assert.rejects(tools.call('component_set_input', { id: 'terminal', componentId, input: 'transcript', value: '$ ' + 'x'.repeat(990) }), error => error.issues?.some(issue => /hold|short|lengthen/.test(issue)));
  assert.equal((await tools.call('project_get',{detail:'full'})).scenes[0].components[0].inputs.transcript, transcript);
});

test('invalid terminal input produces validation errors instead of throwing from timing', async () => {
  const template = (await listTemplates()).find(item => item.id === 'terminal-dark');
  const scene = instantiateTemplate(template, { id: 'terminal' });
  for (const inputs of [{ transcript: 42 }, { secondTranscript: 42 }, { typingSpeed: 0 }]) {
    const bad = structuredClone(scene); Object.assign(bad.components[0].inputs, inputs);
    const result = validateProject({ output: { width: 640, height: 360, fps: 24, audio: false }, assets: {}, scenes: [bad] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(error => /Component input/.test(error)));
  }
});
