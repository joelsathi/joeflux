// Data contracts only. This module performs no I/O and never imports plugin code.
import { getComponentDefinition } from '../../composition/src/catalog.js';
import { compositionErrors } from '../../composition/src/model.js';
import { ANIMATION_PLUGINS } from '../../animation-plugins/src/catalog.js';

export const PLUGIN_API_VERSION = 1;
export const PLUGIN_MANIFEST_VERSION = 1;
export const PACKAGE_ID = /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/;
const LOCAL_ID = /^[a-z][a-z0-9-]*$/;
const SLOT_ID = /^[a-zA-Z][a-zA-Z0-9]*$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/;
const COLOR = /^#[0-9a-f]{6}$/i;
const ENGINES = new Set(ANIMATION_PLUGINS.map(plugin => plugin.id));
// The data-pack renderer allowlist intentionally excludes custom modules and new kinds.
const PRESETS = new Set(['oxygen-particles', 'text-settle', 'text-template', 'floating-cards', 'feature-list', 'recorded-showcase', 'focus-transition', 'screen-handoff', 'product-reveal', 'problem-to-product', 'chapter-opener', 'side-slide', 'accent-mask']);
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SCENE_KEYS = ['kind', 'compositionVersion', 'compositionFps', 'components', 'plugin', 'pluginOptions', 'preset', 'durationFrames', 'params', 'theme', 'brand', 'background', 'textAnimation', 'cameraMotion', 'camera', 'zoom', 'composition', 'perspective', 'timing', 'playback', 'layers', 'compositor', 'motionBlur', 'connectionStyle', 'assetDependencies'];
const CONTROL_TYPES = ['text', 'number', 'color', 'select', 'boolean', 'asset'];
const fail = message => { throw new Error(message); };
const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const text = (value, label, max = 1000) => { if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${label} must be a nonempty string of at most ${max} characters.`); };

export function cloneData(value) {
  const ancestors = new Set();
  const visit = (item, depth = 0) => {
    if (depth > 32) fail('Plugin data exceeds the nesting limit.');
    if (item === null || typeof item === 'string' || typeof item === 'boolean' || finite(item)) return item;
    if (typeof item !== 'object' || !item) fail('Plugin data must contain only finite JSON values.');
    if (ancestors.has(item)) fail('Plugin data must not contain cycles.');
    if (!Array.isArray(item) && ![Object.prototype, null].includes(Object.getPrototypeOf(item))) fail('Plugin data must contain plain JSON objects.');
    ancestors.add(item);
    let result;
    if (Array.isArray(item)) result = item.map(child => visit(child, depth + 1));
    else {
      result = {};
      for (const [key, child] of Object.entries(item)) {
        if (FORBIDDEN_KEYS.has(key)) fail(`Unsafe prototype property in plugin data: ${key}.`);
        result[key] = visit(child, depth + 1);
      }
    }
    ancestors.delete(item);
    return result;
  };
  return visit(value);
}

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function object(value, label, keys) {
  if (!isRecord(value)) fail(`${label} must be an object.`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${label} has unsupported field ${key}.`);
}

export function validateRelativeJsonPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes(':') || value.includes('\0') || value.startsWith('/') || value.split('/').some(part => !part || part === '.' || part === '..') || !value.endsWith('.json')) fail('Template path must be a relative JSON path without traversal.');
  return value;
}

