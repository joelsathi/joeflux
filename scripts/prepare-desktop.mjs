import { copyRuntimeDirectory } from '../packages/desktop/resources.js';
import { assertRedistributableMedia } from '../packages/desktop/media-license.js';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile, chmod, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
if (process.platform !== 'darwin') throw new Error('The initial desktop package supports macOS. Build it on macOS.');
const runtime = path.join(root, '.desktop/runtime');
const browsers = path.join(runtime, 'browsers');
await mkdir(browsers, { recursive: true });
const ffmpeg = require('ffmpeg-static');
const ffprobe = require('@ffprobe-installer/ffprobe').path;
const mediaAudit = {};
for (const [name, source] of Object.entries({ ffmpeg, ffprobe })) {
  const target = path.join(runtime, name);
  await cp(source, target); await chmod(target, 0o755);
  // Reject accidental Homebrew-linked binaries that only work on the build host.
  const libraries = execFileSync('otool', ['-L', target], { encoding: 'utf8' });
  if (/\/(opt\/homebrew|usr\/local|Users)\//.test(libraries.split('\n').slice(1).join('\n'))) throw new Error(`${name} depends on local libraries; use a standalone binary.`);
  execFileSync(target, ['-version']);
  const inspect = flag => execFileSync(target, ['-hide_banner', flag], {encoding:'utf8'});
  const audit = {buildConfiguration:inspect('-buildconf'),licenseOutput:inspect('-L'),sha256:createHash('sha256').update(await readFile(target)).digest('hex')};
  assertRedistributableMedia(name,audit);
  mediaAudit[name]=audit;
}
const playwright = require('playwright-core');
const executable = playwright.chromium.executablePath();
// Copy an already-installed matching browser when possible; otherwise install into resources.
const browserDirectory = path.resolve(executable, '../../../../..');
const playwrightRoot = path.dirname(require.resolve('playwright-core/package.json'));
const metadata = JSON.parse(await readFile(path.join(playwrightRoot, 'browsers.json'), 'utf8'));
const revision = metadata.browsers.find(browser => browser.name === 'chromium').revision;
const destination = path.join(browsers, `chromium-${revision}`);
if (await stat(executable).then(() => true, () => false)) {
  if (path.basename(browserDirectory) !== `chromium-${revision}`) throw new Error(`Unexpected Chromium layout: ${executable}`);
  await copyRuntimeDirectory(browserDirectory, destination);
} else {
  execFileSync(process.execPath, [path.join(playwrightRoot, 'cli.js'), 'install', 'chromium', '--no-shell'], { stdio: 'inherit', env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsers } });
}
const licenses = path.join(runtime, 'licenses');
await mkdir(licenses, { recursive: true });
await writeFile(path.join(licenses,'media-binary-audit.json'),JSON.stringify(mediaAudit,null,2)+'\n');
await cp(path.join(path.dirname(ffmpeg), 'ffmpeg.LICENSE'), path.join(licenses, 'FFmpeg-LICENSE.txt'));
await cp(path.join(path.dirname(ffmpeg), 'ffmpeg.README'), path.join(licenses, 'FFmpeg-build.txt'));
await cp(path.join(path.dirname(ffprobe), 'README.md'), path.join(licenses, 'FFprobe-README.md'));
await cp(path.join(playwrightRoot, 'LICENSE'), path.join(licenses, 'Playwright-LICENSE.txt'));
const electronDist = path.dirname(path.dirname(path.dirname(path.dirname(require('electron')))));
for (const name of ['LICENSE', 'LICENSES.chromium.html']) {
  await cp(path.join(electronDist, name), path.join(licenses, `Electron-${name}`));
}
await writeFile(path.join(runtime, 'manifest.json'), JSON.stringify({ platform: process.platform, arch: process.arch, chromiumRevision: revision, ffmpegPackage: require('ffmpeg-static/package.json').version, ffprobePackage: require('@ffprobe-installer/ffprobe/package.json').version }, null, 2) + '\n');
console.log(`Desktop runtime prepared for ${process.platform}-${process.arch}: ${runtime}`);
