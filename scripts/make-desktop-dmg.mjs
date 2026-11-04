import { cp, mkdtemp, mkdir, rm, symlink, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') throw new Error('Build the disk image on macOS.');
const root = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const source = path.join(root, `out/JoeFlux-darwin-${process.arch}/JoeFlux.app`);
const staging = await mkdtemp(path.join(tmpdir(), 'joeflux-dmg-'));
const output = path.join(root, 'out/make', `JoeFlux-${version}-macOS-${process.arch}.dmg`);
try {
  await mkdir(path.dirname(output), { recursive: true });
  await cp(source, path.join(staging, 'JoeFlux.app'), { recursive: true, verbatimSymlinks: true });
  await symlink('/Applications', path.join(staging, 'Applications'));
  execFileSync('/usr/bin/hdiutil', ['create', '-volname', 'JoeFlux', '-srcfolder', staging, '-ov', '-format', 'UDZO', output], { stdio: 'inherit' });
  console.log(output);
} finally { await rm(staging, { recursive: true, force: true }); }
