import { ToolError } from './runner.js';
import { captureTemplateOverrides } from '../../presets/src/template-controls.js';

export async function editScene(tx, sceneId, change) {
  const manifest = await tx.readJson('project.json'), entry = manifest.scenes.find(scene => scene.id === sceneId);
  if (!entry) throw new ToolError(`No scene "${sceneId}".`);
  const before = entry.file ? await tx.readJson(entry.file) : entry;
  const { _change, fingerprint, ...next } = captureTemplateOverrides(before, await change(structuredClone(before)));
  if (next.id !== undefined && next.id !== sceneId) throw new ToolError('Scene ids cannot change; duplicate the scene and delete the original.');
  if (entry.file) tx.writeJson(entry.file, next);
  else { manifest.scenes = manifest.scenes.map(scene => scene.id === sceneId ? next : scene); tx.writeJson('project.json', manifest); }
  return next;
}
export async function insertScene(tx, scene, index) {
  const manifest = await tx.readJson('project.json'), file = `scenes/${scene.id}.json`;
  if (manifest.scenes.some((entry) => entry.id === scene.id)) throw new ToolError(`Scene "${scene.id}" already exists.`);
  if (await tx.read(file).then(() => true, () => false)) throw new ToolError(`${file} already exists.`);
  manifest.scenes.splice(index ?? manifest.scenes.length, 0, { id: scene.id, file });
  tx.writeJson('project.json', manifest); tx.writeJson(file, scene);
  return { id: scene.id, file };
}
