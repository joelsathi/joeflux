const path = require('node:path');
const { readFileSync } = require('node:fs');
const runtime = path.join(__dirname, '.desktop/runtime');
// Allowlist resources: never ship personal projects, local configs, caches or tests.
const shipped = ['LICENSE', 'library/knowledge', 'vendor/mattpocock-skills', 'package.json', 'pnpm-lock.yaml', 'node_modules', 'packages', 'apps/studio/dist', 'apps/preview/render.html', 'library/templates', 'brand-kits', 'templates', 'integrations/resolve/adapter', 'skills', 'context', 'THIRD_PARTY_NOTICES.md', 'references/oxygen/LICENSE', 'README.md'];
const signing = process.env.JOEFLUX_SIGN_IDENTITY;
module.exports = {
  packagerConfig: {
    name: 'JoeFlux', appBundleId: 'com.joeflux.studio',
    asar: false, // Browser renderer modules and subprocess resources need real filesystem paths.
    // Packager's default extraResource copy rewrites relative framework links.
    extraResource: [],
    beforeCopyExtraResources: [async ({ buildPath }) => {
      const { copyRuntimeDirectory } = await import('./packages/desktop/resources.js');
      await copyRuntimeDirectory(runtime, path.join(buildPath, 'JoeFlux.app/Contents/Resources/runtime'));
    }],
    ignore: file => {
      const name = file.replace(/^\//, '');
      if (name.split('/').includes('.bin')) return true;
      return Boolean(name) && !shipped.some(allowed => name === allowed || name.startsWith(`${allowed}/`) || allowed.startsWith(`${name}/`));
    },
    ...(signing ? { osxSign: { identity: signing } } : {}),
    ...(process.env.JOEFLUX_NOTARY_PROFILE ? { osxNotarize: { keychainProfile: process.env.JOEFLUX_NOTARY_PROFILE } } : {}),
  },
  makers: [
    { name: '@electron-forge/maker-zip', platforms: ['darwin'] },
  ],
  hooks: {
    prePackage: async (_config, platform, arch) => {
      const manifest = JSON.parse(readFileSync(path.join(runtime, 'manifest.json'), 'utf8'));
      if (platform !== 'darwin' || arch !== manifest.arch) throw new Error('Build on the target macOS architecture; bundled runtime does not match this target.');
      if (!signing) console.warn('Building an unsigned local application. Configure signing/notarization for public distribution.');
    },
  },
};
