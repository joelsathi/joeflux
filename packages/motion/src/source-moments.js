// Source moments use half-open output intervals. Each play interval is quantized
// once to output frames; fractional evaluation keeps the declared playback rate.
export function compileSourceMoments(moments, fps = 24) {
  if (!Number.isFinite(fps) || fps <= 0) throw new Error('Source moments need a positive finite output fps.');
  if (!Array.isArray(moments) || !moments.length) throw new Error('Source moments must be a nonempty array.');
  let cursor = 0, previous = -Infinity;
  const intervals = moments.map((moment, index) => {
    if (!moment || !['play', 'hold'].includes(moment.type)) throw new Error(`Source moment ${index + 1} needs play or hold type.`);
    const fields = moment.type === 'play' ? ['type', 'startSeconds', 'endSeconds', 'rate'] : ['type', 'sourceSeconds', 'frames'];
    if (Object.keys(moment).some(key => !fields.includes(key))) throw new Error(`Source moment ${index + 1} has unsupported fields.`);
    const start = moment.type === 'play' ? moment.startSeconds : moment.sourceSeconds;
    const end = moment.type === 'play' ? moment.endSeconds : start;
    if (!Number.isFinite(start) || start < 0 || !Number.isFinite(end) || end < start) throw new Error(`Source moment ${index + 1} needs nonnegative finite source times in order.`);
    if (start + 1e-9 < previous) throw new Error(`Source moment ${index + 1} must follow source time order.`);
    const rate = moment.rate ?? 1;
    if (!Number.isFinite(rate) || rate <= 0) throw new Error(`Source moment ${index + 1} rate must be positive and finite.`);
    const frames = moment.type === 'play' ? Math.round((end - start) * fps / rate) : moment.frames;
    if (!Number.isSafeInteger(frames) || frames < 1) throw new Error(`Source moment ${index + 1} must contain at least one whole output frame.`);
    previous = end;
    const interval = { ...moment, rate, sourceStart: start, sourceEnd: end, outputStart: cursor, outputEnd: cursor + frames, frames };
    cursor += frames;
    if (!Number.isSafeInteger(cursor)) throw new Error('Source moment duration exceeds the supported frame range.');
    return interval;
  });
  return { intervals, totalFrames: cursor };
}

export function sourceMomentErrors(playback = {}, { fps = 24, durationFrames, sourceDurationSeconds } = {}) {
  if (playback.moments === undefined) return [];
  const errors = [];
  const legacy = ['startSeconds', 'endSeconds', 'startFrame', 'endFrame', 'segments', 'holds'];
  if (legacy.some(key => playback[key] !== undefined)) errors.push('source moments cannot combine with legacy trims, speed segments or holds.');
  try {
    const compiled = compileSourceMoments(playback.moments, fps);
    if (durationFrames !== undefined && compiled.totalFrames !== durationFrames) errors.push(`source moment duration is ${compiled.totalFrames} frames; scene duration must match.`);
    if (sourceDurationSeconds !== undefined && compiled.intervals.some(interval => interval.sourceEnd > sourceDurationSeconds + 1e-9)) errors.push('source moments exceed the source duration.');
  } catch (error) { errors.push(error.message); }
  return errors;
}

export function evaluateSourceMoments(moments, outputFrame, fps = 24) {
  if (!Number.isFinite(outputFrame)) throw new Error('Source moment output frame must be finite.');
  const { intervals } = compileSourceMoments(moments, fps);
  const frame = Math.max(0, outputFrame);
  const interval = intervals.find(item => frame < item.outputEnd);
  if (!interval) return intervals.at(-1).sourceEnd;
  if (interval.type === 'hold') return interval.sourceStart;
  return Math.min(interval.sourceEnd, interval.sourceStart + (frame - interval.outputStart) * interval.rate / fps);
}
