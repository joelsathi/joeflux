const object = value => value && typeof value === 'object' && !Array.isArray(value);
const safeParts = path => {
  const parts = String(path).split('.');
  if (!parts.length || parts.some(part => !/^(?:[a-zA-Z][a-zA-Z0-9]*|0|[1-9][0-9]*)$/.test(part) || ['__proto__', 'prototype', 'constructor'].includes(part))) throw new Error('Unsafe template control path.');
  return parts;
};
export function controlValue(scene, field) {
  return safeParts(field.path).reduce((value, part) => value?.[part], scene) ?? field.default;
}
export function setControlPath(scene, path, value) {
  const parts = safeParts(path);
  let cursor = scene;
  for (const [index, key] of parts.slice(0, -1).entries()) { if (!object(cursor[key]) && !Array.isArray(cursor[key])) cursor[key] = /^\d+$/.test(parts[index + 1]) ? [] : {}; cursor = cursor[key]; }
  cursor[parts.at(-1)] = value;
}
export function validateControlValue(field, value, assets = {}) {
  const fail = () => { throw new Error(`Invalid value for template control ${field.label ?? field.id}.`); };
  if (value === undefined) return fail();
  switch (field.type) {
    case 'color': if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) fail(); break;
    case 'number': {
      if (!Number.isFinite(value) || value < (field.min ?? -Infinity) || value > (field.max ?? Infinity)) fail();
      if (field.step) { const units = (value - (field.min ?? 0)) / field.step; if (Math.abs(units - Math.round(units)) > 1e-7) fail(); }
      break;
    }
    case 'boolean': if (typeof value !== 'boolean') fail(); break;
    case 'select': if (!field.options?.some(option => option.value === value)) fail(); break;
    case 'text': if (typeof value !== 'string' || value.length > (field.maxLength ?? 1000)) fail(); break;
    case 'asset': if (typeof value !== 'string' || !assets[value]) fail(); break;
    default: fail();
  }
  return value;
}
export function applyTemplateControls(scene, fields = [], values = {}, assets = {}) {
  const result = structuredClone(scene);
  for (const key of Object.keys(values)) if (!fields.some(field => field.id === key)) throw new Error(`Unknown template control ${key}.`);
  for (const field of fields) {
    const value = values[field.id] ?? controlValue(scene, field);
    if (value !== undefined) setControlPath(result, field.path, validateControlValue(field, value, assets));
  }
  return result;
}

// Inputs remain the source binding. Manual scene edits are separate, inspectable overrides.
export function captureTemplateOverrides(before, after) {
  if (!before.templateInstance || !after.templateInstance) return after;
  const overrides = { ...before.templateInstance.overrides };
  const walk = (a, b, prefix = '') => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (object(b)) for (const key of new Set([...Object.keys(a ?? {}), ...Object.keys(b)])) walk(a?.[key], b[key], prefix ? `${prefix}.${key}` : key);
    else overrides[prefix] = b === undefined ? null : structuredClone(b);
  };
  const data = scene => Object.fromEntries(Object.entries(scene).filter(([key]) => !['id', 'file', 'fingerprint', '_change', 'template', 'templateInstance'].includes(key)));
  walk(data(before), data(after));
  return { ...after, templateInstance: { ...after.templateInstance, overrides } };
}
