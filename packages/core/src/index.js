import { pluginErrors } from '../../animation-plugins/src/catalog.js';
import crypto from 'node:crypto';
import { sceneErrors } from '../../motion/src/validation.js';
import { evaluateCamera, ease, mapSourceFrame } from '../../motion/src/timing.js';
import { THEME_NAMES } from '../../presets/src/themes.js';
import { getBrandKit } from '../../presets/src/brand-kits.js';
import {TRANSITION_TYPES} from '../../presets/src/transitions.js';

export const PRESET_NAMES = [
  'oxygen-particles',
  'text-settle',
  'text-template',
  'floating-cards',
  'feature-list',
  'recorded-showcase',
  'focus-transition',
  'screen-handoff',
  'product-reveal',
  'problem-to-product',
  'chapter-opener',
  'side-slide',
  'accent-mask',
];
export {TRANSITION_TYPES};

export { evaluateCamera, ease, mapSourceFrame };

export function createProjectManifest({ name = 'Untitled video' } = {}) {
  return {
    version: 1,
    name,
    output: {
      width: 1920,
      height: 1080,
      fps: 24,
      codec: 'h264',
      colorSpace: 'bt709',
      audio: false,
    },
    assets: {},
    scenes: [],
  };
}

export function validateProject(project) {
  const errors = [];
  if (!project || typeof project !== 'object') return { valid: false, errors: ['Project must be an object.'] };
  const { output = {}, scenes } = project;
  if (!Number.isInteger(output.width) || output.width < 1) errors.push('output.width must be a positive integer.');
  if (!Number.isInteger(output.height) || output.height < 1) errors.push('output.height must be a positive integer.');
  if (!Number.isInteger(output.fps) || output.fps < 1) errors.push('output.fps must be a positive integer.');
  if (output.audio !== false) errors.push('Audio is not supported: output.audio must be false.');
  if (project.theme && !THEME_NAMES.includes(project.theme)) errors.push(`Unknown project theme "${project.theme}".`);
  if (project.brand && project.brand !== 'none' && !getBrandKit(project.brand)) errors.push(`Unknown brand kit "${project.brand}". Run pnpm run brand -- sync after adding a kit.`);
  if (!Array.isArray(scenes)) errors.push('scenes must be an array.');
  const ids = new Set();
  for (const scene of scenes ?? []) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(scene.id ?? '')) errors.push(`Scene id "${scene.id}" must use lowercase letters, numbers, and hyphens.`);
    if (ids.has(scene.id)) errors.push(`Scene id "${scene.id}" is duplicated.`);
    ids.add(scene.id);
    if (!PRESET_NAMES.includes(scene.preset) && !scene.module && !scene.plugin && !['screen','composition'].includes(scene.kind)) errors.push(`Scene "${scene.id}" needs a known preset or module.`);
    if (!Number.isInteger(scene.durationFrames) || scene.durationFrames < 1) errors.push(`Scene "${scene.id}" durationFrames must be a positive integer.`);
    if (scene.theme && !THEME_NAMES.includes(scene.theme)) errors.push(`Scene "${scene.id}" uses an unknown theme.`);
    for (const segment of scene.playback?.segments ?? []) {
      if (!Number.isFinite(segment.rate ?? 1) || (segment.rate ?? 1) <= 0 || (segment.endRate !== undefined && (!Number.isFinite(segment.endRate) || segment.endRate <= 0))) errors.push(`Scene "${scene.id}" has an invalid playback rate.`);
      if (segment.outputEnd !== undefined && segment.outputEnd <= segment.outputStart) errors.push(`Scene "${scene.id}" has an invalid playback segment range.`);
    }
    errors.push(...sceneErrors(scene,project));
    errors.push(...pluginErrors(scene, project.output).map(error => `Scene "${scene.id}": ${error}`));
    if (scene.transition && (!Number.isInteger(scene.transition.frames) || scene.transition.frames < 1)) {
      errors.push(`Scene "${scene.id}" transition.frames must be a positive integer.`);
    }
  }
  for(let i=0;i<(scenes?.length??0)-1;i++){const transition=scenes[i].transition;if(transition?.type&&transition.type!=='cut'&&transition.frames>=scenes[i+1].durationFrames)errors.push(`Scene ${scenes[i].id}: transition exceeds the next scene.`);}
  return { valid: errors.length === 0, errors };
}


export function buildAssemblyPlan(project) {
  const clips = [];
  let cursor = 0;
  for (const scene of project.scenes ?? []) {
    const previous = clips.at(-1);
    const overlap = previous?.transition?.type&&previous.transition.type!=='cut' ? previous.transition.frames : 0;
    const startFrame = cursor - overlap;
    clips.push({ id: scene.id, startFrame, durationFrames: scene.durationFrames, transition: scene.transition ?? null });
    cursor = startFrame + scene.durationFrames;
  }
  return {
    totalFrames: cursor,
    clips,
    ffmpegArgs: ['-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(project.output?.fps ?? 24)],
  };
}

export function fingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
