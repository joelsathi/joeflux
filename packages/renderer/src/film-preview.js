import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { buildAssemblyPlan, fingerprint, validateProject } from '../../core/src/index.js';
import { loadProject } from '../../core/src/io.js';
import { composeClips } from '../../assembly/src/assemble.js';
import { probeSilentVideo } from '../../assembly/src/media.js';
import { previewSize, renderScene } from './render.js';
import { sceneFingerprint } from './fingerprint.js';

export async function filmPreviewState(root) {
  const texts = new Map();
  const project = await loadProject(root, async file => {
    const text = await readFile(path.join(root, file), 'utf8'); texts.set(file, text); return text;
  });
  const sources = Object.fromEntries(project.scenes.filter(scene => scene.file).map(scene => [scene.id, fingerprint(texts.get(scene.file))]));
  const { brief, reviews, knowledge, guide, ...rendered } = JSON.parse(texts.get('project.json')), manifestFingerprint = fingerprint(rendered);
  const renderFingerprints = await Promise.all(project.scenes.map(scene => sceneFingerprint(project, scene)));
  return { project, sources, manifestFingerprint, fingerprint: fingerprint({ manifestFingerprint, sources, renderFingerprints }) };
}

export async function renderFilmPreview(root, { width = 640, signal, onProgress = () => {} } = {}) {
  if (!Number.isInteger(width) || width < 160 || width > 1280) throw new Error('Film preview width must be a whole number from 160–1280.');
  signal?.throwIfAborted();
  const state = await filmPreviewState(root), { project } = state;
  const validation = validateProject(project);
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  if (!project.scenes.length) throw new Error('Add a shot before playing the film.');
  const size = previewSize(project.output, width);
  const plan = buildAssemblyPlan(project), parts = [], frames = project.scenes.reduce((sum, scene) => sum + scene.durationFrames, 0);
  const name = `film-${randomUUID()}.mp4`, outputPath = path.join(root, '.runtime/previews', name);
  let completed = 0;
  try {
    for (const scene of project.scenes) {
      signal?.throwIfAborted();
      const result = await renderScene(project, scene, { preview: { startFrame: 0, frames: scene.durationFrames, ...size }, signal,
        onProgress: detail => onProgress({ scene: scene.id, frame: completed + detail.frame, frames, phase: 'shots' }) });
      parts.push(result.outputPath); completed += scene.durationFrames;
    }
    signal?.throwIfAborted();
    onProgress({ frame: frames, frames, phase: 'joining' });
    await composeClips({ fps: project.output.fps, clips: plan.clips, inputs: parts, outputPath, signal });
    signal?.throwIfAborted();
    const media = await probeSilentVideo(outputPath);
    if (media.frames !== plan.totalFrames || media.width !== size.width || media.height !== size.height) throw new Error('Film preview media does not match the assembly plan.');
    const current = await filmPreviewState(root);
    signal?.throwIfAborted();
    return { outputPath, url: `/project-assets/.runtime/previews/${name}`, ...size, fps: project.output.fps, frames: plan.totalFrames, totalFrames: plan.totalFrames,
      clips: plan.clips, startOffsets: Object.fromEntries(plan.clips.map(clip => [clip.id, clip.startFrame])), sources: state.sources,
      fingerprint: state.fingerprint, stale: current.fingerprint !== state.fingerprint };
  } catch (error) {
    await rm(outputPath, { force: true });
    if (signal?.aborted) throw new DOMException('Film preview cancelled.', 'AbortError');
    throw error;
  } finally { await Promise.all(parts.map(part => rm(part, { force: true }))); }
}
