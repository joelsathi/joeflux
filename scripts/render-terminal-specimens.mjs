import { mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { loadProject } from '../packages/core/src/io.js';
import { validateProject } from '../packages/core/src/index.js';
import { renderScene } from '../packages/renderer/src/render.js';
import { createRenderServer } from '../packages/renderer/src/server.js';
import { browserLaunchOptions } from '../packages/renderer/src/index.js';
import { probeSilentVideo } from '../packages/assembly/src/media.js';

const root = fileURLToPath(new URL('../projects/terminal-templates/', import.meta.url));
const source = await loadProject(root), outputRoot = path.join(root, 'exports/review-drafts');
await mkdir(outputRoot, { recursive: true });
const results = [];
for (const [format, width, height] of [['landscape', 960, 540], ['square', 720, 720], ['portrait', 540, 960]]) {
  const project = { ...source, output: { ...source.output, width, height } };
  const validation = validateProject(project);
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  const server = await createRenderServer(root, { project });
  let browser;
  try {
    browser = await chromium.launch(browserLaunchOptions());
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(server.origin); await page.waitForFunction(() => window.joeFluxReady);
    for (const scene of project.scenes) {
      const name = `${format}-${scene.id}`, images = [];
      // Frames cover typing, the pane handoff and the completed second transcript.
      for (const frame of [24, 72, 139, 148, 220]) {
        await page.evaluate(({ sceneId, frame }) => window.renderScene({ sceneId, frame }), { sceneId: scene.id, frame });
        const file = path.join(outputRoot, `${name}-${frame}.png`);
        await page.screenshot({ path: file, animations: 'disabled' }); images.push({ frame, file });
      }
      console.log(`Rendering ${name}: ${scene.durationFrames} silent frames.`);
      const result = await renderScene(project, scene, { preview: { startFrame: 0, frames: scene.durationFrames, width, height } });
      const clip = path.join(outputRoot, `${name}.mp4`); await copyFile(result.outputPath, clip); await rm(result.outputPath);
      const media = await probeSilentVideo(clip);
      if (media.frames !== scene.durationFrames || media.audioStreams) throw new Error(`Unexpected clip settings for ${name}.`);
      results.push({ format, palette: scene.components[0].inputs.palette, width, height, fps: project.output.fps, frames: media.frames, audioStreams: media.audioStreams ?? 0, clip, images, normalSpeedPlayback: 'unreviewed', creativeApproval: false });
    }
  } finally { await browser?.close(); await server.close(); }
}
await writeFile(path.join(outputRoot, 'specimens.json'), JSON.stringify(results, null, 2) + '\n');
console.log('Six independent terminal clips and frame sets saved.');
