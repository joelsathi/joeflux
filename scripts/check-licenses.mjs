// Fails when an installed dependency uses a license outside the approved list.
// Usage: node scripts/check-licenses.mjs [--dir website]
import { execFileSync } from 'node:child_process';

const PERMISSIVE = new Set(['MIT', 'MIT-0', 'ISC', 'BSD', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'Apache-2.0', 'BlueOak-1.0.0', 'CC0-1.0', 'Unlicense', 'Python-2.0']);
// A dual-licensed package is accepted when one of its alternatives is permissive.
const permissive = (license) => license.replace(/[()]/g, '').split(' OR ').some((option) => PERMISSIVE.has(option.trim()));
// Non-permissive packages that are accepted for a stated reason, matched by exact name and license.
const EXCEPTIONS = {
  '@fontsource-variable/inter': ['OFL-1.1', 'Font used by Oxygen UI; OFL permits bundling with software.'],
  'caniuse-lite': ['CC-BY-4.0', 'Browser support data read by build tools; not shipped in renders.'],
  'ffmpeg-static': ['GPL-3.0-or-later', 'Prebuilt FFmpeg binary run as a separate process; retain its license and build source when redistributing.'],
  '@ffprobe-installer/ffprobe': ['LGPL-2.1', 'Prebuilt FFprobe binary run as a separate process.'],
  '@ffprobe-installer/darwin-arm64': ['LGPL-2.1', 'Prebuilt FFprobe binary run as a separate process.'],
  '@ffprobe-installer/darwin-x64': ['LGPL-2.1', 'Prebuilt FFprobe binary run as a separate process.'],
  '@ffprobe-installer/linux-x64': ['LGPL-2.1', 'Prebuilt FFprobe binary run as a separate process.'],
  // Documentation site only (website/); none of these ship with the studio or renders.
  'elkjs': ['EPL-2.0', 'Unmodified Mermaid layout engine that draws documentation diagrams.'],
  'khroma': ['Unknown', 'Package metadata omits the field; its bundled license file is MIT.'],
  'require-like': ['Unknown', 'Package metadata omits the field; its bundled license file is MIT.'],
};

const dir = process.argv.includes('--dir') ? process.argv[process.argv.indexOf('--dir') + 1] : '.';
const report = JSON.parse(execFileSync('pnpm', ['--dir', dir, 'licenses', 'list', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
const problems = [], accepted = [];
for (const [license, packages] of Object.entries(report)) {
  for (const { name, versions } of packages) {
    if (permissive(license)) continue;
    const exception = EXCEPTIONS[name];
    if (exception?.[0] === license) accepted.push(`${name}@${versions.join(',')} (${license}): ${exception[1]}`);
    else problems.push(`${name}@${versions.join(',')}: ${license}`);
  }
}
const total = Object.values(report).reduce((sum, packages) => sum + packages.length, 0);
console.log(`${total} packages checked in ${dir}.`);
for (const line of accepted) console.log(`accepted  ${line}`);
if (problems.length) {
  console.error(`\n${problems.length} package(s) need a license decision:\n${problems.map((line) => `  ${line}`).join('\n')}`);
  process.exit(1);
}
