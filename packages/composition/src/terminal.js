/** Plain-text replay only: transcripts are never executed or interpreted as ANSI. */
export const terminalGraphemes = text => Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), part => part.segment);
export function parseTerminalTranscript(text = '') {
  if (typeof text !== 'string') throw new Error('Terminal transcript must be plain text.');
  return text.replace(/\r\n?/g, '\n').split('\n').map(text => ({ kind: text.startsWith('$ ') ? 'command' : 'output', text, graphemes: terminalGraphemes(text) }));
}
function stageTimeline(text, speed) {
  let clock = 0;
  const rows = parseTerminalTranscript(text).map(row => {
    const start = clock;
    const duration = row.kind === 'command' ? Math.max(0, row.graphemes.length - 2) / speed : Math.max(.12, row.graphemes.length / 120);
    clock += duration;
    return { ...row, start, end: clock, duration };
  });
  return { rows, contentDuration: clock };
}
export function terminalTimeline(inputs = {}, holdSeconds) {
  const speed = Number(inputs.typingSpeed ?? 45);
  if (!Number.isFinite(speed) || speed < 10 || speed > 100) throw new Error('Terminal typing speed must be between 10 and 100 characters per second.');
  const texts = [inputs.transcript ?? ''];
  if (inputs.secondTranscript?.trim()) texts.push(inputs.secondTranscript);
  const stages = texts.map(text => stageTimeline(text, speed));
  const readingMinimum = [inputs.title, inputs.subtitle, inputs.status].filter(Boolean).join(' ').trim().split(/\s+/).filter(Boolean).length / 3 + 1;
  const statusRead = inputs.status?.trim() ? inputs.status.trim().split(/\s+/).length / 3 + 1 : 0;
  const animationMinimum = stages.reduce((sum, stage, i) => sum + stage.contentDuration + (i === stages.length - 1 ? Math.max(2, statusRead) : 2), 0) + (stages.length - 1) * .6;
  const minimum = Math.max(animationMinimum, readingMinimum);
  const duration = holdSeconds ?? minimum;
  if (!Number.isFinite(duration) || duration + 1e-9 < minimum) throw new Error(`Terminal hold must be at least ${minimum.toFixed(2)} seconds. Increase the hold or shorten the transcript.`);
  let start = 0;
  for (const [index, stage] of stages.entries()) {
    stage.start = start; stage.settledDuration = (index === stages.length - 1 ? Math.max(2, statusRead) : 2) + (duration - animationMinimum) / stages.length;
    stage.end = start + stage.contentDuration + stage.settledDuration;
    start = stage.end + .6;
  }
  return { stages, duration, minimum, handoffSeconds: .6 };
}
export function terminalMinimumHoldSeconds(inputs) { return terminalTimeline(inputs).minimum; }
export function terminalFrameState(inputs, seconds, holdSeconds) {
  if (!Number.isFinite(seconds)) throw new Error('Terminal replay requires a finite time.');
  const timeline = terminalTimeline(inputs, holdSeconds);
  return { ...timeline, stages: timeline.stages.map(stage => ({ ...stage, rows: stage.rows.map(row => {
    const local = seconds - stage.start;
    const count = row.kind === 'command' ? Math.min(row.graphemes.length, 2 + Math.floor(Math.max(0, local - row.start) * Number(inputs.typingSpeed ?? 45) + 1e-8)) : Math.min(row.graphemes.length, Math.floor(Math.max(0, local - row.start) * 120 + 1e-8));
    return { ...row, visible: local >= row.start, typing: row.kind === 'command' && local >= row.start && local < row.end, text: row.graphemes.slice(0, count).join('') };
  }) })) };
}
/** Visual-row arrival times; overflow moves over 120ms and never depends on prior seeks. */
export function terminalScrollOffset(arrivals, seconds, capacity) {
  return arrivals.slice(Math.max(1, Math.floor(capacity))).reduce((offset, at) => {
    const t = Math.max(0, Math.min(1, (seconds - at) / .12));
    return offset + t * t * (3 - 2 * t);
  }, 0);
}

/** Time the first visible grapheme of a wrapped continuation reaches the screen. */
export function terminalVisualRowArrival(stage, row, offset, typingSpeed = 45) {
  if (offset === 0) return stage.start + row.start;
  return stage.start + row.start + (row.kind === 'command' ? Math.max(0, offset - 2 + 1) / typingSpeed : (offset + 1) / 120);
}
