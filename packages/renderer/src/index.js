import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

export function browserLaunchOptions() {
  return { headless: true, channel: 'chromium' };
}

// With blurSamples, each output frame arrives as that many sub-frames; tmix averages each group
// and select keeps the frame that closes it.
export function buildVideoArgs({ fps, outputPath, blurSamples }) {
  const blur = blurSamples > 1 ? ['-vf', `tmix=frames=${blurSamples},select='not(mod(n+1\\,${blurSamples}))',setpts=N/(${fps}*TB)`, '-r', String(fps)] : [];
  return [
    '-v', 'error', '-y', '-f', 'image2pipe', '-vcodec', 'png', '-framerate', String(blurSamples > 1 ? fps * blurSamples : fps), '-i', 'pipe:0',
    ...blur, '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
    '-movflags', '+faststart', outputPath,
  ];
}

export async function isRenderCurrent({ cachePath, outputPath, fingerprint }) {
  try {
    await access(outputPath, constants.R_OK);
    const cache = JSON.parse(await readFile(cachePath, 'utf8'));
    return cache.fingerprint === fingerprint && cache.outputPath === outputPath;
  } catch {
    return false;
  }
}
