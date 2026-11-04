import { createTerminal } from './terminal.js';
import { createAnimeScene, createMotionScene } from './adapters.js';
import { fittedText } from './drawing.js';

const COPY_ERROR = 'Component copy cannot fit this layout readably. Shorten the copy or enlarge its bounds.';
const fit = (ctx, text, width, height, size, minSize, weight) => fittedText(ctx, text, { size, minSize, width, height, weight, leading: 1.14, error: COPY_ERROR });
function drawCopy(state, frame, { context: ctx, component, bounds: b, output }) {
  const inputs = component.inputs, portrait = output.height > output.width, square = output.height === output.width;
  const size = Math.round(output.width * (portrait ? .088 : square ? .062 : .045)), minimum = Math.max(1, Math.round(Math.min(output.width, output.height) * .034));
  const subtitleSize = Math.round(size * .47), subtitleSpace = inputs.subtitle ? b.height * .32 : 0;
  const reserve = inputs.subtitle ? Math.min(12, b.height * .06) : 0;
  const title = fit(ctx, inputs.title, b.width, b.height - subtitleSpace - reserve, size, minimum, 650);
  const subtitle = fit(ctx, inputs.subtitle ?? '', b.width, subtitleSpace, subtitleSize, Math.max(1, Math.round(minimum * .7)), 450);
  const gap = subtitle.height ? Math.min(12, b.height * .06) : 0;
  ctx.save();
  try {
    ctx.globalAlpha = state.opacity; ctx.translate(0, state.y * Math.min(output.width, output.height) / 360);
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.font = `650 ${title.size}px "Harness Inter", sans-serif`; ctx.fillStyle = inputs.treatment === 'bold' ? inputs.color : '#f4f7ff';
    title.lines.forEach((line, index) => ctx.fillText(line, b.x, b.y + index * title.lineHeight));
    ctx.font = `450 ${subtitle.size}px "Harness Inter", sans-serif`; ctx.fillStyle = '#bacbd7';
    subtitle.lines.forEach((line, index) => ctx.fillText(line, b.x, b.y + title.height + gap + index * subtitle.lineHeight));
    if (component.component === 'harness/cta') { ctx.fillStyle = inputs.color; ctx.fillRect(b.x, b.y + title.height + subtitle.height + gap + Math.max(2, output.height * .006), Math.min(b.width, output.width * .15), Math.max(2, output.height * .004)); }
  } finally { ctx.restore(); }
}
const copy = createAnimeScene({
  build(timeline, { component, output }) {
    const state = { opacity: 0, y: 18 }, t = component.timing, ms = frame => frame / output.fps * 1000;
    timeline.add(state, { opacity: [0, 1], y: [18, 0], duration: ms(t.entranceFrames), ease: 'outQuart' }, 0);
    timeline.add(state, { opacity: [1, 0], y: [0, -9], duration: ms(t.exitFrames), ease: 'inCubic' }, ms(t.entranceFrames + t.holdFrames));
    return state;
  }, draw: drawCopy,
});
const shape = createMotionScene({ draw({ interpolate, cubicBezier }, frame, { context: ctx, component, bounds: b, evaluation }) {
  const inputs = component.inputs, t = component.timing, local = frame;
  const enter = interpolate([0, t.entranceFrames], [0, 1], { ease: cubicBezier(.16, 1, .3, 1) })(local);
  const exit = interpolate([t.entranceFrames + t.holdFrames, t.entranceFrames + t.holdFrames + t.exitFrames], [1, 0], { ease: cubicBezier(.4, 0, 1, 1) })(local);
  const progress = Math.min(enter, exit), size = Math.min(b.width, b.height) * inputs.scale * (.75 + .25 * progress);
  ctx.save();
  try {
    ctx.translate(b.x + b.width / 2, b.y + b.height / 2); ctx.rotate((component.seed % 19) * .03 + progress * .25); ctx.globalAlpha = progress * (inputs.treatment === 'bold' ? .8 : .35); ctx.fillStyle = inputs.color; ctx.strokeStyle = inputs.color;
    ctx.beginPath();
    if (inputs.shape === 'pill') ctx.roundRect(-size / 2, -size * .22, size, size * .44, size * .22);
    else ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
    if (inputs.shape === 'ring') { ctx.lineWidth = size * (inputs.treatment === 'bold' ? .13 : .05); ctx.stroke(); } else ctx.fill();
  } finally { ctx.restore(); }
} });
const factories = { 'harness/title': copy, 'harness/cta': copy, 'harness/shape': shape, 'harness/terminal': createTerminal };
export async function createComponent(id, context) {
  if (!Object.hasOwn(factories, id)) throw new Error(`Unknown renderer-backed component ${id}.`);
  const session = await factories[id](context); let disposed = false;
  return { render(frame) { if (disposed) throw new Error('Component session is disposed.'); return session.render(frame); }, dispose() { if (!disposed) { disposed = true; session.dispose(); } } };
}
