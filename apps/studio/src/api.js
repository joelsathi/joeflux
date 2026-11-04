import { apiFetch, readEvents } from '../../../packages/preview-server/src/browser-session.js';
export { apiFetch, ensureSession, subscribeEvents } from '../../../packages/preview-server/src/browser-session.js';

// signal cancels a render; job names the progress events to follow.
export async function callTool(name, input = {}, { signal, job } = {}) {
  const response = await apiFetch(`/api/tools/${name}`, { body: input, signal, headers: job ? { 'x-joeflux-job': job } : undefined });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error), { issues: result.issues ?? [] });
  return result;
}

// POST that answers with server-sent events (chat and sign-in streams).
export async function* postEvents(url, body, signal) {
  const response = await apiFetch(url, { body: body ?? {}, signal });
  yield* readEvents(response);
}

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
export const mergePatch = (target, patch) => {
  if (!isObject(patch)) return patch;
  const out = isObject(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) value === null ? delete out[key] : out[key] = mergePatch(out[key], value);
  return out;
};

export const seconds = (frames, fps) => `${(frames / fps).toFixed(frames % fps ? 1 : 0)}s`;
export const sceneLabel = (scene) => scene.params?.title || scene.id.replaceAll('-', ' ');
export const sceneKind = (scene) => scene.kind === 'screen' || scene.cameraMotion || ['recorded-showcase', 'focus-transition'].includes(scene.preset) ? 'screen' : scene.preset === 'text-template' || scene.preset === 'text-settle' ? 'text' : 'story';
export const uniqueId = (base, scenes) => { let n = 1; while (scenes.some((scene) => scene.id === `${base}-${n}`)) n += 1; return `${base}-${n}`; };
