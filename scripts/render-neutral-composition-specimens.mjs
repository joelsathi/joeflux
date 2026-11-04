import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProject } from '../packages/core/src/io.js';
import { validateProject } from '../packages/core/src/index.js';
import { renderScene, renderFrameImage } from '../packages/renderer/src/render.js';
import { probeSilentVideo } from '../packages/assembly/src/media.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const results = [];
for (const format of ['landscape', 'square', 'portrait']) {
  const projectRoot = path.join(root, `projects/neutral-${format}`), project = await loadProject(projectRoot);
  const validation = validateProject(project);
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  const outputRoot = path.join(projectRoot, 'exports/review-drafts'); await mkdir(outputRoot, { recursive: true });
  const width = format === 'portrait' ? 360 : format === 'square' ? 480 : 640;
  const height = Math.round(width * project.output.height / project.output.width);
  for (const scene of project.scenes) {
    console.log(`Rendering ${format}/${scene.id}: ${scene.durationFrames} frames at ${project.output.fps} fps.`);
    const started = performance.now();
    const rendered = await renderScene(project, scene, { preview: { startFrame: 0, frames: scene.durationFrames, width, height } });
    const clip = path.join(outputRoot, `${scene.id}.mp4`); await copyFile(rendered.outputPath, clip);
    const media = await probeSilentVideo(clip);
    if (media.frames !== scene.durationFrames) throw new Error(`Wrong frame count for ${clip}.`);
    const images = [];
    for (const frame of [6, 36, scene.durationFrames - 4]) {
      const outputPath = path.join(outputRoot, `${scene.id}-frame-${frame}.png`);
      await renderFrameImage(projectRoot, { sceneId: scene.id, frame, width, outputPath }); images.push({ frame, file: outputPath });
    }
    results.push({ brief: scene.id, format, sourceOutput: project.output, frames: media.frames, fps: project.output.fps, width: media.width, height: media.height, audioStreams: media.audioStreams ?? 0, outputPath: clip, images, renderAndFrameMilliseconds: Math.round(performance.now() - started), review: { representativeFrames: 'awaiting visual inspection', normalSpeedPlayback: 'unverified', creativeApproval: false } });
    console.log(`Saved ${clip}.`);
  }
}
await writeFile(path.join(root, 'projects/neutral-landscape/exports/review-drafts/specimens.json'), JSON.stringify(results, null, 2) + '\n');
console.log('Six independent silent specimens saved; no film assembly performed.');
