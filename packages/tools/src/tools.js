import { editScene, insertScene } from './scene-edits.js';
import { ANIMATION_PLUGINS } from '../../animation-plugins/src/catalog.js';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { PRESET_NAMES, TRANSITION_TYPES, validateProject } from '../../core/src/index.js';
import { loadProject } from '../../core/src/io.js';
import { THEME_OPTIONS, resolveTheme } from '../../presets/src/themes.js';
import { BACKGROUND_PACK, getPackBackground } from '../../presets/src/background-packs.js';
import { BRAND_KITS, brandFile, getBrandKit } from '../../presets/src/brand-kits.js';
import { summarizeKit } from '../../presets/src/brand-kit-sync.js';
import { fileURLToPath } from 'node:url';
import { instantiateTemplate, listTemplates } from '../../presets/src/templates.js';
import { sceneVariations, styleChecks } from '../../presets/src/variations.js';
import { BACKGROUND_STYLES } from '../../motion/src/background.js';
import { TEXT_TEMPLATES } from '../../motion/src/text-animation.js';
import { CAMERA_MOTIONS, cameraShots, shotsFromStops } from '../../motion/src/camera-motion.js';
import { Camera, EASINGS, Screen, Shot, sceneJsonSchema } from '../../schema/src/scene.js';
import { toV2, toScreenScene, screenConversionIssue } from '../../schema/src/migrate.js';
import { hashFile } from '../../renderer/src/decoder.js';
import { renderFrameImage, renderProject, renderPreview, renderTransitionPreview, sceneFingerprint } from '../../renderer/src/render.js';
import { assembleProject, createContactSheet } from '../../assembly/src/assemble.js';
import { ToolError, defineTool } from './runner.js';

const frontmatter = (text) => Object.fromEntries((text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '').split('\n').map((line) => line.match(/^(\w+):\s*(.*)$/)).filter(Boolean).map(([, key, value]) => [key, value]));
const HARNESS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'use lowercase letters, numbers and hyphens');
const templateId = z.string().regex(/^[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*){0,2}$/, 'use a template id or publisher/package/template');
const sceneId = id.describe('Scene id from project_get.');
const unitPoint = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const mergePatch = (target, patch) => {
  if (!isObject(patch)) return patch;
  const out = isObject(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) value === null ? delete out[key] : out[key] = mergePatch(out[key], value);
  return out;
};

async function entryFor(tx, sceneId) {
  const manifest = await tx.readJson('project.json'), entry = manifest.scenes?.find((scene) => scene.id === sceneId);
  if (!entry) throw new ToolError(`No scene "${sceneId}".`);
  if (!entry.file) throw new ToolError(`Scene "${sceneId}" is inline in project.json; move it to a scene file first.`);
  return { manifest, entry };
}
// Camera tools edit the v2 shot model; legacy recording scenes convert on first edit.
function asScreenScene(scene) {
  try { return toScreenScene(scene); } catch (error) { throw new ToolError(error.message); }
}
const publicProject = ({ root, ...project }) => project;
// Runtime fields a client may echo back from project_get or a tool result.
const storedScene = ({ file, fingerprint, _change, ...scene }) => scene;
// project_get's overview: the template snapshot and component internals stay in scene_get.
const sceneSummary = ({ templateInstance: instance, components, ...scene }) => instance || components ? {
  ...scene,
  ...(instance ? { templateInstance: { template: instance.template, inputs: instance.inputs, settings: instance.settings, overrides: instance.overrides } } : {}),
  ...(components ? { components: components.map(({ id, component }) => ({ id, component })) } : {}),
  summarized: true,
} : scene;
// A screen's look: everything but the recording itself.
const LOOK = Object.keys(Screen.shape).filter((key) => key !== 'asset');
const isRecording = (scene) => ['recorded-showcase', 'focus-transition'].includes(scene.preset);
function matchPlan(project, id, ids) {
  const source = project.scenes.find(scene => scene.id === id);
  if (!source) throw new ToolError(`No scene "${id}".`);
  asScreenScene(source);
  for (const target of ids ?? []) if (!project.scenes.some(scene => scene.id === target)) throw new ToolError(`No scene "${target}".`);
  const eligible = [], skipped = [];
  for (const scene of project.scenes) {
    if (scene.id === id || ids && !ids.includes(scene.id)) continue;
    if (!ids && scene.kind !== 'screen' && !isRecording(scene)) continue;
    const issue = screenConversionIssue(scene);
    if (issue) skipped.push({ id: scene.id, reason: issue });
    else eligible.push({ id: scene.id, converts: scene.kind !== 'screen' });
  }
  return { source: id, eligible, skipped };
}
function framingWarnings(scenes) {
  const view = (scene) => { try { const next = toV2(scene); return next.kind === 'screen' && next.screen ? next : null; } catch { return null; } };
  return scenes.map(view).flatMap((b, index, all) => {
    const a = all[index - 1];
    if (!a || !b) return [];
    const studio = a.screen.presentation === 'studio' && b.screen.presentation === 'studio';
    const values = { padding: (s) => studio ? s.padding ?? .13 : 0, size: (s) => s.size ?? 1, frame: (s) => s.frame ?? 'none' };
    const differ = Object.entries(values).filter(([, get]) => get(a.screen) !== get(b.screen)).map(([key, get]) => `${key} ${get(a.screen)} vs ${get(b.screen)}`);
    return differ.length ? [`Screen shots "${a.id}" and "${b.id}" differ in ${differ.join(', ')}; screen_match makes them consistent.`] : [];
  });
}