export function validatePluginManifest(input) {
  const value = cloneData(input);
  object(value, 'Plugin manifest', ['manifestVersion', 'apiVersion', 'id', 'version', 'license', 'label', 'description', 'dependencies', 'entryPoints', 'capabilities', 'contributes']);
  if (value.manifestVersion !== PLUGIN_MANIFEST_VERSION) fail('Unsupported plugin manifestVersion; expected 1.');
  if (value.apiVersion !== PLUGIN_API_VERSION) fail('Unsupported plugin API version; expected apiVersion 1.');
  if (typeof value.id !== 'string' || !PACKAGE_ID.test(value.id)) fail('Plugin id must be namespaced as publisher/package.');
  if (typeof value.version !== 'string' || !SEMVER.test(value.version)) fail('Plugin version must be exact semantic versioning, without a range.');
  if (value.license !== 'MIT') fail('Plugin license must be MIT for data-pack API version 1.');
  if (value.label !== undefined) text(value.label, 'Plugin label', 120);
  if (value.description !== undefined) text(value.description, 'Plugin description', 2000);
  value.dependencies ??= {};
  if (!isRecord(value.dependencies)) fail('Plugin dependencies must be an object of exact versions.');
  for (const [id, version] of Object.entries(value.dependencies)) if (!PACKAGE_ID.test(id) || typeof version !== 'string' || !SEMVER.test(version)) fail(`Plugin dependency ${id} needs a namespaced id and exact version.`);
  value.entryPoints ??= {};
  object(value.entryPoints, 'Plugin entryPoints (data-only execution)', []);
  object(value.capabilities, 'Plugin capabilities', ['execution', 'offline']);
  if (value.capabilities.execution !== 'data' || value.capabilities.offline !== true) fail('Plugin capabilities require data execution and offline: true. Host/code/network execution is unsupported.');
  object(value.contributes, 'Plugin contributions', ['templates']);
  if (!Array.isArray(value.contributes.templates) || value.contributes.templates.length > 100) fail('Plugin contributions.templates must be an array of at most 100 templates.');
  value.contributes.templates = value.contributes.templates.map(item => typeof item === 'string' ? validateRelativeJsonPath(item) : validateTemplateDefinition(item));
  return value;
}

function targetAt(scene, path) {
  if (typeof path !== 'string' || !/^[a-zA-Z][a-zA-Z0-9]*(?:\.(?:[a-zA-Z][a-zA-Z0-9]*|0|[1-9]\d*))*$/.test(path) || path.split('.').some(key => FORBIDDEN_KEYS.has(key))) fail(`Unsafe control path ${path}.`);
  let target = scene;
  for (const key of path.split('.')) {
    if (target == null || !Object.hasOwn(target, key)) fail(`Control path ${path} must target an existing scene field.`);
    target = target[key];
  }
  return target;
}

function fieldContract(scene, path) {
  targetAt(scene, path);
  if (scene.kind === 'composition') {
    if (path === 'background.color') return { type: 'color' };
    const match = /^components\.(\d+)\.inputs\.([a-zA-Z][a-zA-Z0-9]*)$/.exec(path);
    const instance = match && scene.components[Number(match[1])], definition = instance && getComponentDefinition(instance.component, instance.version);
    const field = definition && [...definition.slots, ...definition.controls].find(field => field.id === match[2]);
    if (!field) fail(`Unsupported component control path ${path}.`);
    return { ...field, options: field.options?.map(option => option.value) };
  }
  if (scene.plugin) {
    if (path === 'params.title') return { type: 'text', maxLength: 64 };
    if (path === 'params.subtitle') return { type: 'text', maxLength: 100 };
    if (path === 'pluginOptions.color') return { type: 'color' };
    if (path === 'pluginOptions.quality' && ['threejs', 'react-three'].includes(scene.plugin)) return { type: 'number', min: 1, max: 2, integer: true, options: [1, 2] };
    fail(`Control path ${path} is not supported by plugin ${scene.plugin}.`);
  }
  if (/^params\.(title|subtitle|eyebrow)$/.test(path)) return { type: 'text', maxLength: 1000 };
  if (/^params\.(asset|outgoingAsset|incomingAsset)$/.test(path)) return { type: 'asset' };
  const numbers = {
    'background.intensity': [0, 1], 'background.speed': [.1, 2],
    'cameraMotion.strength': [.1, 1.5], 'cameraMotion.scale': [1, 4],
    'cameraMotion.focusX': [0, 1], 'cameraMotion.focusY': [0, 1], 'cameraMotion.endFocusX': [0, 1], 'cameraMotion.endFocusY': [0, 1],
    'cameraMotion.rotateX': [-35, 35], 'cameraMotion.rotateY': [-35, 35], 'cameraMotion.rotateZ': [-35, 35], 'cameraMotion.stageScale': [.7, 1.6],
    'compositor.depthOfField': [0, 1], 'compositor.light': [0, 1],
  };
  if (numbers[path]) return { type: 'number', min: numbers[path][0], max: numbers[path][1] };
  if (path === 'compositor.look') return { type: 'select', options: ['neutral', 'cinematic'] };
  if (path === 'motionBlur.enabled') return { type: 'boolean' };
  fail(`Unsupported template control path ${path}.`);
}

