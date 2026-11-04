let runtime;
let transientQueue=Promise.resolve();
const runtimeUrl = '/animation-plugins/runtime.js';
export function loadAnimationPlugins() {
  return runtime ??= import(/* @vite-ignore */ runtimeUrl).catch(error => { runtime = null; throw error; });
}
// Render into a private buffer, then publish only a still-current request.
// Serializing initialization/render/disposal prevents overlapping React commits.
export function createPluginHost({transient=false}={}) {
  const sessions = new Map();
  let queue = Promise.resolve();
  const enqueue = work => {
    const previous=queue, start=()=>previous.then(work);
    const next=transient?transientQueue.then(start):start();
    queue=next.catch(()=>{});if(transient)transientQueue=queue;return next;
  };
  return {
    render(canvas, scene, frame, output, project, isCurrent, factory) {
      return enqueue(async () => {
        if (!isCurrent()) return null;
        const key = JSON.stringify([scene, output]);
        let entry = sessions.get(canvas);
        if (entry?.key !== key || entry?.factory !== factory) {
          entry?.session.dispose(); sessions.delete(canvas);
          const buffer = document.createElement('canvas'); buffer.width = output.width; buffer.height = output.height;
          const context = { canvas: buffer, context: buffer.getContext('2d'), output, project, scene };
          const session = factory ? await factory(context) : await (await loadAnimationPlugins()).createPlugin(scene.plugin, context);
          entry = { key, factory, buffer, session }; sessions.set(canvas, entry);
        }
        try {
        await entry.session.render(frame);
        if (!isCurrent()) return null;
        if (canvas.width !== output.width) canvas.width = output.width;
        if (canvas.height !== output.height) canvas.height = output.height;
        const ctx = canvas.getContext('2d'); ctx.resetTransform(); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(entry.buffer, 0, 0);
        canvas.dataset.renderedFrame = String(frame); canvas.dataset.renderedScene = scene.id;
        return { plugin: scene.plugin, frame };
        } finally {
          if(transient){entry.session.dispose();sessions.delete(canvas);}
        }
      });
    },
    retain(canvas,scene,output) { return enqueue(()=>{
      const entry=sessions.get(canvas);
      if(entry&&entry.key!==JSON.stringify([scene,output])){entry.session.dispose();sessions.delete(canvas);}
    }); },
    release(canvas) { return enqueue(() => { sessions.get(canvas)?.session.dispose(); sessions.delete(canvas); }); },
    dispose() { return enqueue(() => { for (const entry of sessions.values()) entry.session.dispose(); sessions.clear(); }); },
  };
}
