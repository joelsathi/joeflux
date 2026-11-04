import { evaluateSourceMoments } from './source-moments.js';
export const CAMERA_DEFAULT = { x: 0, y: 0, z: 0, rotateX: 0, rotateY: 0, rotateZ: 0, scale: 1, focusX: .5, focusY: .5, opacity: 1, radius: 24 };
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export function ease(progress, kind = 'easeInOut') {
  const t = clamp(progress);
  if (kind === 'linear') return t;
  if (kind === 'easeOut') return 1 - (1 - t) ** 3;
  if (kind === 'easeIn') return t ** 3;
  if (kind === 'smootherstep') return t * t * t * (t * (t * 6 - 15) + 10);
  if (kind === 'gentle') return .5 - Math.cos(Math.PI * t) / 2;
  if (kind === 'snappy') return t < .5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2;
  // Damped spring released from rest, normalized to land on 1: overshoots about 4.4%, then settles.
  if (kind === 'spring') return t >= 1 ? 1 : (1 - Math.exp(-8 * t) * (Math.cos(8 * t) + Math.sin(8 * t))) / (1 - Math.exp(-8) * (Math.cos(8) + Math.sin(8)));
  return t * t * (3 - 2 * t);
}

export function evaluateCamera(camera = {}, frame, durationFrames) {
  let previous = { ...CAMERA_DEFAULT, ...camera.start };
  const keys = camera.keyframes?.length
    ? camera.keyframes.map((key) => (previous = { ...previous, ...key }))
    : [{ ...previous, frame: 0 }, { ...previous, ...camera.end, frame: Math.max(1, durationFrames - 1) }];
  const right = keys.findIndex((key) => key.frame > frame);
  if (right === 0) return { ...keys[0] };
  if (right < 0) return { ...keys.at(-1) };
  const a = keys[right - 1], b = keys[right];
  const t = ease((frame - a.frame) / (b.frame - a.frame), b.easing ?? camera.easing);
  return Object.fromEntries(Object.keys(CAMERA_DEFAULT).map((key) => [key, a[key] + (b[key] - a[key]) * t]));
}

// Speed segments are half-open output-frame intervals. Legacy holds are inclusive.
// Trim/fixed-hold frame values use sourceFps (falling back to outputFps).
export function evaluateSourceTime(playback = {}, outputFrame, outputFps = 24) {
  if (playback.moments !== undefined) return evaluateSourceMoments(playback.moments, outputFrame, outputFps);
  const sourceFps = playback.sourceFps ?? outputFps;
  const start = playback.startSeconds ?? (playback.startFrame ?? 0) / sourceFps;
  const end = playback.endSeconds ?? (playback.endFrame === undefined ? Infinity : playback.endFrame / sourceFps);
  const target = Math.max(0, outputFrame);
  let cursor = 0, seconds = start;
  const bound = (value) => clamp(value, start, end);
  for (const hold of playback.holds ?? []) {
    if (hold.outputStart > target) break;
    seconds = bound(seconds + integrateRates(playback.segments, cursor, hold.outputStart) / outputFps);
    if (hold.sourceSeconds !== undefined || hold.sourceFrame !== undefined) {
      seconds = bound(hold.sourceSeconds ?? hold.sourceFrame / sourceFps);
    }
    cursor = hold.outputEnd + 1;
    if (target <= cursor) return seconds;
  }
  return bound(seconds + integrateRates(playback.segments, cursor, target) / outputFps);
}

function integrateRates(segments = [], start, end) {
  if (end <= start) return 0;
  let sum = end - start;
  for (const segment of segments) {
    const origin = segment.outputStart ?? 0;
    const a = Math.max(start, origin), b = Math.min(end, segment.outputEnd ?? Infinity);
    if (b <= a) continue;
    const rate = segment.rate ?? 1;
    const slope = segment.endRate === undefined ? 0 : (segment.endRate - rate) / (segment.outputEnd - origin);
    sum += (rate - 1) * (b - a) + slope * ((b - origin) ** 2 - (a - origin) ** 2) / 2;
  }
  return sum;
}

export function mapSourceFrame(playback = {}, outputFrame, outputFps = 24) {
  return Math.round(evaluateSourceTime(playback, outputFrame, outputFps) * (playback.sourceFps ?? outputFps));
}
