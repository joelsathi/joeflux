import { instantiateComponent, retimeComponent } from '../../composition/src/model.js';
import { applyTemplateControls } from './template-controls.js';
import { pluginCapabilities } from '../../animation-plugins/src/catalog.js';

function setPath(target, pathText, value) {
  const parts = pathText.split('.');
  let cursor = target;
  for (const part of parts.slice(0, -1)) cursor = cursor[part];
  cursor[parts.at(-1)] = value;
}

export function instantiateTemplate(template, { id, slots = {}, duration, intensity = 1, theme, color, controls = {}, style = {}, fps = 24, assets = {}, preview = false } = {}) {
  duration ??= style.pacing === 'energetic' ? 'short' : style.pacing === 'measured' ? 'long' : 'medium';
  if (!(duration in template.controls.durations)) throw new Error(`Unknown duration "${duration}" for template ${template.id}.`);
  if (!Number.isFinite(intensity) || intensity < 0.5 || intensity > 1.5) throw new Error('Intensity must be 0.5–1.5.');
  const filled = {};
  for (const slot of template.slots) {
    const value = slots[slot.id] ?? (slot.type === 'asset' && preview ? Object.keys(assets)[0] : slot.default);
    if (slot.required && !value) throw new Error(`Template ${template.id} needs ${slot.id}.`);
    if (slot.type === 'asset' && value && !assets[value]) throw new Error(`Template ${template.id} asset ${slot.id} is not declared in this project.`);
    if (slot.type === 'text' && (typeof value !== 'string' || value.length > (slot.maxLength ?? 1000))) throw new Error(`Template ${template.id} text slot ${slot.id} must be at most ${slot.maxLength} characters.`);
    filled[slot.id] = value ?? '';
  }
  const substitute = (value) => {
    if (typeof value === 'string') return value.replace(/\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g, (_, slot) => filled[slot] ?? '');
    if (Array.isArray(value)) return value.map(substitute);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, part]) => [key, substitute(part)]));
    return value;
  };
  let scene = { ...substitute(template.scene), id: id ?? `preview-${template.id.replace(/[^a-z0-9-]/g, '-')}`, durationFrames: Math.round(template.controls.durations[duration] * fps), template: template.id };
  const capabilities = scene.plugin ? pluginCapabilities(scene.plugin) : null;
  if (color !== undefined) {
    if (!capabilities?.color && scene.kind !== 'composition') throw new Error(`Template ${template.id} does not expose a color control.`);
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Template color must be a six-digit hex color.');
    if (scene.kind === 'composition') scene.components = scene.components.map(component => ({ ...component, inputs: { ...component.inputs, color } }));
    else scene.pluginOptions = { ...scene.pluginOptions, color };
  }
  if (!scene.plugin && scene.kind !== 'composition') {
    if (theme ?? style.themes?.[0]) scene.theme = theme ?? style.themes[0];
    if (style.look) scene.compositor = { ...scene.compositor, look: style.look };
  }
  const control = template.controls.intensity;
  if (control) {
    const value = +(control.base + (intensity - 1) * control.scale).toFixed(3);
    setPath(scene, control.path, value);
    if (control.mirrorPath) setPath(scene, control.mirrorPath, value);
  }
  scene = applyTemplateControls(scene, template.controls.fields, controls, assets);
  if (scene.kind === 'composition') {
    const factor = fps / (scene.compositionFps ?? 24);
    scene.components = scene.components.map(component => {
      const timing = Object.fromEntries(Object.entries(component.timing).map(([key, frames]) => [key, Math.round(frames * factor)]));
      const prepared = instantiateComponent(component.component, { ...component, timing, fps });
      return retimeComponent(prepared, scene.durationFrames - timing.startFrame, fps);
    });
    scene.compositionFps = fps;
  }
  const origin = template.origin ?? { package: 'harness/core', version: '1.0.0', template: template.id };
  scene.templateInstance = { ...origin, inputs: filled, settings: { duration, intensity, ...(theme ? { theme } : {}), ...(color ? { color } : {}), controls: structuredClone(controls), style: structuredClone(style) }, overrides: {}, definition: structuredClone(template) };
  return scene;
}
