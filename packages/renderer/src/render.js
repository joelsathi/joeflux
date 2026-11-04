import { mediaTool } from '../../core/src/runtime.js';
import { existsSync } from 'node:fs';
import { mkdir, rename, rm, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { fingerprint, validateProject } from '../../core/src/index.js';
import { loadProject, writeJson } from '../../core/src/io.js';
import { probeSilentVideo } from '../../assembly/src/media.js';
import { composeClips } from '../../assembly/src/assemble.js';
import { TRANSITIONS } from '../../presets/src/transitions.js';
import { withProjectLock } from '../../core/src/project-lock.js';
import { browserLaunchOptions, buildVideoArgs, isRenderCurrent } from './index.js';
import { createRenderServer } from './server.js';
import { sceneFingerprint } from './fingerprint.js';
export { engineFingerprint, sceneFingerprint } from './fingerprint.js';

export async function renderProject(projectRoot, { onlyScene, force = false, signal, onProgress = () => {} } = {}) {
  const project = await loadProject(projectRoot);
  const validation = validateProject(project);
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  const scenes = project.scenes.filter((scene) => !onlyScene || scene.id === onlyScene);
  if (onlyScene && !scenes.length) throw new Error(`No scene named "${onlyScene}".`);
  const results = [];
  for (let index = 0; index < scenes.length; index += 1) {
    results.push(await renderScene(project, scenes[index], { force, signal, onProgress: (detail) => onProgress({ scene: scenes[index].id, index, total: scenes.length, ...detail }) }));
  }
  return { project: project.name, rendered: results.filter((result) => !result.cached).length, cached: results.filter((result) => result.cached).length, scenes: results };
}

// One saved frame as a PNG, optionally downscaled (e.g. for an agent to inspect).
// region {x, y, width, height} (fractions of the frame) crops before scaling; width is then the crop's output width.
export async function renderFrameImage(projectRoot, { sceneId, sceneOverride, frame, width, region, outputPath }) {
  const project = await loadProject(projectRoot), scene = sceneOverride ?? project.scenes.find((entry) => entry.id === sceneId);
  if (!scene) throw new Error(`No scene named "${sceneId}".`);
  if (!Number.isInteger(frame) || frame < 0 || frame >= scene.durationFrames) throw new Error(`Frame must be 0–${scene.durationFrames - 1}.`);
  const { width: W, height: H } = project.output;
  const clip = region && { x: Math.round(region.x * W), y: Math.round(region.y * H), width: Math.max(1, Math.round(region.width * W)), height: Math.max(1, Math.round(region.height * H)) };
  const scale = Math.min(1, (width ?? clip?.width ?? W) / (clip?.width ?? W)), server = await createRenderServer(project.root, { project });
  let browser;
  try {
    browser = await chromium.launch(browserLaunchOptions());
    const page = await browser.newPage({ viewport: { width: project.output.width, height: project.output.height }, deviceScaleFactor: scale });
    await page.goto(server.origin, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.joeFluxReady === true);
    if(sceneOverride)await page.evaluate(({ scene, currentFrame }) => window.renderPreviewScene({ scene, frame: currentFrame }), { scene: sceneOverride, currentFrame: frame });
    else await page.evaluate(({ sceneId, currentFrame }) => window.renderScene({ sceneId, frame: currentFrame }), { sceneId, currentFrame: frame });
    await mkdir(path.dirname(outputPath), { recursive: true });
    await page.screenshot({ type: 'png', animations: 'disabled', path: outputPath, ...(clip ? { clip } : {}) });
    return { path: outputPath, width: Math.round((clip?.width ?? W) * scale), height: Math.round((clip?.height ?? H) * scale) };
  } finally {
    await browser?.close();
    await server.close();
  }
}

export async function renderPreview(projectRoot, { sceneId, at = .35, seconds = 1, width = 640, signal, onProgress = () => {} } = {}) {
  if (!Number.isFinite(at) || at < 0 || at > 1) throw new Error('at must be 0–1.');
  if (!Number.isFinite(seconds) || seconds < .1 || seconds > 3) throw new Error('seconds must be 0.1–3.');
  if (!Number.isInteger(width) || width < 160 || width > 1280) throw new Error('width must be a whole number from 160–1280.');
  const project = await loadProject(projectRoot), validation = validateProject(project);
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  const scene = project.scenes.find(entry => entry.id === sceneId);
  if (!scene) throw new Error(`No scene named "${sceneId}".`);
  const frames = Math.min(scene.durationFrames, Math.max(2, Math.round(seconds * project.output.fps)));
  const startFrame = Math.min(scene.durationFrames - frames, Math.round(at * (scene.durationFrames - 1)));
  const preview = { startFrame, frames, ...previewSize(project.output, width) };
  const result = await renderScene(project, scene, { preview, signal, onProgress });
  return { ...result, ...preview, fps: project.output.fps, url: `/project-assets/.runtime/previews/${path.basename(result.outputPath)}` };
}
export function previewSize(output, width) {
  const scale = Math.min(1, width / output.width), even = (value) => Math.max(2, Math.floor(value * scale / 2) * 2);
  return { width: even(output.width), height: even(output.height) };
}
const overlapOf = (scene) => TRANSITIONS[scene?.transition?.type] ? scene.transition.frames : 0;

// The boundary between a shot and the next, joined by the same FFmpeg graph as
// assembly. It shows up to a second either side of the overlap, but never frames
// that a neighbouring transition blends, so every frame matches the export.
export async function renderTransitionPreview(projectRoot, { sceneId, width = 640, signal, onProgress = () => {} } = {}) {
  const texts = new Map(), project = await loadProject(projectRoot, async (file) => { const text = await readFile(path.join(projectRoot, file), 'utf8'); texts.set(file, text); return text; });
  const validation = validateProject(project);
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  const index = project.scenes.findIndex(entry => entry.id === sceneId), [previous, outgoing, incoming, after] = [-1, 0, 1, 2].map(offset => index < 0 ? undefined : project.scenes[index + offset]);
  if (!outgoing) throw new Error(`No scene named "${sceneId}".`);
  if (!incoming) throw new Error(`"${sceneId}" is the last shot, so there is no transition to preview.`);
  const { fps } = project.output, overlap = overlapOf(outgoing), transition = overlap ? outgoing.transition : null;
  const tail = Math.max(overlap, Math.min(outgoing.durationFrames - overlapOf(previous), overlap + fps));
  const head = Math.max(overlap, Math.min(incoming.durationFrames - (after ? overlapOf(incoming) : 0), overlap + fps));
  const segments = [[outgoing, outgoing.durationFrames - tail, tail], [incoming, 0, head]], size = previewSize(project.output, width), parts = [];
  // The dialog compares these with the saved files to spot a preview that is out of date.
  const sources = Object.fromEntries([previous, outgoing, incoming].filter(scene => scene?.file).map(scene => [scene.id, fingerprint(texts.get(scene.file))]));
  const name = `transition-${sceneId}-${randomUUID()}.mp4`, outputPath = path.join(project.root, '.runtime', 'previews', name), frames = tail + head - overlap;
  try {
    for (const [index, [scene, startFrame, frames]] of segments.entries()) {
      const onSegment = detail => onProgress({ ...detail, frame: detail.frame + (index ? tail : 0), frames: tail + head });
      parts.push((await renderScene(project, scene, { preview: { startFrame, frames, ...size }, signal, onProgress: onSegment })).outputPath);
    }
    await composeClips({ fps, inputs: parts, clips: [{ durationFrames: tail, transition }, { durationFrames: head }], outputPath, signal });
    const media = await probeSilentVideo(outputPath);
    if (media.frames !== frames) throw new Error(`Transition preview has ${media.frames} frames; expected ${frames}.`);
    return { id: sceneId, next: incoming.id, transition: transition?.type ?? 'cut', overlapFrames: overlap, startFrame: tail - overlap, frames, fps, width: media.width, height: media.height, sources, manifestFingerprint: fingerprint(texts.get('project.json')), outputPath, url: `/project-assets/.runtime/previews/${name}` };
  } catch (error) {
    await rm(outputPath, { force: true });
    throw error;
  } finally { await Promise.all(parts.map(part => rm(part, { force: true }))); }
}

// Final clips render one at a time per scene across processes. Each render reads the
// project inside the lock, so a queued older request renders the current scene (or
// reuses its clip) rather than overwriting a newer clip. Previews have unique outputs.
export function renderScene(project, scene, options = {}) {
  if (options.preview) return renderSnapshot(project, scene, options);
  return withProjectLock(project.root, `render:${scene.id}`, async () => {
    const current = await loadProject(project.root), validation = validateProject(current);
    if (!validation.valid) throw new Error(validation.errors.join('\n'));
    const saved = current.scenes.find(entry => entry.id === scene.id);
    if (!saved) throw new Error(`No scene named "${scene.id}".`);
    return renderSnapshot(current, saved, options);
  }, { signal: options.signal });
}

async function renderSnapshot(project, scene, { force = false, signal, onProgress = () => {}, preview } = {}) {
  const exportsRoot = path.join(project.root, ...(preview ? ['.runtime', 'previews'] : ['exports', 'clips']));
  const cacheRoot = path.join(project.root, '.runtime', 'renders');
  const outputPath = path.join(exportsRoot, `${scene.id}${preview ? '-'+randomUUID() : ''}.mp4`);
  const cachePath = path.join(cacheRoot, `${scene.id}.json`);
  await Promise.all([mkdir(exportsRoot, { recursive: true }), mkdir(cacheRoot, { recursive: true })]);
  const renderFingerprint = preview ? null : await sceneFingerprint(project, scene);
  if (!preview && !force && await isRenderCurrent({ cachePath, outputPath, fingerprint: renderFingerprint })) return { id: scene.id, outputPath, cached: true };
  if (signal?.aborted) throw abortError();
  // Serve the captured project: edits made while rendering cannot mix into these frames.
  const server = await createRenderServer(project.root,{signal,project});
  let browser,encoder,done;
  const temporary = outputPath.replace(/\.mp4$/, `.${randomUUID()}.rendering.mp4`);
  try {
    browser=await chromium.launch(browserLaunchOptions());
    const page = await browser.newPage({ viewport: { width: project.output.width, height: project.output.height }, deviceScaleFactor: 1 });
    await page.goto(server.origin, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.joeFluxReady === true);
    const samples = scene.motionBlur && scene.motionBlur.enabled !== false ? scene.motionBlur.samples ?? 8 : 1, shutter = scene.motionBlur?.shutter ?? .5, last = scene.durationFrames - 1;
    const gpuBlur=samples>1&&scene.motionBlur?.accumulator==='webgl';
    const args = buildVideoArgs({ fps: project.output.fps, outputPath: temporary, blurSamples: gpuBlur?1:samples });
    if (preview) {
      const filter = args.indexOf('-vf'), resize = `scale=${preview.width}:${preview.height}`;
      if (filter >= 0) args[filter + 1] += `,${resize}`;
      else args.splice(args.indexOf('-an'), 0, '-vf', resize);
    }
    encoder = spawn(mediaTool('ffmpeg'), args, { stdio: ['pipe', 'inherit', 'inherit'] });
    done = waitForProcess(encoder, signal);done.catch(()=>{});
    encoder.stdin.on('error',()=>{});
    const start = preview?.startFrame ?? 0, frames = preview?.frames ?? scene.durationFrames;
    for (let frame = start; frame < start + frames; frame += 1) {
      const subframes=[];
      // Motion blur samples an open shutter centred on the frame; the scene evaluates fractional frames.
      for (let sample = 0; sample < samples; sample += 1) {
        if (signal?.aborted) { encoder.kill('SIGTERM'); throw abortError(); }
        const currentFrame = samples > 1 ? Math.min(last, Math.max(0, frame + ((sample + .5) / samples - .5) * shutter)) : frame;
        await page.evaluate(({ sceneId, currentFrame }) => window.renderScene({ sceneId, frame: currentFrame }), { sceneId: scene.id, currentFrame });
        const image = await page.screenshot({ type: 'png', animations: 'disabled' });
        if(gpuBlur)subframes.push(image.toString('base64'));
        else if (!encoder.stdin.write(image)) await onceDrain(encoder.stdin);
      }
      if(gpuBlur){
        const image=Buffer.from(await page.evaluate(frames=>window.accumulateFramesWebgl(frames),subframes),'base64');
        if(!encoder.stdin.write(image))await onceDrain(encoder.stdin);
      }
      onProgress({ frame: frame - start + 1, frames });
    }
    encoder.stdin.end();
    await done;
    const media = await probeSilentVideo(temporary);
    if (media.width !== (preview?.width ?? project.output.width) || media.height !== (preview?.height ?? project.output.height) || media.fps !== `${project.output.fps}/1` || media.frames !== frames) throw new Error(`Renderer wrote unexpected media settings for ${scene.id}.`);
    await rename(temporary,outputPath);
    if (!preview) await writeJson(cachePath, { fingerprint: renderFingerprint, outputPath, frames, generatedAt: new Date().toISOString() });
    return { id: scene.id, outputPath, frames, cached: false };
  } catch (error) {
    encoder?.kill('SIGTERM');encoder?.stdin.destroy();await done?.catch(()=>{});
    if (existsSync(temporary)) await rm(temporary, { force: true });
    throw error;
  } finally {
    await browser?.close();
    await server.close();
  }
}

function onceDrain(stream) { return new Promise((resolve,reject)=>{const cleanup=()=>{stream.off('drain',drain);stream.off('error',fail);stream.off('close',closed);};const drain=()=>{cleanup();resolve();};const fail=error=>{cleanup();reject(error);};const closed=()=>fail(new Error('Encoder input closed.'));stream.once('drain',drain);stream.once('error',fail);stream.once('close',closed);}); }
function waitForProcess(process, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => process.kill('SIGTERM');
    signal?.addEventListener('abort', abort, { once: true });
    process.once('error', reject);
    process.once('close', (code) => {
      signal?.removeEventListener('abort', abort);
      code === 0 ? resolve() : reject(new Error(`FFmpeg failed with exit code ${code}.`));
    });
  });
}
function abortError() { return new DOMException('Render cancelled.', 'AbortError'); }
