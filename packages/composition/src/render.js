import { compositionErrors, evaluateComponent, instantiateComponent } from './model.js';
import { compositionFormat } from './catalog.js';
import { resolveTheme } from '../../presets/src/themes.js';
import { backgroundFrame, drawThemeBackground } from '../../motion/src/background.js';

export function componentBounds(instance, output) {
  const format = compositionFormat(output), landscape = format === 'landscape', portrait = format === 'portrait';
  const anchors = {
    top: { x: .08, y: .075, width: .84, height: portrait ? .25 : .23 },
    center: { x: .08, y: landscape ? .35 : .37, width: .84, height: landscape ? .4 : .37 },
    bottom: { x: .08, y: .82, width: .84, height: .13 },
    left: { x: .08, y: .2, width: .38, height: .6 },
    right: { x: .54, y: .2, width: .38, height: .6 },
    full: { x: .04, y: .04, width: .92, height: .92 },
  };
  const b = instance.layout.bounds ?? anchors[instance.layout.anchor];
  return { x: b.x * output.width, y: b.y * output.height, width: b.width * output.width, height: b.height * output.height };
}
function drawProof(ctx, image, instance, b, evaluation) {
  const radius = instance.inputs.radius * Math.min(b.width, b.height) / 360;
  const scale = instance.inputs.fit === 'cover' ? Math.max(b.width / image.width, b.height / image.height) : Math.min(b.width / image.width, b.height / image.height);
  const width = image.width * scale, height = image.height * scale;
  ctx.save();
  try {
    ctx.globalAlpha = evaluation.opacity; ctx.translate(0, (1 - evaluation.opacity) * Math.min(b.height * .06, 24));
    ctx.beginPath(); ctx.roundRect(b.x, b.y, b.width, b.height, radius); ctx.clip();
    ctx.fillStyle = '#1c3047'; ctx.fillRect(b.x, b.y, b.width, b.height);
    ctx.drawImage(image, b.x + (b.width - width) / 2, b.y + (b.height - height) / 2, width, height);
  } finally { ctx.restore(); }
}
// Instance resources are private. Only a complete, still-current composition is published.
export function createCompositionHost({ loadAsset, loadRuntime, transient = false }) {
  const sessions = new Map(); let queue = Promise.resolve();
  const enqueue = work => { const next = queue.then(work); queue = next.catch(() => {}); return next; };
  const release = canvas => { const entry = sessions.get(canvas); if (entry) { entry.components.forEach(c => c.session?.dispose()); sessions.delete(canvas); } };
  return {
    render(canvas, scene, frame, output, project, isCurrent) { return enqueue(async () => {
      if (!isCurrent()) return null;
      const errors = compositionErrors(scene, project); if (errors.length) throw new Error(errors.join(' '));
      const key = JSON.stringify([scene, output, project.assets, project.theme]); let entry = sessions.get(canvas);
      if (entry?.key !== key) {
        release(canvas); const buffer = document.createElement('canvas'); buffer.width = output.width; buffer.height = output.height;
        entry = { key, buffer, components: [] }; sessions.set(canvas, entry);
        try {
          const runtime = await loadRuntime();
          for (const original of scene.components) {
            const component = instantiateComponent(original.component, { ...original, fps: output.fps });
            const surface = document.createElement('canvas'); surface.width = output.width; surface.height = output.height;
            const context = { canvas: surface, context: surface.getContext('2d'), output, project, scene, component, bounds: componentBounds(component, output), theme: resolveTheme(project.theme, scene.theme) };
            const session = component.component === 'harness/proof' ? null : await runtime.createComponent(component.component, context);
            entry.components.push({ component, surface, context, session });
          }
        } catch (error) { release(canvas); throw error; }
      }
      try {
        const ctx = entry.buffer.getContext('2d'); ctx.resetTransform(); ctx.globalAlpha = 1; ctx.clearRect(0, 0, output.width, output.height);
        const theme = resolveTheme(project.theme, scene.theme);
        if (scene.background?.color) { ctx.fillStyle = scene.background.color; ctx.fillRect(0, 0, output.width, output.height); }
        else drawThemeBackground(ctx, theme, output.width, output.height, backgroundFrame(scene.background, frame, output.fps));
        for (const item of entry.components) {
          const evaluation = evaluateComponent(item.component, frame), surface = item.context.context; item.context.evaluation = evaluation;
          surface.resetTransform(); surface.globalAlpha = 1; surface.clearRect(0, 0, output.width, output.height);
          if (!evaluation.visible) continue;
          if (item.session) await item.session.render(evaluation.localFrame);
          else { const image = await loadAsset(item.component.inputs.asset, Math.max(0, evaluation.localFrame) / output.fps); drawProof(surface, image, item.component, item.context.bounds, evaluation); }
          if (!isCurrent()) return null;
          ctx.drawImage(item.surface, 0, 0);
        }
        if (!isCurrent()) return null;
        if (canvas.width !== output.width) canvas.width = output.width; if (canvas.height !== output.height) canvas.height = output.height;
        const target = canvas.getContext('2d'); target.resetTransform(); target.globalAlpha = 1; target.clearRect(0, 0, output.width, output.height); target.drawImage(entry.buffer, 0, 0);
        canvas.dataset.renderedFrame = String(frame); canvas.dataset.renderedScene = scene.id;
        return { kind: 'composition', frame, components: scene.components.map(c => ({ id: c.id, ...evaluateComponent(c, frame) })) };
      } finally { if (transient) release(canvas); }
    }); },
    release(canvas) { return enqueue(() => release(canvas)); },
    dispose() { return enqueue(() => { for (const canvas of [...sessions.keys()]) release(canvas); }); },
  };
}
