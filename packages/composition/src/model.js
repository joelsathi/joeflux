import { COMPONENT_ANCHORS, getComponentDefinition, compositionFormat } from './catalog.js';
import { terminalMinimumHoldSeconds } from './terminal.js';
const definitionFor = value => typeof value === 'string' ? getComponentDefinition(value) : value;
export function componentInputErrors(definition, inputs = {}, project) {
  const errors = [], fields = [...definition.slots, ...definition.controls], known = new Set(fields.map(f => f.id));
  for (const key of Object.keys(inputs)) if (!known.has(key)) errors.push(`Unknown component input "${key}".`);
  for (const field of fields) {
    const value = inputs[field.id];
    if (field.required && (typeof value !== 'string' || !value.trim())) { errors.push(`Component input ${field.id} requires nonempty ${field.type}.`); continue; }
    if (value === undefined) continue;
    if (field.type === 'text' && (typeof value !== 'string' || value.length > field.maxLength)) errors.push(`Component input ${field.id} must be text of at most ${field.maxLength} characters.`);
    if (field.type === 'asset' && (typeof value !== 'string' || (project && !project.assets?.[value]))) errors.push(`Component input ${field.id} has missing declared asset "${value}".`);
    if (field.type === 'color' && !/^#[0-9a-f]{6}$/i.test(value)) errors.push(`Component input ${field.id} needs a six-digit hex color.`);
    if (field.type === 'number' && (!Number.isFinite(value) || value < field.min || value > field.max)) errors.push(`Component input ${field.id} must be ${field.min}–${field.max}.`);
    if (field.type === 'select' && !field.options.some(option => option.value === value)) errors.push(`Component input ${field.id} needs a supported choice.`);
    if (field.type === 'boolean' && typeof value !== 'boolean') errors.push(`Component input ${field.id} must be boolean.`);
  }
  return errors;
}
export function minimumComponentHold(instance, fps = 30) {
  const definition = getComponentDefinition(instance.component, instance.version);
  if (!definition) throw new Error(`Unknown component ${instance.component}@${instance.version}.`);
  if (instance.component === 'harness/terminal') {
    const defaults = Object.fromEntries([...definition.slots, ...definition.controls].filter(field => field.default !== undefined).map(field => [field.id, field.default]));
    return Math.ceil(terminalMinimumHoldSeconds({ ...defaults, ...instance.inputs }) * fps);
  }
  const copy = definition.slots.filter(slot => slot.type === 'text').map(slot => instance.inputs?.[slot.id] ?? '').join(' ').trim();
  return Math.ceil(Math.max(definition.minimumHoldSeconds, copy ? copy.split(/\s+/).length / 3 : 0) * fps);
}
export function instantiateComponent(definitionOrId, { id, inputs = {}, durationFrames, fps = 30, layout, timing, seed = 1, locks = {} } = {}) {
  const definition = definitionFor(definitionOrId);
  if (!definition || !getComponentDefinition(definition.id, definition.version)) throw new Error(`Unknown component ${typeof definitionOrId === 'string' ? definitionOrId : definitionOrId?.id}.`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id ?? '')) throw new Error('Component id must use lowercase letters, numbers and hyphens.');
  if (!Number.isFinite(fps) || fps <= 0) throw new Error('Component fps must be positive.');
  const filled = Object.fromEntries([...definition.slots, ...definition.controls].filter(field => field.default !== undefined).map(field => [field.id, field.default]));
  Object.assign(filled, structuredClone(inputs));
  const errors = componentInputErrors(definition, filled); if (errors.length) throw new Error(errors.join(' '));
  const instance = { id, component: definition.id, version: definition.version, inputs: filled, layout: structuredClone(layout ?? { anchor: definition.defaultAnchor }), timing: structuredClone(timing ?? { startFrame: 0, entranceFrames: Math.round(fps * .5), holdFrames: 0, exitFrames: Math.round(fps * .35) }), locks: structuredClone(locks), seed };
  if (!timing) return retimeComponent(instance, durationFrames ?? Math.round(fps * 5), fps, { ignoreLocks: true });
  return instance;
}
export function retimeComponent(instance, totalFrames, fps = 30, { ignoreLocks = false } = {}) {
  if ((instance.locks?.timing || instance.locks?.motion || instance.locks?.beat) && !ignoreLocks) throw new Error(`Component ${instance.id} timing is locked.`);
  if (!Number.isInteger(totalFrames) || totalFrames < 1 || !Number.isFinite(fps) || fps <= 0) throw new Error('Component retiming needs positive whole frames and fps.');
  const minimum = minimumComponentHold(instance, fps);
  if (totalFrames < minimum + 2) throw new Error(`Component ${instance.id} needs at least ${minimum + 2} frames to protect its reading hold.`);
  const t = instance.timing, available = totalFrames - minimum;
  const desired = Math.max(2, t.entranceFrames + t.exitFrames);
  const motions = Math.min(available, desired);
  const entranceFrames = Math.max(1, Math.min(motions - 1, Math.round(motions * t.entranceFrames / desired)));
  const exitFrames = motions - entranceFrames;
  return { ...structuredClone(instance), timing: { ...t, entranceFrames, holdFrames: totalFrames - entranceFrames - exitFrames, exitFrames } };
}
export function evaluateComponent(instance, frame) {
  if (!Number.isFinite(frame)) throw new Error('Component frame must be finite.');
  const t = instance.timing, localFrame = frame - t.startFrame, total = t.entranceFrames + t.holdFrames + t.exitFrames;
  const visible = localFrame >= 0 && localFrame < total;
  const phase = localFrame < 0 ? 'before' : localFrame < t.entranceFrames ? 'entrance' : localFrame < t.entranceFrames + t.holdFrames ? 'hold' : localFrame < total ? 'exit' : 'after';
  const phaseFrame = phase === 'entrance' ? localFrame : phase === 'exit' ? localFrame - t.entranceFrames - t.holdFrames : 0;
  const progress = phase === 'entrance' ? phaseFrame / t.entranceFrames : phase === 'exit' ? phaseFrame / t.exitFrames : phase === 'hold' ? 1 : 0;
  const opacity = !visible ? 0 : phase === 'entrance' ? 1 - (1 - progress) ** 4 : phase === 'exit' ? (1 - progress) ** 3 : 1;
  return { frame, localFrame, phase, phaseFrame, progress, opacity, visible, seed: instance.seed };
}
export function replacementErrors(instance, definitionOrId) {
  const next = definitionFor(definitionOrId), previous = getComponentDefinition(instance.component, instance.version);
  if (!next || !previous) return ['Unknown component replacement.'];
  const errors = [];
  if (next.surface.type !== previous.surface.type || !next.surface.alpha) errors.push('Replacement surface is incompatible.');
  if (!next.anchors.includes(instance.layout.anchor)) errors.push('Replacement anchor is incompatible.');
  for (const slot of previous.slots) if (!next.slots.some(candidate => candidate.id === slot.id && candidate.type === slot.type)) errors.push(`Replacement is missing compatible input slot ${slot.id}.`);
  return errors;
}
export function compositionAssetIds(scene) { return (scene.components ?? []).flatMap(instance => { const definition = getComponentDefinition(instance.component, instance.version); return (definition?.slots ?? []).filter(slot => slot.type === 'asset').map(slot => instance.inputs?.[slot.id]).filter(Boolean); }); }
export function compositionErrors(scene, project = {}) {
  if (scene.kind !== 'composition') return [];
  const errors = [], fail = message => errors.push(`Scene "${scene.id}": ${message}`);
  if (scene.compositionVersion !== 1) fail('compositionVersion must be 1.');
  if (scene.plugin || scene.module || scene.preset) fail('composition owns rendering and cannot combine with plugin, module or preset.');
  try { compositionFormat(project.output ?? {}); } catch (error) { fail(error.message); }
  if (!Array.isArray(scene.components) || !scene.components.length || scene.components.length > 32) { fail('components must contain 1–32 ordered instances.'); return errors; }
  const ids = new Set();
  for (const instance of scene.components) {
    if (!instance || typeof instance !== 'object') { fail('component must be an object.'); continue; }
    const prefix = `Component ${instance.id}: `;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(instance.id ?? '') || ids.has(instance.id)) fail(`${prefix}id must be valid and unique.`); ids.add(instance.id);
    if (typeof instance.version !== 'string') { fail(`${prefix}version must be pinned to a known component version.`); continue; }
    const definition = getComponentDefinition(instance.component, instance.version);
    if (!definition) { fail(`${prefix}unknown component ${instance.component}@${instance.version}.`); continue; }
    let validInputs = false;
    if (!instance.inputs || typeof instance.inputs !== 'object' || Array.isArray(instance.inputs)) fail(`${prefix}inputs must be an object.`);
    else {
      const issues = componentInputErrors(definition, instance.inputs, project);
      issues.forEach(error => fail(prefix + error)); validInputs = issues.length === 0;
    }
    if (!COMPONENT_ANCHORS.includes(instance.layout?.anchor) || !definition.anchors.includes(instance.layout?.anchor)) fail(`${prefix}unknown or incompatible anchor.`);
    const bounds = instance.layout?.bounds;
    if (bounds && (!['x', 'y', 'width', 'height'].every(k => Number.isFinite(bounds[k])) || bounds.x < 0 || bounds.y < 0 || bounds.width <= 0 || bounds.height <= 0 || bounds.x + bounds.width > 1 || bounds.y + bounds.height > 1)) fail(`${prefix}bounds must fit the normalized stage.`);
    const t = instance.timing;
    if (!t || !['startFrame', 'entranceFrames', 'holdFrames', 'exitFrames'].every(key => Number.isInteger(t[key]) && t[key] >= (key === 'entranceFrames' || key === 'exitFrames' ? 1 : 0))) fail(`${prefix}timing needs whole nonnegative frames and positive entrance/exit frames.`);
    else {
      if (t.startFrame + t.entranceFrames + t.holdFrames + t.exitFrames > scene.durationFrames) fail(`${prefix}timing must fit inside the scene.`);
      if (validInputs && t.holdFrames < minimumComponentHold(instance, project.output?.fps ?? 30)) fail(`${prefix}reading hold is too short; lengthen the interval or shorten the copy.`);
    }
    if (!Number.isInteger(instance.seed) || instance.seed < 0) fail(`${prefix}seed must be a nonnegative integer.`);
    if (instance.locks && (typeof instance.locks !== 'object' || Array.isArray(instance.locks) || Object.entries(instance.locks).some(([key, value]) => !['copy', 'asset', 'layout', 'motion', 'beat', 'timing'].includes(key) || typeof value !== 'boolean'))) fail(`${prefix}locks must contain boolean copy/asset/layout/motion/beat/timing flags.`);
  }
  return errors;
}
