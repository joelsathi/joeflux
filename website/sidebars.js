// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  guide: [
    'intro',
    { type: 'category', label: 'Getting started', collapsed: false, items: ['getting-started/installation', 'getting-started/first-video'] },
    { type: 'category', label: 'Studio', collapsed: false, items: ['studio/tour', 'studio/director'] },
    { type: 'category', label: 'Projects', items: ['projects/project-files', 'projects/scenes', 'projects/render-and-review'] },
    { type: 'category', label: 'Templates and motion', items: ['motion/templates', 'motion/compositions', 'motion/terminal', 'motion/animation-plugins', 'motion/after-effects', 'motion/template-packs'] },
    { type: 'category', label: 'Automation', items: ['automation/cli-and-mcp', 'automation/skills'] },
    { type: 'category', label: 'Apps and finishing', items: ['apps/desktop', 'apps/resolve'] },
  ],
  brand: ['brand-kits/overview', 'brand-kits/create-a-kit', 'brand-kits/use-in-a-project', 'brand-kits/reference'],
  architecture: ['architecture/overview', 'architecture/frame-pipeline', 'architecture/tool-layer', 'architecture/agents', 'architecture/brand-kit-registry', 'architecture/token-efficiency'],
  reference: ['reference/commands', 'reference/tools', 'reference/themes', 'reference/licenses'],
};

export default sidebars;
