// Runs the suite without the slowest browser, Studio and render suites. pnpm test still runs everything.
// --basic also skips every suite that needs Chromium or FFmpeg, for CI machines without either.
import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Each took 4 s or more on its own (measured 2026-11-03). Add a suite here when it grows that slow.
export const SLOW = new Set([
  'animation-plugins-browser', 'browser-pipeline', 'camera-quality', 'composition-browser', 'compositor-next',
  'film-preview', 'motion-blur-preview', 'playback-studio-browser', 'plugin-fields-browser', 'quality-loop',
  'render-coordination', 'studio-brief-browser', 'studio-browser', 'studio-camera', 'studio-plugin-controls',
  'studio-review-fixes', 'studio-review-hardening', 'studio-screen', 'terminal-studio-browser',
]);
// The other suites that fail without Chromium or FFmpeg (checked 2026-11-05). Add a suite here when it starts launching either.
export const RUNTIME = new Set([
  'animation-plugin-formats', 'api-security', 'artwork-layers', 'background-pack', 'brand-kits', 'browser-layout',
  'camera-browser', 'caption-review-fixes', 'desktop-browser', 'mcp', 'media', 'refinement-browser', 'render-progress',
  'review-clip', 'screen-presentation', 'source-decoder', 'source-moments', 'template-library', 'terminal-browser',
  'text-library-next', 'text-templates-browser', 'tools',
]);

const basic = process.argv.includes('--basic');
const skip = (name) => SLOW.has(name) || (basic && RUNTIME.has(name));
const files = (await readdir(path.join(root, 'tests'))).filter((name) => name.endsWith('.test.js') && !skip(name.slice(0, -'.test.js'.length))).sort().map((name) => path.join('tests', name));
const run = (args) => spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' }).status ?? 1;
const status = (basic ? 0 : run(['scripts/create-demo-recording.mjs'])) || run(['--test', '--test-concurrency=1', '--test-timeout=120000', ...files]);
process.exit(status);