function checkControlValue(value, field, contract, label) {
  if (field.type === 'text' && (typeof value !== 'string' || value.length > field.maxLength)) fail(`${label} exceeds the control text length.`);
  if (field.type === 'asset' && (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value))) fail(`${label} must name a declared project asset.`);
  if (field.type === 'color' && (typeof value !== 'string' || !COLOR.test(value))) fail(`${label} must be a six-digit hex color.`);
  if (field.type === 'boolean' && typeof value !== 'boolean') fail(`${label} must be boolean.`);
  if (field.type === 'number' && (!finite(value) || value < field.min || value > field.max || (contract.integer && !Number.isInteger(value)))) fail(`${label} is outside the control range.`);
  if (field.type === 'number' && field.step) {
    const units = (value - field.min) / field.step;
    if (Math.abs(units - Math.round(units)) > 1e-7) fail(`${label} must align with the control step.`);
  }
  if (field.type === 'select' && !field.options.some(option => option.value === value)) fail(`${label} must match a control option.`);
}

function validateControl(input, scene) {
  object(input, 'Template control', ['id', 'label', 'type', 'path', 'default', 'min', 'max', 'step', 'maxLength', 'options', 'multiline']);
  if (!LOCAL_ID.test(input.id ?? '')) fail('Template control id must use lowercase letters, numbers and hyphens.');
  text(input.label, 'Template control label', 120);
  if (!CONTROL_TYPES.includes(input.type)) fail('Unsupported template control type.');
  if (input.multiline !== undefined) {
    if (input.type !== 'text') fail(`Control ${input.id} multiline requires type text.`);
    if (typeof input.multiline !== 'boolean') fail(`Control ${input.id} multiline must be boolean.`);
  }
  const contract = fieldContract(scene, input.path);
  if (input.type !== contract.type && !(input.type === 'select' && contract.options)) fail(`Control ${input.id} type does not match field ${input.path}.`);
  if (input.type === 'number') {
    if (!finite(input.min) || !finite(input.max) || input.min > input.max || input.min < contract.min || input.max > contract.max) fail(`Control ${input.id} range must stay within the supported field range.`);
    if (input.step !== undefined && (!finite(input.step) || input.step <= 0 || (contract.integer && !Number.isInteger(input.step)))) fail(`Control ${input.id} step must be positive and respect the field type.`);
  } else if (['min', 'max', 'step'].some(key => input[key] !== undefined)) fail(`Control ${input.id} numeric bounds require type number.`);
  if (input.type === 'text') {
    if (!Number.isInteger(input.maxLength) || input.maxLength < 1 || input.maxLength > contract.maxLength) fail(`Control ${input.id} maxLength exceeds the supported field length.`);
  } else if (input.maxLength !== undefined) fail(`Control ${input.id} maxLength requires type text.`);
  if (input.type === 'select') {
    if (!Array.isArray(input.options) || !input.options.length || input.options.length > 30) fail(`Control ${input.id} needs a bounded options list.`);
    const seen = new Set();
    for (const option of input.options) {
      object(option, 'Control option', ['value', 'label']); text(option.label, 'Control option label', 120);
      if (!contract.options.includes(option.value) || seen.has(option.value)) fail(`Control ${input.id} has an unsupported or duplicate option.`);
      seen.add(option.value);
    }
  } else if (input.options !== undefined) fail(`Control ${input.id} options require type select.`);
  if (input.default !== undefined) checkControlValue(input.default, input, contract, `Control ${input.id} default`);
  const current = targetAt(scene, input.path);
  if (!(typeof current === 'string' && /{{[a-zA-Z][a-zA-Z0-9]*}}/.test(current))) checkControlValue(current, input, contract, `Control ${input.id} initial value`);
}

