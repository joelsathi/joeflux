// Design coordinates use the short edge at 1080; every canvas transform is uniform.
// Rounded delivery sizes (for example 854×480) may differ by up to one percent.
export function pluginLayout({ width, height }) {
  if (!(Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0)) throw new Error('Animation plugins need positive finite output dimensions.');
  const ratio = width / height;
  const format = [{ id: 'landscape', ratio: 16 / 9 }, { id: 'square', ratio: 1 }, { id: 'portrait', ratio: 9 / 16 }].find(item => Math.abs(ratio / item.ratio - 1) <= .01)?.id;
  if (!format) throw new Error('Animation plugins support 16:9, 1:1, and 9:16 output. Choose a supported format to reflow this scene.');
  const scale = Math.min(width, height) / 1080, w = width / scale, h = height / scale;
  const options = {
    landscape: { margin: 120, labelY: 100, art: { x: 120, y: 220, width: w - 240, height: 450 }, copyY: 748, titleSize: 80, titleHeight: 132, subtitleSize: 30, subtitleHeight: 76, gap: 16 },
    square: { margin: 72, labelY: 82, art: { x: 72, y: 188, width: w - 144, height: 476 }, copyY: 732, titleSize: 68, titleHeight: 156, subtitleSize: 30, subtitleHeight: 96, gap: 16 },
    portrait: { margin: 80, labelY: 112, art: { x: 80, y: 280, width: w - 160, height: 900 }, copyY: 1380, titleSize: 88, titleHeight: 280, subtitleSize: 36, subtitleHeight: 128, gap: 24 },
  }[format];
  return { format, scale, width: w, height: h, ...options, copyWidth: w - options.margin * 2 };
}

export function animeCardLayout(layout, index) {
  const { art, format } = layout;
  if (format === 'landscape') return { x: art.x + art.width * (index + .5) / 7, y: art.y + art.height * .48, scale: 1, rotation: (index - 3) * .065 };
  // The stagger keeps the same seven focal objects while giving each row room.
  const columns = format === 'square' ? 4 : 3, row = Math.floor(index / columns), count = Math.min(columns, 7 - row * columns), column = index % columns;
  const rows = Math.ceil(7 / columns), cellWidth = art.width / columns;
  return { x: art.x + art.width / 2 + (column - (count - 1) / 2) * cellWidth, y: art.y + art.height * (row + .5) / rows, scale: format === 'square' ? .76 : 1, rotation: (column - (count - 1) / 2) * .045 };
}

export function motionCardLayout(layout, index) {
  const { art, format } = layout;
  if (format === 'landscape') return { x: art.x + index * (art.width + 28) / 3, y: art.y + 24, width: (art.width - 56) / 3, height: 375, compact: false };
  if (format === 'square') {
    const width = (art.width - 24) / 2, height = (art.height - 24) / 2;
    return { x: index < 2 ? art.x + index * (width + 24) : art.x + (art.width - width) / 2, y: art.y + (index < 2 ? 0 : height + 24), width, height, compact: true };
  }
  const height = (art.height - 56) / 3;
  return { x: art.x, y: art.y + index * (height + 28), width: art.width, height, compact: true };
}

// Match both Three engines to the same art region at the camera's z=7 / fov=38.
export function sculptureLayout(output) {
  const layout = pluginLayout(output), { art } = layout;
  const worldHeight = 2 * 7 * Math.tan(38 * Math.PI / 360), units = worldHeight / layout.height;
  return { y: (layout.height / 2 - art.y - art.height / 2) * units, scale: Math.min(art.width, art.height) * units / 3.15 };
}
