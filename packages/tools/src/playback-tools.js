import { z } from 'zod';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { loadProject } from '../../core/src/io.js';
import { isVideoAsset } from '../../renderer/src/source-frames.js';
import { probeSource } from '../../renderer/src/decoder.js';
import { editScene } from './scene-edits.js';
import { defineTool, ToolError } from './runner.js';
import { compileSourceMoments, sourceMomentErrors } from '../../motion/src/source-moments.js';
import { renderFilmPreview, filmPreviewState } from '../../renderer/src/film-preview.js';

const sceneId = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const seconds = z.number().min(0);
const moment = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('play'), startSeconds: seconds, endSeconds: seconds, rate: z.number().positive().optional() }),
  z.strictObject({ type: z.literal('hold'), sourceSeconds: seconds, frames: z.int().positive() }),
]);

export function sourceMomentsForScene(scene, fps) {
  const p = scene.playback ?? {};
  if (p.moments) return structuredClone(p.moments);
  if (p.segments?.length || p.holds?.length) throw new ToolError('This shot has legacy speed segments or holds. Use source_set_moments to explicitly replace that source timing; its camera choices will be preserved.');
  const sourceFps = p.sourceFps ?? fps;
  const startSeconds = p.startSeconds ?? (p.startFrame ?? 0) / sourceFps;
  const endSeconds = p.endSeconds ?? (p.endFrame === undefined ? startSeconds + scene.durationFrames / fps : p.endFrame / sourceFps);
  return [{ type: 'play', startSeconds, endSeconds }];
}

// Keep authored tracks intact. Transaction validation rejects insufficient
// reading holds, transition room and composition phases after a source edit.
export function applySourceMoments(scene, moments, fps) {
  let compiled;
  try { compiled = compileSourceMoments(moments, fps); } catch (error) { throw new ToolError(error.message); }
  if (compiled.totalFrames < 2) throw new ToolError('Source timing must leave at least two scene frames.');
  if (scene.camera?.keyframes?.some(key => key.frame >= compiled.totalFrames)) throw new ToolError('Source timing would shorten this shot past an authored camera keyframe. Retime the camera first.');
  if (scene.zoom && scene.zoom.endFrame >= compiled.totalFrames) throw new ToolError('Source timing would shorten this shot past its authored zoom. Retime the zoom first.');
  if (scene.components?.length && compiled.totalFrames !== scene.durationFrames) throw new ToolError('Retime the composition with protected holds before changing its source duration.');
  const playback = { ...(scene.playback?.sourceFps === undefined ? {} : { sourceFps: scene.playback.sourceFps }), moments: structuredClone(moments) };
  return { ...scene, playback, durationFrames: compiled.totalFrames };
}

export async function sourceTimeline(project, scene, signal) {
  const asset = project.assets?.[scene.screen?.asset ?? scene.params?.asset];
  if (!asset || !isVideoAsset(asset)) throw new ToolError('Source moment controls need a declared recording video.');
  const root = await realpath(project.root), file = await realpath(path.resolve(root, asset));
  if (!file.startsWith(`${root}${path.sep}`)) throw new ToolError('Source asset escapes the project.');
  let probed;
  try { probed = await probeSource(file, signal); } catch (error) { throw error.message.startsWith('Invalid video timestamps') ? new ToolError('Recording has no valid source frame timestamps.') : error; }
  const { timestamps, lastFrameSeconds, streamSeconds } = probed, sourceFps = probed.sourceFps || project.output.fps;
  const durationSeconds = Math.max(timestamps.at(-1) + (lastFrameSeconds || 1 / sourceFps), streamSeconds || 0);
  return { timestamps, durationSeconds, sourceFps };
}
async function editSource(tx, id, change) {
  const project = await tx.project(), scene = project.scenes.find(scene => scene.id === id);
  if (!scene) throw new ToolError(`No scene "${id}".`);
  const info = await sourceTimeline(project, scene);
  return editScene(tx, id, saved => {
    const next = change(saved, project.output.fps);
    const errors = sourceMomentErrors(next.playback, { fps: project.output.fps, durationFrames: next.durationFrames, sourceDurationSeconds: info.durationSeconds });
    if (errors.length) throw new ToolError(errors.join(' '));
    next.playback.sourceFps ??= info.sourceFps;
    return next;
  });
}
function sliceMoments(moments, startSeconds, endSeconds) {
  const result = [];
  for (const item of moments) {
    if (item.type === 'hold') { if (item.sourceSeconds >= startSeconds && item.sourceSeconds <= endSeconds) result.push(item); }
    else {
      const a = Math.max(startSeconds, item.startSeconds), b = Math.min(endSeconds, item.endSeconds);
      if (b > a) result.push({ ...item, startSeconds: a, endSeconds: b });
    }
  }
  return result;
}

// Derived edits drop play pieces that round to no output frame instead of rejecting the edit.
const withoutSlivers = (moments, fps) => moments.filter(item => item.type === 'hold' || Math.round((item.endSeconds - item.startSeconds) * fps / (item.rate ?? 1)) >= 1);

function trimMoments(moments, startSeconds, endSeconds) {
  const first = moments[0].startSeconds ?? moments[0].sourceSeconds;
  const last = moments.at(-1).endSeconds ?? moments.at(-1).sourceSeconds;
  const trimmed = sliceMoments(moments, startSeconds, endSeconds);
  if (startSeconds < first) trimmed.unshift({ type: 'play', startSeconds, endSeconds: Math.min(endSeconds, first) });
  if (endSeconds > last) trimmed.push({ type: 'play', startSeconds: Math.max(startSeconds, last), endSeconds });
  return trimmed;
}