export const TOOLS = [
  defineTool({
    name: 'project_get',
    description: 'Read the project: output settings, theme, assets and every scene with its fingerprint. Start here. Scenes omit template snapshots and component internals (summarized: true); read one with scene_get, or pass detail "full".',
    input: z.object({ detail: z.enum(['summary', 'full']).optional() }),
    async run({ root, readText, fingerprint }, { detail = 'summary' } = {}) {
      const project = await loadProject(root);
      const scenes = await Promise.all(project.scenes.map(async (scene) => ({ ...(detail === 'full' ? scene : sceneSummary(scene)), fingerprint: scene.file ? fingerprint(await readText(scene.file)) : undefined })));
      return { ...publicProject(project), scenes, manifestFingerprint: fingerprint(await readText('project.json')) };
    },
  }),
  defineTool({
    name: 'scene_get',
    description: 'Read one scene as saved.',
    input: z.object({ id: sceneId }),
    async run({ root, readText, fingerprint }, { id }) {
      const scene = (await loadProject(root)).scenes.find((entry) => entry.id === id);
      if (!scene) throw new ToolError(`No scene "${id}".`);
      return { ...scene, fingerprint: scene.file ? fingerprint(await readText(scene.file)) : undefined };
    },
  }),
  defineTool({
    name: 'catalog',
    description: 'List everything a scene can use: scene presets, camera moves, easings, themes, background styles, text templates and transitions. Pass include ["screenScene"] for the screen-scene JSON Schema.',
    input: z.object({ include: z.array(z.enum(['screenScene'])).optional() }),
    run: (_, { include = [] } = {}) => ({
      presets: PRESET_NAMES, sceneKinds: ['screen'], cameraMoves: CAMERA_MOTIONS, easings: EASINGS,
      themes: THEME_OPTIONS.map((theme) => ({ ...theme, mode: resolveTheme(theme.id).mode ?? (theme.id === 'navy-dark' ? 'dark' : 'light') })),
      backgrounds: BACKGROUND_STYLES, textTemplates: TEXT_TEMPLATES, transitions: TRANSITION_TYPES,
      backgroundPacks: BACKGROUND_PACK.map(({ id, label, mode }) => ({ id, label, mode })),
      brandKits: BRAND_KITS.map(({ id, name }) => ({ id, name })),
      ...(include.includes('screenScene') ? { screenScene: sceneJsonSchema() } : {}),
    }),
  }),
  defineTool({
    name: 'validate',
    description: 'Validate the saved project: errors block rendering; warnings are advice, e.g. adjacent screen shots whose padding, size or frame differ.',
    async run({ root }) { const project = await loadProject(root); return { ...validateProject(project), warnings: framingWarnings(project.scenes ?? []) }; },
  }),
  defineTool({
    name: 'style_set',
    description: 'Save project style memory for theme choices, pacing and default look. Future templates and variations read it.',
    mutates: true,
    input: z.object({ themes:z.array(z.string()).max(3).optional(), pacing:z.enum(['measured','balanced','energetic']).optional(), look:z.enum(['neutral','cinematic']).optional() }),
    summary:()=> 'Update project style',
    async run({ tx },input){
      for(const theme of input.themes??[])resolveTheme(theme);
      const manifest=await tx.readJson('project.json');
      const style={...manifest.style,...input};
      tx.writeJson('project.json',{...manifest,style});
      return style;
    },
  }),
  defineTool({
    name: 'quality_review',
    description: 'Run heuristic checks from the review rules and render start/middle/settled frames with a rubric. It does not judge images: empty findings mean no heuristic warnings, not visual approval, so inspect the frames yourself. A scene unchanged since its frames were last reviewed returns unchanged without frames; pass force to render them anyway.',
    input: z.object({ id:sceneId, force:z.boolean().optional() }),
    async run({root},{id,force=false}){
      const project=await loadProject(root),scene=project.scenes.find(item=>item.id===id);
      if(!scene)throw new ToolError(`No scene "${id}".`);
      // Frames of an unchanged scene were already seen; skipping them saves the render and the image tokens.
      const current=await sceneFingerprint(project,scene).catch(()=>null),statePath=path.join(root,'.runtime','reviews','state.json');
      const state=JSON.parse(await readFile(statePath,'utf8').catch(()=>'{}'));
      const reviews=(project.reviews??[]).filter(review=>current&&review.fingerprints?.[id]===current).map(review=>review.id);
      if(!force&&current&&(reviews.length||state[id]===current))return {id,unchanged:true,reviews,findings:styleChecks(scene,project),images:[],note:'Unchanged since its frames were last reviewed, so none were rendered. Pass force: true to see them again.'};
      const frames=[.12,.5,.84].map(at=>Math.round((scene.durationFrames-1)*at));
      const images=[];
      for(const frame of frames){
        const outputPath=path.join(root,'.runtime','reviews',`${id}-${frame}.png`);
        await renderFrameImage(root,{sceneId:id,frame,width:640,outputPath});
        images.push({frame,path:outputPath,url:`/project-assets/.runtime/reviews/${id}-${frame}.png`});
      }
      if(current){await mkdir(path.dirname(statePath),{recursive:true});await writeFile(statePath,JSON.stringify({...JSON.parse(await readFile(statePath,'utf8').catch(()=>'{}')),[id]:current}));}
      return {id,findings:styleChecks(scene,project),images,reviewStatus:'unreviewed',unverifiedDimensions:['message-proof','composition-text','timing-readability','motion-continuity','brand-platform','originality','technical-delivery','reproducibility'],nextSteps:[{tool:'review_clip',input:{id,startFrame:0,endFrame:Math.min(scene.durationFrames,3*project.output.fps)},purpose:'Inspect continuous motion and reading holds; choose the affected interval.'},...(project.scenes.at(-1)?.id===id?[]:[{tool:'transition_preview',input:{id},purpose:'Inspect the outgoing boundary using assembly timing.'}])],rubric:['Clear focus and hierarchy','Readable copy with a settled hold','Smooth entry and exit','Consistent selected identity and screen framing','No clipped artwork or unsafe overlap']};
    },
  }),
  defineTool({
    name: 'variation_generate',
    description: 'Render three preset directions (current, cinematic, editorial) as cached poster thumbnails without changing the scene. Each includes the whole scene and baseFingerprint; apply one with scene_replace and that fingerprint.',
    input:z.object({id:sceneId}),
    async run({root,readText,fingerprint},{id}){
      const project=await loadProject(root),entry=project.scenes.find(item=>item.id===id);
      if(!entry)throw new ToolError(`No scene "${id}".`);
      if(!entry.file)throw new ToolError('Move this scene to a scene file before generating variations.');
      // The fingerprint must describe the captured scene, not a later live read.
      const raw=await readText(entry.file),scene={...entry,...JSON.parse(raw),id:entry.id,file:entry.file};
      const baseFingerprint=fingerprint(raw);
      const variants=sceneVariations(scene,project),result=[];
      for(const variant of variants){
        const stamp=(await sceneFingerprint(project,variant.scene)).slice(0,12);
        const file=`.runtime/posters/variation-${id}-${variant.id}-${stamp}.png`;
        const outputPath=path.join(root,file);
        if(!(await stat(outputPath).catch(()=>null))?.isFile())await renderFrameImage(root,{sceneOverride:variant.scene,frame:Math.round((scene.durationFrames-1)*.55),width:480,outputPath});
        result.push({id:variant.id,label:variant.label,scene:variant.scene,baseFingerprint,file,path:outputPath,url:`/project-assets/${file}`});
      }
      return result;
    },
  }),
  defineTool({
    name: 'template_poster',
    description: 'Render and cache one gallery poster for a template in this project; the cache follows scene assets, output, theme and renderer changes.',
    input: z.object({ template: templateId }),
    async run({ root }, { template }) {
      const project = await loadProject(root);
      const item = (await listTemplates(project)).find((entry) => entry.id === template);
      if (!item) throw new ToolError(`Unknown template "${template}".`);
      let scene;
      try { scene = instantiateTemplate(item, { assets: project.assets, fps: project.output.fps, preview: true }); }
      catch (error) { throw new ToolError(error.message); }
      const stamp = (await sceneFingerprint(project, scene)).slice(0, 16);
      const file = `.runtime/posters/${template.replace(/[^a-z0-9-]/g, '-')}-${stamp}.png`, outputPath = path.join(root, file);
      if ((await stat(outputPath).catch(() => null))?.isFile()) return { file, url: `/project-assets/${file}`, cached: true };
      await renderFrameImage(root, { sceneOverride: scene, frame: Math.round((scene.durationFrames - 1) * .55), width: 480, outputPath });
      return { file, url: `/project-assets/${file}`, cached: false };
    },
  }),
  defineTool({
    name: 'animation_plugin_list',
    description: 'List installed open-source animation engines, versions, license, source and authoring skills. Add one with template_apply and template plugin-<id>.',
    run: () => ANIMATION_PLUGINS,
  }),
  defineTool({
    name: 'template_list',
    description: 'List reusable scene templates with editable text/asset slots and duration and intensity controls. Filter by category; preview true adds the template scene and a sample scene for gallery previews.',
    input: z.object({ category: z.string().optional(), preview: z.boolean().optional() }),
    async run({ root }, { category, preview = false } = {}) {
      const project = await loadProject(root), templates = (await listTemplates(project)).filter((item) => !category || item.category === category);
      // Agents choose from the summary; only the gallery needs the built scenes.
      if (!preview) return templates.map(({ id, label, category, description, slots, controls, origin }) => ({ id, label, category, description, slots, controls, origin: origin && { package: origin.package, version: origin.version } }));
      return templates.map((item) => {
        let previewScene = null;
        try { previewScene = instantiateTemplate(item, { assets: project.assets, fps: project.output.fps, preview: true }); } catch { /* A project without media still lists the template. */ }
        return { ...item, previewScene };
      });
    },
  }),
  defineTool({
    name: 'template_apply',
    description: 'Create a scene from a library template, filling validated slots and mapping duration, intensity and theme. This is one undoable edit.',
    mutates: true,
    input: z.object({ template: templateId, id: sceneId, slots: z.record(z.string(), z.string()).optional(), duration: z.enum(['short', 'medium', 'long']).optional(), intensity: z.number().min(.5).max(1.5).optional(), theme: z.string().optional(), color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), controls: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(), index: z.int().min(0).optional() }),
    summary: ({ template, id }) => `Apply ${template} as ${id}`,
    async run({ tx }, { template, id: newId, slots, duration, intensity, theme, color, controls, index }) {
      const project = await tx.project();
      const item = (await listTemplates(project)).find((entry) => entry.id === template);
      if (!item) throw new ToolError(`Unknown template "${template}".`);
      let scene;
      try { scene = instantiateTemplate(item, { id: newId, slots, duration, intensity, theme, color, controls, style: project.style, fps: project.output.fps, assets: project.assets }); }
      catch (error) { throw new ToolError(error.message); }
      return insertScene(tx, scene, index);
    },
  }),
  defineTool({
    name: 'background_list',
    description: 'List packaged backgrounds, their modes, safe areas, colors, paired theme tokens and preview URLs.',
    run: () => BACKGROUND_PACK.map(({ relativeFile, themeId, ...item }) => item),
  }),
  defineTool({
    name: 'background_apply',
    description: 'Apply a library background and its paired theme to one scene in a single undoable change.',
    mutates: true,
    input: z.object({ id: sceneId, background: z.string().min(1) }),
    summary: ({ id, background }) => `Set ${background} on ${id}`,
    run: ({ tx }, { id, background }) => {
      const item = getPackBackground(background);
      if (!item) throw new ToolError(`Unknown background "${background}".`);
      return editScene(tx, id, (scene) => ({ ...scene, theme: item.themeId, background: { ...scene.background, style: scene.background?.style ?? 'static', image: background } }));
    },
  }),
  defineTool({
    name: 'skill_list',
    description: 'List the production skills (name and when to use each). Read one with skill_get only when the task needs it.',
    async run() { return Promise.all((await readdir(path.join(HARNESS_ROOT, 'skills'))).sort().map(async (name) => ({ name, description: frontmatter(await readFile(path.join(HARNESS_ROOT, 'skills', name, 'SKILL.md'), 'utf8')).description }))); },
  }),
  defineTool({
    name: 'skill_get',
    description: 'Read one skill, or one of its linked reference files, e.g. {name:"animation-engines"} or {name:"video-production", reference:"references/editing-and-pacing.md"}.',
    input: z.object({ name: id, reference: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+\.md$/).optional() }),
    async run(_context, { name, reference }) {
      const file = path.join(HARNESS_ROOT, 'skills', name, reference ?? 'SKILL.md');
      try { return { name, reference: reference ?? null, text: await readFile(file, 'utf8') }; }
      catch { throw new ToolError(`No ${reference ?? 'skill'} "${reference ?? name}". Use skill_list.`); }
    },
  }),
  defineTool({
    name: 'brand_kit_list',
    description: 'List installed brand kits: themes, backgrounds, logos, fonts and bookends. Use brand_kit_get for one kit\'s guidelines.',
    run: () => BRAND_KITS.map(summarizeKit),
  }),
  defineTool({
    name: 'brand_kit_get',
    description: 'Read one brand kit in full, including its guidelines. Call once before styling a project that uses the kit.',
    input: z.object({ id: z.string().min(1) }),
    async run(_context, { id }) {
      const kit = getBrandKit(id);
      if (!kit) throw new ToolError(`Unknown brand kit "${id}".`);
      return { ...summarizeKit(kit), logoPlacement: kit.logoPlacement, themes: kit.themes.map((theme) => ({ ...theme, id: `${kit.id}-${theme.id}` })), guidelines: kit.guidelines ? await readFile(path.join(HARNESS_ROOT, brandFile(kit.id, kit.guidelines)), 'utf8') : null };
    },
  }),
  defineTool({
    name: 'brand_bookend_apply',
    description: 'Add, replace or remove the brand kit intro or outro clip chosen by the user. The clip is copied into project assets as a full-screen shot.',
    mutates: true,
    input: z.object({ role: z.enum(['intro', 'outro']), bookend: z.string().min(1).describe('Bookend id from the project brand kit, or "none".') }),
    summary: ({ role, bookend }) => `Set ${role}: ${bookend}`,
    async run({ tx }, { role, bookend }) {
      const manifest = await tx.readJson('project.json'), sceneId = `brand-${role}`;
      const current = manifest.scenes.find((entry) => entry.id === sceneId);
      if (bookend === 'none') {
        if (current?.file) tx.remove(current.file);
        tx.writeJson('project.json', { ...manifest, scenes: manifest.scenes.filter((entry) => entry.id !== sceneId) });
        return { role, sceneId: null };
      }
      const kit = getBrandKit(manifest.brand);
      if (!kit) throw new ToolError('Choose a brand kit for the project first (project_update brand).');
      const item = kit.bookends.find((entry) => entry.id === bookend && entry.role === role);
      if (!item) throw new ToolError(`Brand kit "${kit.id}" has no ${role} "${bookend}".`);
      const asset = `${kit.id}-${item.id}`;
      if (!manifest.assets?.[asset]) {
        const relative = `assets/${asset}.mp4`;
        await tx.importFile(relative, path.join(HARNESS_ROOT, brandFile(kit.id, item.file)));
        manifest.assets = { ...manifest.assets, [asset]: relative };
      }
      const scene = { id: sceneId, kind: 'screen', durationFrames: Math.round(item.seconds * manifest.output.fps), screen: { asset, presentation: 'fullscreen', fit: 'contain' }, camera: { shots: [{ at: 0 }] }, brand: 'none' };
      const file = current?.file ?? `scenes/${sceneId}.json`;
      tx.writeJson(file, scene);
      if (!current) role === 'intro' ? manifest.scenes.unshift({ id: sceneId, file }) : manifest.scenes.push({ id: sceneId, file });
      tx.writeJson('project.json', manifest);
      return { role, sceneId, asset };
    },
  }),
  defineTool({
    name: 'project_update',
    description: 'Change project-wide settings: name, default theme or brand kit ("none" removes the logo overlay).',
    mutates: true,
    input: z.object({ name: z.string().min(1).optional(), theme: z.string().optional(), brand: z.string().min(1).optional().describe('Brand kit id from brand_kit_list, or "none".'), fingerprint: z.string().optional().describe('manifestFingerprint from project_get; rejects the change if project.json changed since.') }),
    summary: (input) => `Update project ${Object.keys(input).filter((key) => key !== 'fingerprint').join(', ')}`,
    async run({ tx, fingerprint }, { fingerprint: expected, ...changes }) {
      if (expected && fingerprint(await tx.read('project.json')) !== expected) throw new ToolError('project.json changed since it was loaded. Reload before saving.');
      tx.writeJson('project.json', { ...await tx.readJson('project.json'), ...changes });
      return changes;
    },
  }),
  defineTool({
    name: 'scene_create',
    description: 'Add a scene. For a screen recording shot use {id, kind:"screen", durationFrames, screen:{asset}, camera:{shots:[...]}} (see catalog.screenScene); other scenes use a preset.',
    mutates: true,
    input: z.object({ scene: z.looseObject({ id }), index: z.int().min(0).optional().describe('Position in the scene order; defaults to the end.') }),
    summary: ({ scene }) => `Create ${scene.id}`,
    run: ({ tx }, { scene, index }) => insertScene(tx, storedScene(scene), index),
  }),
  defineTool({
    name: 'scene_update',
    description: 'Change part of a scene with a JSON merge patch: nested objects merge, arrays and values replace, null deletes a key. Example: {"id":"intro","patch":{"durationFrames":96,"theme":null}}.',
    mutates: true,
    input: z.object({ id: sceneId, patch: z.record(z.string(), z.any()) }),
    summary: ({ id }) => `Edit ${id}`,
    run: ({ tx }, { id, patch }) => editScene(tx, id, (scene) => mergePatch(scene, patch)),
  }),
  defineTool({
    name: 'scene_replace',
    description: 'Replace a whole scene. Pass the fingerprint from project_get/scene_get to reject the save if the file changed since.',
    mutates: true,
    input: z.object({ id: sceneId, scene: z.looseObject({}), fingerprint: z.string().optional() }),
    summary: ({ id }) => `Save ${id}`,
    async run({ tx, fingerprint }, { id, scene, fingerprint: expected }) {
      if (scene.summarized) throw new ToolError('This scene is the project_get summary. Read it with scene_get, edit that, then replace.');
      const { entry } = await entryFor(tx, id);
      if (expected && fingerprint(await tx.read(entry.file)) !== expected) throw new ToolError('Scene changed outside the preview. Reload it before saving.');
      const next = await editScene(tx, id, () => storedScene(scene));
      return { fingerprint: fingerprint(`${JSON.stringify(next, null, 2)}\n`) };
    },
  }),
  defineTool({
    name: 'scene_delete',
    description: 'Remove a scene and its file.',
    mutates: true,
    input: z.object({ id: sceneId }),
    summary: ({ id }) => `Delete ${id}`,
    async run({ tx }, { id }) {
      const { manifest, entry } = await entryFor(tx, id);
      manifest.scenes = manifest.scenes.filter((scene) => scene.id !== id);
      tx.writeJson('project.json', manifest); tx.remove(entry.file);
      return { deleted: id };
    },
  }),
  defineTool({
    name: 'scene_duplicate',
    description: 'Copy a scene under a new id, placed right after the original unless index is given.',
    mutates: true,
    input: z.object({ id: sceneId, newId: id, index: z.int().min(0).optional() }),
    summary: ({ id, newId }) => `Duplicate ${id} as ${newId}`,
    async run({ tx }, { id, newId, index }) {
      const { manifest, entry } = await entryFor(tx, id);
      return insertScene(tx, { ...await tx.readJson(entry.file), id: newId }, index ?? manifest.scenes.indexOf(entry) + 1);
    },
  }),
  defineTool({
    name: 'scene_reorder',
    description: 'Set the scene order. Pass every scene id exactly once.',
    mutates: true,
    input: z.object({ order: z.array(sceneId).min(1) }),
    summary: () => 'Reorder scenes',
    async run({ tx }, { order }) {
      const manifest = await tx.readJson('project.json'), ids = manifest.scenes.map((scene) => scene.id);
      if (order.length !== ids.length || new Set(order).size !== order.length || order.some((item) => !ids.includes(item))) throw new ToolError(`order must list each scene once: ${ids.join(', ')}.`);
      manifest.scenes = order.map((item) => manifest.scenes.find((scene) => scene.id === item));
      tx.writeJson('project.json', manifest);
      return { order };
    },
  }),
  defineTool({
    name: 'camera_set_shots',
    description: 'Set the camera path of a screen shot. Each shot: {at: 0–1 time, focus?: [x,y] center on the recording, zoom?: 1–4, pose?: 3D offset, ease?}. Omit focus/zoom for the full view; repeat a framing to hold it. Converts legacy recording scenes to the screen model.',
    mutates: true,
    input: z.object({ id: sceneId, shots: z.array(Shot).min(1), ease: z.enum(EASINGS).optional(), flow: z.boolean().optional() }),
    summary: ({ id, shots }) => `Set ${shots.length} camera shots on ${id}`,
    run: ({ tx }, { id, shots, ease, flow }) => editScene(tx, id, (scene) => {
      const next = asScreenScene(scene), { move, ...rest } = next.camera ?? {}, camera = { ...rest, shots: [...shots].sort((a, b) => a.at - b.at) };
      if (ease) camera.ease = ease;
      if (flow !== undefined) camera.flow = flow;
      return { ...next, camera };
    }),
  }),
  defineTool({
    name: 'camera_apply_move',
    description: 'Replace the camera path with a ready-made move: focus-zoom (zoom in, hold, return), detail-pan (zoom in, pan from focus to endFocus, return), orbit, tilt-settle, return-full (start zoomed, return).',
    mutates: true,
    input: z.object({ id: sceneId, move: z.enum(CAMERA_MOTIONS), focus: unitPoint.optional(), endFocus: unitPoint.optional(), zoom: z.number().min(1).max(4).optional(), strength: z.number().min(.1).max(1.5).optional() }),
    summary: ({ id, move }) => `Apply ${move} to ${id}`,
    run: ({ tx }, { id, move, focus, endFocus, zoom, strength }) => editScene(tx, id, (scene) => {
      const next = asScreenScene(scene);
      const shots = cameraShots({ preset: move, focusX: focus?.[0], focusY: focus?.[1], endFocusX: endFocus?.[0], endFocusY: endFocus?.[1], scale: zoom, strength }, next.durationFrames);
      return { ...next, camera: { ...next.camera, shots, move: { preset: move, ...(strength === undefined ? {} : { strength }) } } };
    }),
  }),
  defineTool({
    name: 'camera_frame_areas',
    description: 'Replace the path with evenly paced areas. Each area: {focus:[x,y], zoom:1–4, hold?:0–10}. Hold is in travel-time units (default 1.5); 0 passes through and enables flow. This explicitly resets custom point timings and poses.',
    mutates: true,
    input: z.object({ id: sceneId, areas: z.array(z.object({ focus: unitPoint, zoom: z.number().min(1).max(4), hold: z.number().min(0).max(10).optional() })).min(1), startFull: z.boolean().optional(), returnToFull: z.boolean().optional() }),
    summary: ({ id, areas }) => `Frame ${areas.length} area${areas.length === 1 ? '' : 's'} on ${id}`,
    run: ({ tx }, { id, areas, startFull, returnToFull }) => editScene(tx, id, (scene) => {
      const next = asScreenScene(scene), { move, ...camera } = next.camera ?? {};
      return { ...next, camera: { ...camera, ...(areas.some(area=>area.hold===0)?{flow:true}:{}), shots: shotsFromStops(areas, { startFull, returnToFull }) } };
    }),
  }),
  defineTool({
    name: 'camera_style',
    description: 'Change how the camera travels without touching its shots: ease (default easing of every move), flow (true glides through shots passed on the way instead of stopping at each; holds still pause) and drift (0–1 gentle orbit over the whole shot; 0 removes it). Converts legacy recording scenes to the screen model.',
    mutates: true,
    input: z.strictObject({ id: sceneId, ...Camera.pick({ ease: true, flow: true, drift: true }).shape }).refine((input) => ['ease', 'flow', 'drift'].some((key) => input[key] !== undefined), 'set ease, flow or drift'),
    summary: ({ id, ...style }) => `Restyle camera on ${id}: ${Object.entries(style).map(([key, value]) => `${key} ${value}`).join(', ')}`,
    run: ({ tx }, { id, ease, flow, drift }) => editScene(tx, id, (scene) => {
      const next = asScreenScene(scene), camera = { ...next.camera };
      if (ease) camera.ease = ease;
      if (flow !== undefined) { if (flow) camera.flow = true; else delete camera.flow; }
      if (drift !== undefined) { if (drift) camera.drift = drift; else delete camera.drift; }
      return { ...next, camera };
    }),
  }),
  defineTool({
    name: 'screen_set',
    description: 'Change how a screen shot presents its recording: presentation (fullscreen|studio), backdrop, fit, size, tilt [x,y,z] degrees, padding, offset, radius, shadow, frame and frameTitle, lighting, or asset.',
    mutates: true,
    input: Screen.partial().extend({ id: sceneId }),
    summary: ({ id }) => `Restyle screen on ${id}`,
    run: ({ tx }, { id, ...changes }) => editScene(tx, id, (scene) => { const next = asScreenScene(scene); return { ...next, screen: { ...next.screen, ...changes } }; }),
  }),
  defineTool({
    name: 'screen_match_preview',
    description: 'Preview eligible screen shots and conversion/skip reasons before matching. Optional ids limits the selection. Makes no changes.',
    input: z.object({ id: sceneId, ids: z.array(sceneId).optional() }),
    run: async ({ root }, { id, ids }) => matchPlan(await loadProject(root), id, ids),
  }),
  defineTool({
    name: 'screen_match',
    description: 'Copy the screen look to all eligible shots or selected ids in one undo step, including inline scenes and plain recordings. Preserves assets and playback; scenes with unsupported legacy captions/tracks are skipped with reasons. Use screen_match_preview first.',
    mutates: true,
    input: z.object({ id: sceneId.describe('The screen scene whose look to copy.'), ids: z.array(sceneId).optional() }),
    summary: ({ id }) => `Match every screen to ${id}`,
    async run({ tx }, { id, ids }) {
      const project = await tx.project(), plan = matchPlan(project, id, ids), source = project.scenes.find(scene => scene.id === id);
      const screen = asScreenScene(source).screen, look = Object.fromEntries(LOOK.filter((key) => screen[key] !== undefined).map((key) => [key, screen[key]]));
      const matched = [], skipped = plan.skipped;
      for (const other of plan.eligible) {
        await editScene(tx, other.id, (current) => {
          const next = asScreenScene(current), kept = Object.fromEntries(Object.entries(next.screen).filter(([key]) => !LOOK.includes(key)));
          return { ...next, screen: { ...kept, ...look } };
        });
        matched.push(other.id);
      }
      return { source: id, matched, skipped };
    },
  }),
  defineTool({
    name: 'artwork_import',
    description: 'Import a self-contained SVG or Bodymovin JSON artwork file from its UTF-8 contents. One undoable change.',
    mutates: true,
    input: z.object({ name: id, type: z.enum(['svg','lottie']), content: z.string().min(1).max(2_000_000) }),
    summary: ({ name }) => `Import artwork ${name}`,
    async run({ tx }, { name, type, content }) {
      const manifest=await tx.readJson('project.json');
      if(manifest.assets?.[name])throw new ToolError(`Asset "${name}" already exists.`);
      if(type==='svg'){
        if(!/^\s*<svg[\s>]/i.test(content)||/<\s*(script|foreignObject|iframe)\b|\bon\w+\s*=|javascript:|(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/)/i.test(content))throw new ToolError('SVG must be self-contained and contain no scripts or external links.');
      }else{
        let data;try{data=JSON.parse(content);}catch{throw new ToolError('Bodymovin file is not valid JSON.');}
        if(!Number.isFinite(data.fr)||!Number.isFinite(data.ip)||!Number.isFinite(data.op)||!Array.isArray(data.layers)||data.assets?.some(asset=>asset.p&&!String(asset.p).startsWith('data:')))throw new ToolError('Bodymovin JSON must contain frames, layers and only embedded image assets.');
      }
      const relative=`assets/${name}.${type==='svg'?'svg':'json'}`;
      if(await tx.read(relative).then(()=>true,()=>false))throw new ToolError(`${relative} already exists.`);
      tx.writeText(relative,content);
      tx.writeJson('project.json',{...manifest,assets:{...manifest.assets,[name]:relative}});
      return {name,file:relative};
    },
  }),
  defineTool({
    name: 'asset_import',
    description: 'Copy a local image, video, SVG or Bodymovin JSON into project assets and register it under a name.',
    mutates: true,
    input: z.object({ source: z.string().min(1).describe('Absolute path of the file to import.'), name: id.describe('Asset name scenes will use.') }),
    summary: ({ name }) => `Import asset ${name}`,
    async run({ tx, file }, { source, name }) {
      const manifest = await tx.readJson('project.json'), relative = `assets/${path.basename(source)}`, target = file(relative);
      if (manifest.assets?.[name]) throw new ToolError(`Asset "${name}" already exists.`);
      if (!(await stat(source).catch(() => null))?.isFile()) throw new ToolError(`No file at ${source}.`);
      if (await stat(target).catch(() => null)) { if (await hashFile(target) !== await hashFile(source)) throw new ToolError(`${relative} already exists with different content.`); }
      else await tx.importFile(relative, source);
      tx.writeJson('project.json', { ...manifest, assets: { ...manifest.assets, [name]: relative } });
      return { name, file: relative };
    },
  }),
  defineTool({ name: 'history_list', description: 'List recent changes; entries before the cursor can be undone.', run: ({ runner }) => runner.history() }),
  defineTool({ name: 'history_undo', description: 'Undo the most recent change, optionally guarded by its history entry id.', input: z.object({ entryId: z.string().min(1).optional() }), run: ({ runner }, input) => runner.undo(input) }),
  defineTool({ name: 'history_redo', description: 'Redo the most recently undone change, optionally guarded by its history entry id.', input: z.object({ entryId: z.string().min(1).optional() }), run: ({ runner }, input) => runner.redo(input) }),
  defineTool({
    name: 'render_frame',
    description: 'Render one frame of a saved scene to a PNG so you can inspect it. Choose frame (index) or at (0–1). To check small text, pass region instead of a larger width.',
    input: z.object({
      id: sceneId, frame: z.int().min(0).optional(), at: z.number().min(0).max(1).optional(),
      width: z.int().min(160).max(3840).optional().describe('Output width (default 960 for the whole frame; a region defaults to its native size).'),
      region: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().gt(0).max(1), height: z.number().gt(0).max(1) })
        .refine((r) => r.x + r.width <= 1.0001 && r.y + r.height <= 1.0001, 'region must lie inside the frame').optional()
        .describe('Crop as fractions of the frame, rendered at native resolution.'),
    }),
    async run({ root }, { id, frame, at, region, width = region ? undefined : 960 }) {
      const scene = (await loadProject(root)).scenes.find((entry) => entry.id === id);
      if (!scene) throw new ToolError(`No scene "${id}".`);
      const index = frame ?? Math.round((at ?? 0) * (scene.durationFrames - 1));
      if (index >= scene.durationFrames) throw new ToolError(`Frame must be 0–${scene.durationFrames - 1}.`);
      const crop = region ? `-r${[region.x, region.y, region.width, region.height].map((value) => Math.round(value * 1000)).join('-')}` : '';
      return renderFrameImage(root, { sceneId: id, frame: index, width, region, outputPath: path.join(root, '.runtime', 'frames', `${id}-${index}${crop}.png`) });
    },
  }),
  defineTool({
    name: 'render_preview',
    description: 'Render a short silent sample with the saved motion blur quality, without replacing final clips or their caches. Returns a local playable URL.',
    input: z.object({ id: sceneId, at: z.number().min(0).max(1).optional(), seconds: z.number().min(.1).max(3).optional(), width: z.int().min(160).max(1280).optional() }),
    run: ({ root, emit, signal }, { id, ...options }) => renderPreview(root, { sceneId: id, ...options, signal, onProgress: detail => emit({type:'progress',...detail}) }),
  }),
  defineTool({
    name: 'transition_preview',
    description: 'Render a short silent clip across the boundary from a shot into the next one, joined by the same FFmpeg transition graph and overlap as assemble, with up to one second either side (never frames a neighbouring transition blends). Returns a playable URL and the source scene fingerprints; changes nothing.',
    input: z.object({ id: sceneId.describe('The outgoing shot; its transition leads into the next shot.'), width: z.int().min(160).max(1280).optional() }),
    run: ({ root, emit, signal }, { id, width }) => renderTransitionPreview(root, { sceneId: id, width, signal, onProgress: detail => emit({ type: 'progress', ...detail }) }),
  }),
  defineTool({
    name: 'render_scene',
    description: 'Render saved scenes to silent MP4 clips (cached when unchanged). Omit id to render all.',
    input: z.object({ id: sceneId.optional(), force: z.boolean().optional() }),
    run: ({ root, emit, signal }, { id, force }) => renderProject(root, { onlyScene: id, force, signal, onProgress: (detail) => emit({ type: 'progress', ...detail }) }),
  }),
  defineTool({ name: 'assemble', description: 'Join rendered clips into the final silent MP4. Refuses a shot whose clip is missing or older than the saved scene; render_scene first.', run: ({ root }) => assembleProject(root) }),
  defineTool({ name: 'review_contact_sheet', description: 'Make a contact sheet of the assembled video and confirm it is silent.', run: ({ root }) => createContactSheet(root) }),
];
