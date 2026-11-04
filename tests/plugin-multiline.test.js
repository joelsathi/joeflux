import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePluginManifest, validateTemplateDefinition } from '../packages/plugins/src/schema.js';

const template = () => ({
  id: 'terminal-copy', label: 'Terminal copy', category: 'Code',
  scene: { preset: 'text-template', params: { title: '{{code}}', subtitle: 'Output' }, motionBlur: { enabled: true } },
  slots: [{ id: 'code', type: 'text', label: 'Code', maxLength: 1000, default: 'npm install\nnpm start', multiline: true }],
  controls: { durations: { short: 3, medium: 5, long: 8 }, fields: [{ id: 'output', label: 'Output', type: 'text', path: 'params.subtitle', maxLength: 1000, multiline: true }] },
});

test('data-only templates and manifests preserve boolean multiline text metadata', () => {
  for (const multiline of [true, false]) {
    const input = template(); input.slots[0].multiline = multiline; input.controls.fields[0].multiline = multiline;
    const validated = validateTemplateDefinition(input);
    assert.equal(validated.slots[0].multiline, multiline);
    assert.equal(validated.controls.fields[0].multiline, multiline);
    const manifest = validatePluginManifest({ manifestVersion: 1, apiVersion: 1, id: 'example/terminal', version: '1.0.0', license: 'MIT', capabilities: { execution: 'data', offline: true }, contributes: { templates: [input] } });
    assert.equal(manifest.contributes.templates[0].slots[0].multiline, multiline);
  }
});

test('multiline metadata must be boolean on text slots and controls', () => {
  for (const invalid of ['true', 1, null, []]) {
    for (const target of ['slot', 'control']) {
      const input = template();
      (target === 'slot' ? input.slots[0] : input.controls.fields[0]).multiline = invalid;
      assert.throws(() => validateTemplateDefinition(input), /multiline.*boolean/i);
    }
  }
});

test('nontext slots and controls reject multiline metadata even when false', () => {
  for (const multiline of [true, false]) {
    const slotInput = template();
    slotInput.slots = [{ id: 'code', type: 'asset', multiline }];
    assert.throws(() => validateTemplateDefinition(slotInput), /multiline.*text/i);
    const controlInput = template();
    controlInput.controls.fields = [{ id: 'blur', label: 'Blur', type: 'boolean', path: 'motionBlur.enabled', multiline }];
    assert.throws(() => validateTemplateDefinition(controlInput), /multiline.*text/i);
  }
});

test('text metadata remains optional and unknown fields remain rejected', () => {
  const input = template(); delete input.slots[0].multiline; delete input.controls.fields[0].multiline;
  assert.doesNotThrow(() => validateTemplateDefinition(input));
  input.slots[0].rows = 3;
  assert.throws(() => validateTemplateDefinition(input), /unsupported field rows/);
});
