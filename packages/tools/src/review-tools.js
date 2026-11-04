import path from 'node:path';
import { z } from 'zod';
import { loadProject } from '../../core/src/io.js';
import { validateProject } from '../../core/src/index.js';
import { previewSize, renderScene, sceneFingerprint } from '../../renderer/src/render.js';
import { REVIEW_DIMENSIONS } from '../../director/src/knowledge.js';
import { defineTool, ToolError } from './runner.js';

export const REVIEW_TOOLS = [defineTool({
  name: 'review_clip',
  description: 'Render an exact affected interval (start included, end excluded, up to ten seconds) for normal-speed review. Returns unverified dimensions; rendering never records visual approval. Use transition_preview for an outgoing shot boundary and review_record after inspecting evidence.',
  input: z.object({ id: z.string().min(1), startFrame: z.number().int().nonnegative(), endFrame: z.number().int().positive(), width: z.number().int().min(160).max(1280).default(640) }),
  async run({root,signal,emit},{id,startFrame,endFrame,width}) {
    const project = await loadProject(root), scene = project.scenes.find(item=>item.id===id);
    if (!scene) throw new ToolError(`No scene "${id}".`);
    const validation = validateProject(project);
    if (!validation.valid) throw new ToolError('Project is invalid.',validation.errors);
    if (endFrame<=startFrame || endFrame>scene.durationFrames || endFrame-startFrame>10*project.output.fps) throw new ToolError('Review interval must be inside the shot and between one frame and ten seconds.');
    const fingerprint = await sceneFingerprint(project,scene);
    const result = await renderScene(project,scene,{signal,onProgress:detail=>emit({type:'progress',...detail}),preview:{startFrame,frames:endFrame-startFrame,...previewSize(project.output,width)}});
    const current = await loadProject(root), currentScene = current.scenes.find(item=>item.id===id);
    const stale = !currentScene || await sceneFingerprint(current,currentScene)!==fingerprint;
    return {...result,id,startFrame,endFrame,frames:endFrame-startFrame,fps:project.output.fps,timecodes:{start:startFrame/project.output.fps,end:endFrame/project.output.fps},fingerprint,stale,url:`/project-assets/.runtime/previews/${path.basename(result.outputPath)}`,reviewStatus:'unreviewed',unverifiedDimensions:REVIEW_DIMENSIONS};
  },
})];
