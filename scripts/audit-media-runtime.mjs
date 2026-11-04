#!/usr/bin/env node
// Read-only inventory: this does not download, install, package or approve media binaries.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, realpath } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { mediaTool } from '../packages/core/src/runtime.js';
const require = createRequire(import.meta.url), exec = promisify(execFile);
async function sha256(file) { const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest('hex'); }
async function inventory(label, binary) {
  const result = { label };
  try {
    const resolved = await realpath(binary.includes(path.sep) ? binary : (await exec('which', [binary])).stdout.trim());
    result.path = resolved; result.sha256 = await sha256(resolved);
    for (const [key, flag] of [['version', '-version'], ['buildConfiguration', '-buildconf'], ['licenseOutput', '-L']]) {
      const value = await exec(resolved, [flag], { maxBuffer: 4 * 1024 * 1024 }); result[key] = `${value.stdout}${value.stderr}`.trim();
    }
    return result;
  } catch (error) { return { ...result, error: error.message }; }
}
async function packageInfo(name) {
  const root = path.dirname(require.resolve(`${name}/package.json`)), manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const notices = [];
  async function walk(directory, depth = 0) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory() && depth < 1 && !['node_modules', '.git'].includes(entry.name)) await walk(file, depth + 1);
      else if (entry.isFile() && /(license|copying|notice|readme)/i.test(entry.name)) notices.push({ path: await realpath(file), sha256: await sha256(file) });
    }
  }
  await walk(root);
  return { name: manifest.name, version: manifest.version, declaredLicense: manifest.license, root: await realpath(root), notices };
}
const ffmpeg = require('ffmpeg-static'), ffprobe = require('@ffprobe-installer/ffprobe');
const result = { inspectedAt: new Date().toISOString(), platform: process.platform, architecture: process.arch, node: process.version,
  packages: await Promise.all(['ffmpeg-static', '@ffprobe-installer/ffprobe', `@ffprobe-installer/${process.platform}-${process.arch}`].map(name => packageInfo(name).catch(error => ({ name, error: error.message })))),
  binaries: await Promise.all([inventory('Current CLI ffmpeg', mediaTool('ffmpeg')), inventory('Current CLI ffprobe', mediaTool('ffprobe')), inventory('Installed ffmpeg-static binary', ffmpeg), inventory('Installed ffprobe-installer binary', ffprobe.path)]),
  distributionApproved: false, limitations: ['Inventory covers this installed platform only; inspect each actual packaged artifact, corresponding source/build recipes and required notices before public distribution.'] };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
