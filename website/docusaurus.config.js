// @ts-check
import { themes as prismThemes } from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'JoeFlux',
  tagline: 'Silent product videos from editable scenes, directed by you and your AI agent.',
  favicon: 'img/favicon.svg',
  url: 'https://joeflux.example.com',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  markdown: { mermaid: true, hooks: { onBrokenMarkdownLinks: 'throw' } },
  themes: ['@docusaurus/theme-mermaid'],
  i18n: { defaultLocale: 'en', locales: ['en'] },
  presets: [
    ['classic', /** @type {import('@docusaurus/preset-classic').Options} */ ({
      docs: { sidebarPath: './sidebars.js', routeBasePath: 'docs' },
      blog: false,
      theme: { customCss: './src/css/custom.css' },
    })],
  ],
  themeConfig: /** @type {import('@docusaurus/preset-classic').ThemeConfig} */ ({
    image: 'img/screens/studio.png',
    colorMode: { defaultMode: 'dark', respectPrefersColorScheme: true },
    navbar: {
      title: 'JoeFlux',
      logo: { alt: 'JoeFlux', src: 'img/logo.svg' },
      items: [
        { type: 'docSidebar', sidebarId: 'guide', position: 'left', label: 'Guide' },
        { type: 'docSidebar', sidebarId: 'brand', position: 'left', label: 'Brand kits' },
        { type: 'docSidebar', sidebarId: 'architecture', position: 'left', label: 'Architecture' },
        { type: 'docSidebar', sidebarId: 'reference', position: 'left', label: 'Reference' },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        { title: 'Guide', items: [{ label: 'Getting started', to: '/docs/getting-started/installation' }, { label: 'Studio tour', to: '/docs/studio/tour' }, { label: 'After Effects', to: '/docs/motion/after-effects' }] },
        { title: 'Brand kits', items: [{ label: 'Overview', to: '/docs/brand-kits/overview' }, { label: 'brand.json reference', to: '/docs/brand-kits/reference' }] },
        { title: 'Architecture', items: [{ label: 'System overview', to: '/docs/architecture/overview' }, { label: 'Token efficiency', to: '/docs/architecture/token-efficiency' }] },
      ],
      copyright: 'JoeFlux · MIT licensed code. Fonts, media and brand assets keep their own terms.',
    },
    prism: { theme: prismThemes.github, darkTheme: prismThemes.dracula, additionalLanguages: ['bash', 'json'] },
    mermaid: {
      theme: { light: 'base', dark: 'base' },
      options: { themeVariables: { primaryColor: '#221d4a', primaryTextColor: '#ffffff', primaryBorderColor: '#8b7cff', lineColor: '#8b7cff', secondaryColor: '#123a3a', tertiaryColor: '#16182e', clusterBkg: '#14162b', clusterBorder: '#3a3766', edgeLabelBackground: '#14162b', actorBkg: '#221d4a', actorBorder: '#8b7cff', actorTextColor: '#ffffff', signalColor: '#8b7cff', signalTextColor: '#c9c6f5', noteBkgColor: '#123a3a', noteTextColor: '#ffffff', fontFamily: 'Inter, system-ui, sans-serif' } },
    },
  }),
};

export default config;