export function validateTemplateDefinition(input) {
  const value = cloneData(input);
  object(value, 'Template', ['id', 'label', 'category', 'description', 'scene', 'slots', 'controls']);
  if (typeof value.id !== 'string' || !LOCAL_ID.test(value.id)) fail('Template id must be a local lowercase id, without a namespace.');
  text(value.label, 'Template label', 120); text(value.category, 'Template category', 120);
  if (value.description !== undefined) text(value.description, 'Template description', 2000);
  object(value.scene, 'Template scene', SCENE_KEYS);
  const scene = value.scene;
  if ((scene.plugin ? 1 : 0) + (scene.preset ? 1 : 0) + (scene.kind === 'composition' ? 1 : 0) !== 1) fail('Template scene must select exactly one trusted plugin or preset renderer.');
  if (scene.plugin && !ENGINES.has(scene.plugin)) fail(`Unknown template plugin ${scene.plugin}.`);
  if (scene.preset && !PRESETS.has(scene.preset)) fail(`Unknown template preset ${scene.preset}.`);
  if (scene.durationFrames !== undefined && (!Number.isInteger(scene.durationFrames) || scene.durationFrames < 2)) fail('Template scene durationFrames must be an integer of at least 2.');
  if (scene.plugin) {
    for (const key of Object.keys(scene)) if (!['plugin', 'pluginOptions', 'durationFrames', 'params', 'motionBlur'].includes(key)) fail(`Template scene field ${key} is unsupported by this plugin renderer.`);
    if (scene.params !== undefined) object(scene.params, 'Plugin scene params', ['title', 'subtitle']);
    for (const [key, max] of [['title', 64], ['subtitle', 100]]) {
      const copy = scene.params?.[key];
      if (copy !== undefined && (typeof copy !== 'string' || copy.length > max)) fail(`Plugin ${key} copy must be a string of at most ${max} characters.`);
    }
    if (scene.pluginOptions !== undefined) {
      object(scene.pluginOptions, 'Plugin scene options', ['color', 'quality']);
      if (scene.pluginOptions.color !== undefined && !COLOR.test(scene.pluginOptions.color)) fail('Plugin color must be a six-digit hex color.');
      if (scene.pluginOptions.quality !== undefined && ![1, 2].includes(scene.pluginOptions.quality)) fail('Plugin quality must be 1 or 2.');
    }
  } else if (scene.pluginOptions !== undefined) fail('Plugin options require a plugin scene.');
  if (!Array.isArray(value.slots) || value.slots.length > 30) fail('Template slots must be an array of at most 30.');
  const slots = new Map();
  for (const slot of value.slots) {
    object(slot, 'Template slot', ['id', 'type', 'label', 'default', 'maxLength', 'required', 'multiline']);
    if (!SLOT_ID.test(slot.id ?? '') || slots.has(slot.id)) fail('Template slot ids must be unique alphanumeric names beginning with a letter.');
    if (!['text', 'asset'].includes(slot.type)) fail(`Unknown slot type for ${slot.id}.`);
    if (slot.multiline !== undefined) {
      if (slot.type !== 'text') fail(`Slot ${slot.id} multiline requires type text.`);
      if (typeof slot.multiline !== 'boolean') fail(`Slot ${slot.id} multiline must be boolean.`);
    }
    if (slot.label !== undefined) text(slot.label, 'Slot label', 120);
    if (slot.required !== undefined && typeof slot.required !== 'boolean') fail(`Slot ${slot.id} required must be boolean.`);
    if (slot.type === 'text') {
      if (!Number.isInteger(slot.maxLength) || slot.maxLength < 1 || slot.maxLength > 1000) fail(`Text slot ${slot.id} needs maxLength from 1 to 1000.`);
      if (slot.default !== undefined && (typeof slot.default !== 'string' || slot.default.length > slot.maxLength)) fail(`Slot ${slot.id} default exceeds its text length.`);
    } else if (slot.default !== undefined && (typeof slot.default !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(slot.default))) fail(`Asset slot ${slot.id} default must name a project asset.`);
    slots.set(slot.id, slot);
  }
  const inspectSlots = (item, location = '') => {
    if (typeof item === 'string') {
      if (/{{|}}/.test(item.replace(/{{[a-zA-Z][a-zA-Z0-9]*}}/g, ''))) fail(`Invalid template slot syntax at ${location}.`);
      for (const [, id] of item.matchAll(/{{([a-zA-Z][a-zA-Z0-9]*)}}/g)) {
        const slot = slots.get(id); if (!slot) fail(`Template scene references undeclared slot ${id}.`);
        if (scene.plugin && /^params\.(title|subtitle)$/.test(location) && (slot.type !== 'text' || slot.maxLength > (location === 'params.title' ? 64 : 100))) fail(`Plugin ${location} slot exceeds its supported text length.`);
      }
    } else if (item && typeof item === 'object') for (const [key, child] of Object.entries(item)) inspectSlots(child, location ? `${location}.${key}` : key);
  };
  inspectSlots(scene);
  if (scene.kind === 'composition') {
    const fps = scene.compositionFps ?? 24;
    const assets = Object.fromEntries((scene.components ?? []).filter(component => component.component === 'harness/proof').map(component => [component.inputs?.asset, 'declared-input.svg']));
    const errors = compositionErrors({ ...scene, id: 'template', durationFrames: scene.durationFrames ?? Math.round((value.controls?.durations?.medium ?? 5) * fps) }, { output: { width: 1920, height: 1080, fps, audio: false }, assets });
    if (errors.length) fail(errors.join(' '));
  }
  object(value.controls, 'Template controls', ['durations', 'intensity', 'fields']);
  object(value.controls.durations, 'Template duration controls', ['short', 'medium', 'long']);
  for (const key of ['short', 'medium', 'long']) if (!finite(value.controls.durations[key]) || value.controls.durations[key] <= 0 || value.controls.durations[key] > 600) fail(`Template duration ${key} must be positive and at most 600 seconds.`);
  const fields = value.controls.fields ?? [];
  if (!Array.isArray(fields) || fields.length > 30) fail('Template control fields must be an array of at most 30.');
  const fieldIds = new Set(), paths = new Set();
  for (const field of fields) {
    validateControl(field, scene);
    if (fieldIds.has(field.id) || paths.has(field.path)) fail(`Duplicate template control id or path ${field.path}.`);
    fieldIds.add(field.id); paths.add(field.path);
  }
  if (value.controls.intensity !== undefined) {
    const control = value.controls.intensity;
    object(control, 'Template intensity control', ['path', 'base', 'scale', 'mirrorPath']);
    if (!finite(control.base) || !finite(control.scale)) fail('Template intensity base and scale must be finite.');
    for (const path of [control.path, control.mirrorPath].filter(item => item !== undefined)) {
      const contract = fieldContract(scene, path);
      if (contract.type !== 'number' || contract.integer || control.base - Math.abs(control.scale) * .5 < contract.min || control.base + Math.abs(control.scale) * .5 > contract.max) fail(`Template intensity path ${path} is incompatible with its supported range.`);
    }
    if (control.path === undefined) fail('Template intensity needs a supported path.');
  }
  return value;
}
