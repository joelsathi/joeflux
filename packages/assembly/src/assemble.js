import { mediaTool } from '../../core/src/runtime.js';
import { mkdir, rename, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { buildAssemblyPlan, validateProject } from '../../core/src/index.js';
import { loadProject } from '../../core/src/io.js';
import { probeSilentVideo } from './media.js';
import { isRenderCurrent } from '../../renderer/src/index.js';
import { sceneFingerprint } from '../../renderer/src/fingerprint.js';
import { buildFilterGraph } from './index.js';

export async function assembleProject(projectRoot, { signal } = {}) {
  const project = await loadProject(projectRoot);
  const validation = validateProject(project);
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  const plan = buildAssemblyPlan(project);
  const clipPaths = project.scenes.map((scene) => path.join(project.root, 'exports', 'clips', `${scene.id}.mp4`));
  // A clip whose cache no longer matches its shot would ship an old version silently.
  for (const [index, scene] of project.scenes.entries()) {
    const current = await isRenderCurrent({ cachePath: path.join(project.root, '.runtime', 'renders', `${scene.id}.json`), outputPath: clipPaths[index], fingerprint: await sceneFingerprint(project, scene) });
    if (!current) throw new Error(`Shot "${scene.id}" changed since it was rendered, or was never rendered. Render it before assembling.`);
  }
  const outputRoot = path.join(project.root, 'exports');
  const outputPath = path.join(outputRoot, 'final.mp4');
  const temporary = path.join(outputRoot, `final.${randomUUID()}.rendering.mp4`);
  await mkdir(outputRoot, { recursive: true });
  try {
    await composeClips({ fps: project.output.fps, clips: project.scenes, inputs: clipPaths, outputPath: temporary, signal });
    const media = await probeSilentVideo(temporary);
    if (media.frames !== plan.totalFrames) throw new Error(`Final output frame count ${media.frames} did not match plan ${plan.totalFrames}.`);
    await rename(temporary, outputPath);
    return { outputPath, ...media, totalFrames: plan.totalFrames };
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

// The one encode path for joined clips: final assembly and transition previews.
export async function composeClips({ fps, clips, inputs, outputPath, signal }) {
  signal?.throwIfAborted();
  const graph = buildFilterGraph({ fps, clips });
  const args = ['-v', 'error', '-y', ...inputs.flatMap((input) => ['-i', input]), ...graph.args, '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(fps), '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', outputPath];
  await mkdir(path.dirname(outputPath), { recursive: true });
  try { await run(mediaTool('ffmpeg'), args, signal); } catch (error) { await rm(outputPath, { force: true }); throw error; }
}

export async function createContactSheet(projectRoot) {
  const outputPath = path.join(projectRoot, 'exports', 'final.mp4');
  const sheetPath = path.join(projectRoot, 'exports', 'review', 'contact-sheet.jpg');
  const media=await probeSilentVideo(outputPath);
  const [numerator,denominator]=media.fps.split('/').map(Number);
  const samples=Math.max(1,Math.min(12,Math.floor(media.frames*denominator/numerator/3)));
  const columns=Math.min(4,samples),rows=Math.ceil(samples/columns);
  await mkdir(path.dirname(sheetPath), { recursive: true });
  await run(mediaTool('ffmpeg'), ['-v', 'error', '-y', '-i', outputPath, '-an', '-vf', `fps=1/3,scale=480:-1,tile=${columns}x${rows}:padding=8:margin=16`, '-frames:v', '1', sheetPath]);
  return { outputPath: sheetPath, media };
}

function run(command, args, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    const abort = () => child.kill('SIGTERM');
    signal?.addEventListener('abort', abort, { once: true });
    child.once('error', reject);
    child.once('close', (code) => { signal?.removeEventListener('abort', abort); code === 0 ? resolve() : reject(new Error(`${command} failed with exit code ${code}.`)); });
  });
}
