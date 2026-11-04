const BASE_WIDTH = 1920;

export function layoutText(text, options) {
  const { maxWidth, maxLines, fontSize, minFontSize, lineHeight, measure } = options;
  for (let size = fontSize; size >= minFontSize; size -= 1) {
    const measured = (line) => ({ width: measure.length >= 2 ? measure(line, size).width : measure(line).width * size / fontSize });
    const lines = wrap(text, maxWidth, 1, measured);
    if (lines.length <= maxLines && lines.every(line => measured(line).width <= maxWidth) && lines.length * lineHeight * size / fontSize <= (options.maxHeight ?? Infinity)) return { lines, fontSize: size, bounds: { width: Math.max(...lines.map((line) => measured(line).width), 0), height: lines.length * lineHeight * size / fontSize } };
  }
  throw new Error(`Text cannot fit in ${maxLines} line(s) at the minimum font size of ${minFontSize}px.`);
}

export function layoutScene(scene, output) {
  const unit = output.width / BASE_WIDTH;
  const margin = 96 * unit;
  const gap = 48 * unit;
  const safeRect = { x: margin, y: margin, width: output.width - margin * 2, height: output.height - margin * 2 };
  if (!['recorded-showcase', 'focus-transition', 'screen-handoff', 'product-reveal'].includes(scene.preset)) {
    return { safeRect, gap, copyRect: safeRect, mediaRect: null };
  }
  const copyWidth = safeRect.width * .31;
  return {
    safeRect, gap,
    copyRect: { x: safeRect.x, y: safeRect.y + 54 * unit, width: copyWidth, height: safeRect.height - 108 * unit },
    mediaRect: { x: safeRect.x + copyWidth + gap, y: safeRect.y + 26 * unit, width: safeRect.width - copyWidth - gap, height: safeRect.height - 52 * unit },
  };
}

function wrap(text, maxWidth, scale, measure) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = []; let line = '';
  for (const word of words) {
    const candidate = `${line} ${word}`.trim();
    if (line && measure(candidate).width * scale > maxWidth) { lines.push(line); line = word; } else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}
