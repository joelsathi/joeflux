import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
export const bundleRoot = path.join(root, 'packages/animation-plugins/dist');
let pending;
export async function ensureAnimationPlugins() {
  if (pending) return pending;
  pending = buildIfChanged().finally(() => { pending = null; });
  return pending;
}
export async function pluginBuildIdentity(baseRoot = root) {
  const src = path.join(baseRoot, 'packages/animation-plugins/src');
  const files = (await readdir(src)).sort();
  const hash = createHash('sha256');
  for (const file of [...files.map(f => path.join(src, f)), path.join(baseRoot, 'pnpm-lock.yaml'), path.join(baseRoot, 'packages/animation-plugins/licenses/react-three-fiber-LICENSE.txt'), path.join(baseRoot, 'packages/animation-plugins/build.js')]) hash.update(await readFile(file));
  return hash.digest('hex');
}
async function buildIfChanged() {
  const src = path.join(root, 'packages/animation-plugins/src');
  const stamp = await pluginBuildIdentity();
  if (await readFile(path.join(bundleRoot, 'stamp'), 'utf8').catch(() => '') === stamp && await readFile(path.join(bundleRoot, 'runtime.js')).then(() => true, () => false)) return;
  const { build } = await import('esbuild');
  await mkdir(bundleRoot, { recursive: true });
  await build({ entryPoints: [path.join(src, 'runtime.js')], outfile: path.join(bundleRoot, 'runtime.js'), bundle: true, format: 'esm', platform: 'browser', target: 'chrome120', minify: true, legalComments: 'linked', define: { 'process.env.NODE_ENV': '"production"' } });
  const licenses = [];
  // Include licenses for every bundled package, including transitive runtime code.
  const meta = await build({ entryPoints: [path.join(src, 'runtime.js')], bundle: true, format: 'esm', platform: 'browser', write: false, metafile: true, define: { 'process.env.NODE_ENV': '"production"' } });
  const roots = new Set();
  for (const input of Object.keys(meta.metafile.inputs)) {
    if (!input.includes('node_modules/')) continue;
    let directory = path.dirname(path.resolve(input));
    while (directory !== path.dirname(directory)) {
      const pkg = await readFile(path.join(directory, 'package.json'), 'utf8').catch(() => null);
      if (pkg) { roots.add(directory); break; }
      directory = path.dirname(directory);
    }
  }
  for (const directory of [...roots].sort()) {
    const pkg = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
    requireMitLicense(pkg);
    const licenseFile = (await readdir(directory)).find(f => /^licen[cs]e(\.(md|txt))?$/i.test(f));
    if (!licenseFile && pkg.name === '@react-three/fiber') { licenses.push(`${pkg.name}@${pkg.version}\n${await readFile(path.join(root, 'packages/animation-plugins/licenses/react-three-fiber-LICENSE.txt'), 'utf8')}`); continue; }
    if (!licenseFile) throw new Error(`Missing license for bundled ${pkg.name}`);
    licenses.push(`${pkg.name}@${pkg.version}\n${await readFile(path.join(directory, licenseFile), 'utf8')}`);
  }
  await writeFile(path.join(bundleRoot, 'THIRD_PARTY_LICENSES.txt'), licenses.join('\n\n----------\n\n'));
  await writeFile(path.join(bundleRoot, 'stamp'), stamp);
}

export function requireMitLicense(pkg) {
  if (pkg.license !== 'MIT') throw new Error(`Animation plugins require MIT dependencies: ${pkg.name} declares ${pkg.license}`);
}
