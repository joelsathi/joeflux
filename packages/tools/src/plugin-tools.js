import { z } from 'zod';
import { loadProject } from '../../core/src/io.js';
import { discoverLocalPackage } from '../../plugins/src/discovery.js';
import { createRegistry } from '../../plugins/src/registry.js';
import { defineTool, ToolError } from './runner.js';
import { applyTemplateControls } from '../../presets/src/template-controls.js';
import { editScene } from './scene-edits.js';

export function projectPackages(project, { includeDisabled = false } = {}) {
  const disabled = new Set(project.pluginLock?.disabled ?? []);
  return (project.pluginLock?.packages ?? []).filter(pack => includeDisabled || !disabled.has(pack.manifest.id));
}

export function pluginStatus(project) {
  const packages = projectPackages(project, { includeDisabled: true });
  const disabled = new Set(project.pluginLock?.disabled ?? []);
  const findings = [];
  for (const scene of project.scenes ?? []) {
    const origin = scene.templateInstance;
    if (!origin || origin.package === 'harness/core') continue;
    const pack = packages.find(item => item.manifest.id === origin.package);
    const status = !pack ? 'missing' : disabled.has(origin.package) ? 'disabled' : pack.digest !== origin.digest || pack.manifest.version !== origin.version ? 'version-mismatch' : null;
    if (status) findings.push({ scene: scene.id, package: origin.package, status, message: `The saved ${origin.version} instance is retained; its resolved scene remains available. Saved controls remain editable; reinstall its pinned package to create matching new instances.` });
  }
  return { packages: packages.map(pack => ({ id: pack.manifest.id, version: pack.manifest.version, digest: pack.digest, enabled: !disabled.has(pack.manifest.id) })), findings };
}

export const PLUGIN_TOOLS = [
  defineTool({
    name: 'template_set_control',
    description: 'Edit one declared control on a saved template instance, preserving all component layers, inputs and unrelated overrides. Uses the pinned definition even when its package is unavailable.',
    input: z.object({ id: z.string().min(1), control: z.string().min(1), value: z.union([z.string(), z.number(), z.boolean()]) }), mutates: true,
    summary: ({ control }) => `Set template ${control}`,
    async run({ tx }, { id, control, value }) {
      const project = await tx.readJson('project.json');
      return editScene(tx, id, scene => {
        const fields = scene.templateInstance?.definition?.controls?.fields;
        if (!fields?.some(field => field.id === control)) throw new ToolError(`Unknown saved template control ${control}.`);
        return applyTemplateControls(scene, fields.filter(field => field.id === control), { [control]: value }, project.assets);
      });
    },
  }),
  defineTool({
    name: 'plugin_install',
    description: 'Install a local MIT data-only template package into this project as an immutable, portable snapshot. Executable entry points are rejected. Installation is one undoable change.',
    input: z.object({ directory: z.string().min(1) }), mutates: true,
    summary: () => 'Install local template package',
    async run({ tx }, { directory }) {
      const resolved = await discoverLocalPackage(directory);
      const manifest = await tx.readJson('project.json');
      const previous = manifest.pluginLock ?? { version: 1, packages: [], disabled: [] };
      const packages = [...previous.packages.filter(pack => pack.manifest.id !== resolved.manifest.id), resolved];
      const disabled = previous.disabled.filter(id => id !== resolved.manifest.id);
      const registry = createRegistry({ packages: packages.filter(pack => !disabled.includes(pack.manifest.id)) });
      tx.writeJson('project.json', { ...manifest, pluginLock: { version: 1, packages, disabled, generation: registry.generation } });
      return { id: resolved.manifest.id, version: resolved.manifest.version, digest: resolved.digest, templates: resolved.templates.map(template => template.id) };
    },
  }),
  defineTool({
    name: 'plugin_enable',
    description: 'Enable or disable an installed data package. Disabled contributions disappear from discovery; authored instances and their resolved rendering data are preserved.',
    input: z.object({ id: z.string().min(1), enabled: z.boolean() }), mutates: true,
    summary: ({ id, enabled }) => `${enabled ? 'Enable' : 'Disable'} ${id}`,
    async run({ tx }, { id, enabled }) {
      const manifest = await tx.readJson('project.json'), lock = manifest.pluginLock;
      if (!lock?.packages.some(pack => pack.manifest.id === id)) throw new ToolError(`Package ${id} is not installed.`);
      const disabled = [...new Set(enabled ? lock.disabled.filter(item => item !== id) : [...lock.disabled, id])];
      const registry = createRegistry({ packages: lock.packages.filter(pack => !disabled.includes(pack.manifest.id)) });
      tx.writeJson('project.json', { ...manifest, pluginLock: { ...lock, disabled, generation: registry.generation } });
      return { id, enabled };
    },
  }),
  defineTool({ name: 'plugin_status', description: 'Inspect installed versions and unavailable dependencies without executing package code or removing authored data.', async run({ root }) { return pluginStatus(await loadProject(root)); } }),
];
