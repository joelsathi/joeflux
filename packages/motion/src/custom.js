export function sceneModuleUrl(scene, mount = '/project-modules') {
  if (!scene?.module) return null;
  return `${mount}/${scene.module.split('/').map(encodeURIComponent).join('/')}`;
}

export async function renderModuleFrame(scene, frame, context, importModule, mount = '/project-modules') {
  const url = sceneModuleUrl(scene, mount);
  if (!url) return null;
  const module = await importModule(url);
  if (typeof module.renderFrame !== 'function') throw new Error(`Custom scene module "${scene.module}" must export renderFrame(frame, context).`);
  return module.renderFrame(frame, context);
}
