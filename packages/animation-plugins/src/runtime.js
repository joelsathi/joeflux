export * from './adapters.js';
export { ANIMATION_PLUGINS } from './catalog.js';
export { createComponent } from './components.js';
import { builtins } from './builtins.js';
export async function createPlugin(id, context) {
  const factory = builtins[id];
  if (!Object.hasOwn(builtins, id)) throw new Error(`Unknown animation plugin: ${id}`);
  return factory(context);
}
