import { terminalFrameState, terminalGraphemes, terminalTimeline, terminalScrollOffset, terminalVisualRowArrival } from '../../composition/src/terminal.js';
import { themeBackdrop } from './drawing.js';
const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const themes = {
  dark: { bg: '#101a2c', panel: '#09111f', bar: '#192437', text: '#edf4ff', dim: '#a3b2c6', border: '#344259', string: '#e7c79f', key: '#7fd8ff' },
  light: { bg: '#edf2f8', panel: '#ffffff', bar: '#e4eaf2', text: '#15263d', dim: '#516278', border: '#c7d2e1', string: '#8b4c27', key: '#12658b' },
};
function wrap(ctx, text, width) {
  const lines = []; let line = '';
  for (const grapheme of terminalGraphemes(text)) {
    if (line && ctx.measureText(line + grapheme).width > width) { lines.push(line); line = ''; }
    line += grapheme;
  }
  lines.push(line); return lines;
}
function fit(ctx, text, width, height, maximum, minimum, font) {
  for (let size = maximum; ; size = Math.max(minimum, size - Math.max(.25, maximum / 50))) {
    ctx.font = font(size); const lines = text.split('\n').flatMap(line => wrap(ctx, line, width));
    if (lines.length * size * 1.4 <= height && lines.every(line => ctx.measureText(line).width <= width)) return { size, lines, lineHeight: size * 1.4 };
    if (size <= minimum) break;
  }
  throw new Error('Terminal text cannot fit readably. Shorten the transcript or header, split it across two stages, or enlarge the component bounds.');
}
const sans = size => `600 ${size}px "Harness Inter", sans-serif`;
const mono = size => `500 ${size}px ui-monospace, "SFMono-Regular", Consolas, monospace`;
function copy(ctx, text, x, y, width, height, size, min, color) {
  if (!text) return;
  const layout = fit(ctx, text, width, height, size, min, sans);
  ctx.font = sans(layout.size); ctx.fillStyle = color;
  layout.lines.forEach((line, i) => ctx.fillText(line, x, y + i * layout.lineHeight));
}
function syntax(ctx, text, kind, x, y, palette, accent) {
  const tokens = text.match(/"(?:[^"\\]|\\.)*"?|\s+|[^\s"]+/g) ?? [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    ctx.fillStyle = token === '$' ? accent : token.startsWith('-') || (token.startsWith('"') && tokens[i + 1]?.startsWith(':')) ? palette.key : token.startsWith('"') ? palette.string : palette.text;
    ctx.fillText(token, x, y); x += ctx.measureText(token).width;
  }
  return x;
}
export async function createTerminal(context) {
  let disposed = false;
  const { context: ctx, component, bounds: b, output } = context;
  const inputs = component.inputs, timing = component.timing;
  const palette = themes[inputs.palette ?? 'dark'];
  if (!palette) throw new Error('Terminal palette must be light or dark.');
  const accent = inputs.color ?? '#ff8754', unit = Math.min(b.width, b.height), pad = unit * .055;
  const x = b.x + pad, width = b.width - pad * 2, headerHeight = b.height * .2;
  const y = b.y + headerHeight + pad, height = b.height * .62, bar = unit * .065;
  const monoSize = unit * .03, lineHeight = monoSize * 1.4;
  const terminalWidth = width - pad * 1.2 - monoSize, terminalHeight = height - bar - pad * 1.1;
  const timeline = terminalTimeline(inputs, timing.holdFrames / output.fps);
  ctx.font = mono(monoSize);
  const arrivals = timeline.stages.map(stage => stage.rows.flatMap(row => {
    let offset = 0;
    return wrap(ctx, row.text, terminalWidth).map(line => {
      const at = terminalVisualRowArrival(stage, row, offset, inputs.typingSpeed ?? 45);
      offset += terminalGraphemes(line).length; return at;
    });
  }));
  function panel(stage, index, shift, opacity, seconds) {
    ctx.save();
    try {
      ctx.globalAlpha *= opacity; ctx.translate(shift, 0);
      ctx.fillStyle = palette.panel; ctx.beginPath(); ctx.roundRect(x, y, width, height, unit * .018); ctx.fill();
      ctx.save(); ctx.clip(); ctx.fillStyle = palette.bar; ctx.fillRect(x, y, width, bar); ctx.restore();
      ctx.strokeStyle = palette.border; ctx.lineWidth = Math.max(1, unit * .001); ctx.stroke();
      ['#ff5f57', '#febc2e', '#28c840'].forEach((color, i) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x + pad * .5 + i * unit * .02, y + bar / 2, unit * .0055, 0, Math.PI * 2); ctx.fill(); });
      const titleWidth = width - unit * .22;
      ctx.textAlign = 'center'; copy(ctx, index ? inputs.secondWindowTitle ?? 'Terminal' : inputs.windowTitle ?? 'Terminal', x + width / 2, y + bar * .22, titleWidth, bar * .65, unit * .017, unit * .008, palette.dim); ctx.textAlign = 'left';
      ctx.font = mono(monoSize); let rowIndex = 0;
      const scroll = terminalScrollOffset(arrivals[index], seconds, terminalHeight / lineHeight);
      ctx.save(); ctx.beginPath(); ctx.rect(x + pad * .6, y + bar + pad * .5, width - pad * 1.2, terminalHeight); ctx.clip();
      for (const row of stage.rows) {
        if (!row.visible) break;
        const lines = wrap(ctx, row.text, terminalWidth);
        for (const [lineIndex, line] of lines.entries()) {
          const cy = y + bar + pad * .5 + (rowIndex++ - scroll) * lineHeight;
          const end = syntax(ctx, line, row.kind, x + pad * .6, cy, palette, accent);
          if (row.typing && lineIndex === lines.length - 1 && Math.floor(seconds * 3) % 2 === 0) { ctx.fillStyle = accent; ctx.fillRect(end + 2, cy, monoSize * .5, monoSize * 1.1); }
        }
      }
      ctx.restore();
    } finally { ctx.restore(); }
  }
  return { render(frame) {
    if (disposed) throw new Error('Terminal session is disposed.');
    const seconds = (frame - timing.entranceFrames) / output.fps;
    const state = terminalFrameState(inputs, seconds, timing.holdFrames / output.fps);
    const opacity = Math.min(ease(frame / Math.max(1, timing.entranceFrames)), 1 - ease((frame - timing.entranceFrames - timing.holdFrames) / Math.max(1, timing.exitFrames)));
    const handoff = state.stages.length > 1 ? ease((seconds - state.stages[0].end) / .6) : 0;
    ctx.save();
    try {
      ctx.beginPath(); ctx.rect(b.x, b.y, b.width, b.height); ctx.clip();
      // The dark palette sits on a dark project theme's background, drawn before the fade so the
      // shot cuts cleanly against themed shots; only the terminal content fades in and out.
      const themed = (inputs.palette ?? 'dark') === 'dark' && themeBackdrop(context);
      if (themed) { const gradient = ctx.createLinearGradient(b.x, b.y, b.x + b.width, b.y + b.height); gradient.addColorStop(0, themed[0]); gradient.addColorStop(1, themed[1]); ctx.fillStyle = gradient; ctx.fillRect(b.x, b.y, b.width, b.height); }
      ctx.globalAlpha *= opacity; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      if (!themed) { ctx.fillStyle = palette.bg; ctx.fillRect(b.x, b.y, b.width, b.height); }
      copy(ctx, inputs.subtitle ?? '', x, b.y + pad * .6, width, headerHeight * .22, unit * .015, unit * .009, accent);
      copy(ctx, inputs.title ?? '', x, b.y + pad * .6 + headerHeight * .25, width, headerHeight * .65, unit * .047, unit * .022, palette.text);
      panel(state.stages[0], 0, -handoff * (width + pad), 1 - handoff, seconds);
      if (state.stages[1]) panel(state.stages[1], 1, (1 - handoff) * (width + pad), handoff, seconds);
      const bottom = y + height + pad * .4, labels = [inputs.firstStep ?? '', ...(state.stages.length > 1 ? [inputs.secondStep ?? ''] : [])];
      const statusHeight = b.y + b.height - bottom;
      labels.forEach((label, i) => { copy(ctx, `${i + 1}  ${label}`, x + i * width / labels.length, bottom, width / labels.length - pad * .3, statusHeight * .45, unit * .018, unit * .011, i === (handoff >= .5 ? 1 : 0) ? accent : palette.dim); });
      copy(ctx, seconds >= state.stages.at(-1).start + state.stages.at(-1).contentDuration ? inputs.status ?? '' : '', x, bottom + statusHeight * .48, width, statusHeight * .45, unit * .016, unit * .009, palette.dim);
    } finally { ctx.restore(); }
  }, dispose() { disposed = true; } };
}