export const PLAYBACK_TOOLS = [
  defineTool({ name: 'source_timeline', description: 'Inspect recording source frame timestamps for frame-accurate selection and stepping, including variable frame rate video.', input: z.object({ id: sceneId }),
    run: async ({ root, signal }, { id }) => { const project = await loadProject(root), scene = project.scenes.find(scene => scene.id === id); if (!scene) throw new ToolError(`No scene "${id}".`); return sourceTimeline(project, scene, signal); } }),
  defineTool({ name: 'film_preview', description: 'Render a continuous low-resolution silent review film using actual assembly transitions. Writes temporary preview media only; returns exact shot offsets and a dependency fingerprint. Technical preview is not creative approval.',
    input: z.object({ width: z.int().min(160).max(1280).optional() }),
    run: ({ root, signal, emit }, input) => renderFilmPreview(root, { ...input, signal, onProgress: detail => emit({ type: 'progress', ...detail }) }) }),
  defineTool({ name: 'film_preview_status', description: 'Check whether a film review fingerprint still matches the saved shots, assets and renderer.',
    input: z.object({ fingerprint: z.string().min(1) }), run: async ({ root }, input) => ({ current: (await filmPreviewState(root)).fingerprint === input.fingerprint }) }),
  defineTool({ name: 'source_set_moments', mutates: true, description: 'Explicitly replace source timing with ordered play ranges and result holds in one undoable change. Keeps camera choices; rejects durations that cannot preserve authored tracks and protected reading holds.',
    input: z.object({ id: sceneId, moments: z.array(moment).min(1).max(100) }), summary: ({ id }) => `Edit source moments in ${id}`,
    run: ({ tx }, { id, moments }) => editSource(tx, id, (scene, fps) => applySourceMoments(scene, moments, fps)) }),
  defineTool({ name: 'source_trim', mutates: true, description: 'Trim source start/end in seconds, retaining source moments within the range. Legacy trims convert without discarding camera choices; advanced legacy speed/hold timing requires explicit replacement.',
    input: z.object({ id: sceneId, startSeconds: seconds, endSeconds: seconds }), summary: ({ id }) => `Trim source in ${id}`,
    run: ({ tx }, { id, startSeconds, endSeconds }) => editSource(tx, id, (scene, fps) => {
      if (endSeconds <= startSeconds) throw new ToolError('Source trim end must follow its start.');
      const p = scene.playback ?? {};
      const existing = sourceMomentsForScene(scene, fps);
      const moments = p.moments ? trimMoments(existing, startSeconds, endSeconds) : [{ type: 'play', startSeconds, endSeconds }];
      return applySourceMoments(scene, withoutSlivers(moments, fps), fps);
    }) }),
  defineTool({ name: 'source_skip_wait', mutates: true, description: 'Skip a waiting range from the source, or shorten it with a positive rate greater than one. Keeps surrounding plays, result holds and camera choices.',
    input: z.object({ id: sceneId, startSeconds: seconds, endSeconds: seconds, rate: z.number().gt(1).optional() }), summary: ({ id, rate }) => `${rate ? 'Shorten' : 'Skip'} source waiting in ${id}`,
    run: ({ tx }, { id, startSeconds, endSeconds, rate }) => editSource(tx, id, (scene, fps) => {
      if (endSeconds <= startSeconds) throw new ToolError('Waiting end must follow its start.');
      const moments = sourceMomentsForScene(scene, fps), next = []; let affected = false;
      for (const item of moments) {
        if (item.type === 'hold' || item.endSeconds <= startSeconds || item.startSeconds >= endSeconds) { next.push(item); continue; }
        affected = true;
        const a = Math.max(item.startSeconds, startSeconds), b = Math.min(item.endSeconds, endSeconds);
        if (item.startSeconds < a) next.push({ ...item, endSeconds: a });
        if (rate) next.push({ ...item, startSeconds: a, endSeconds: b, rate });
        if (item.endSeconds > b) next.push({ ...item, startSeconds: b });
      }
      if (!affected) throw new ToolError('That waiting range does not overlap a source play moment.');
      return applySourceMoments(scene, withoutSlivers(next, fps), fps);
    }) }),
  defineTool({ name: 'source_hold_result', mutates: true, description: 'End at a chosen source result frame and hold it for a whole number of output frames. Removes later source moments in one undoable change and preserves camera choices.',
    input: z.object({ id: sceneId, sourceSeconds: seconds, frames: z.int().positive() }), summary: ({ id }) => `Hold source result in ${id}`,
    run: ({ tx }, { id, sourceSeconds, frames }) => editSource(tx, id, (scene, fps) => {
      const moments = sourceMomentsForScene(scene, fps), first = moments[0].startSeconds ?? moments[0].sourceSeconds, last = moments.at(-1).endSeconds ?? moments.at(-1).sourceSeconds;
      if (sourceSeconds < first || sourceSeconds > last) throw new ToolError('Choose a result frame within the source moment range.');
      const next = sliceMoments(moments, first, sourceSeconds).filter(item => item.type !== 'hold' || item.sourceSeconds !== sourceSeconds);
      next.push({ type: 'hold', sourceSeconds, frames });
      return applySourceMoments(scene, withoutSlivers(next, fps), fps);
    }) }),
];
