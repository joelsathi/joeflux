import { pluginLayout } from './formats.js';
const fontFamily = '"Harness Inter", sans-serif';

export function base(context) {
  const { canvas, output, context: ctx } = context, layout = pluginLayout(output);
  if (canvas.width !== output.width) canvas.width = output.width;
  if (canvas.height !== output.height) canvas.height = output.height;
  ctx.setTransform(layout.scale, 0, 0, layout.scale, 0, 0);
  ctx.globalAlpha = 1;
  const gradient = ctx.createLinearGradient(0, 0, layout.width, layout.height);
  gradient.addColorStop(0, '#0a1628'); gradient.addColorStop(1, '#101c37');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, layout.width, layout.height);
  return ctx;
}

function wrapText(ctx, text, width) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= width) { line = candidate; continue; }
      if (line) { lines.push(line); line = ''; }
      // Long tokens wrap by grapheme, preserving combining marks and emoji.
      const characters = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(word);
      for (const { segment } of characters) {
        if (line && ctx.measureText(line + segment).width > width) { lines.push(line); line = ''; }
        line += segment;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function fittedText(ctx, text, { size, minSize, width, height, weight, leading = 1.16, error }) {
  if (!text) return { lines: [], size, lineHeight: 0, height: 0 };
  for (let current = size; current >= Math.min(minSize, size); current--) {
    ctx.font = `${weight} ${current}px ${fontFamily}`;
    const lines = wrapText(ctx, text, width), lineHeight = current * leading;
    if (lines.length * lineHeight <= height && lines.every(line => ctx.measureText(line).width <= width)) return { lines, size: current, lineHeight, height: lines.length * lineHeight };
  }
  throw new Error(error);
}

function drawText(ctx, text, x, y, color, { slot, ...options }) {
  const fit = fittedText(ctx, text, { ...options, error: `Plugin ${slot} cannot fit this format readably. Shorten the copy or remove extra line breaks.` });
  ctx.font = `${options.weight} ${fit.size}px ${fontFamily}`; ctx.fillStyle = color;
  fit.lines.forEach((line, index) => ctx.fillText(line, x, y + index * fit.lineHeight));
  return fit.height;
}

export function copy(context, { label, opacity = 1, y = 0 } = {}) {
  const { context: ctx, output, scene } = context, layout = pluginLayout(output);
  ctx.save();
  try {
    ctx.setTransform(layout.scale, 0, 0, layout.scale, 0, 0);
    ctx.globalAlpha = opacity; ctx.translate(0, y); ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    drawText(ctx, label ?? 'OPEN SOURCE / MOTION STUDIO', layout.margin, layout.labelY, scene.pluginOptions?.color ?? '#74e7cd', { size: 22, minSize: 18, width: layout.copyWidth, height: 52, weight: 600, slot: 'label' });
    const titleHeight = drawText(ctx, scene.params?.title ?? 'Ideas in motion', layout.margin, layout.copyY, '#f4f7ff', { size: layout.titleSize, minSize: 42, width: layout.copyWidth, height: layout.titleHeight, weight: 600, slot: 'title' });
    drawText(ctx, scene.params?.subtitle ?? 'Built with open-source animation', layout.margin, layout.copyY + titleHeight + (titleHeight ? layout.gap : 0), '#a7bad4', { size: layout.subtitleSize, minSize: 24, width: layout.copyWidth, height: layout.subtitleHeight, weight: 400, slot: 'subtitle' });
  } finally { ctx.restore(); }
}
export function easeProgress(seconds, delay = 0, duration = 1.2) {
  const t = Math.max(0, Math.min(1, (seconds - delay) / duration));
  return 1 - (1 - t) ** 4;
}
