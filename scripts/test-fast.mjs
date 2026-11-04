// Runs the suite without the slowest browser, Studio and render suites. pnpm test still runs everything.
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

const files = (await readdir(path.join(root, 'tests'))).filter((name) => name.endsWith('.test.js') && !SLOW.has(name.slice(0, -'.test.js'.length))).sort().map((name) => path.join('tests', name));
const run = (args) => spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' }).status ?? 1;
const status = run(['scripts/create-demo-recording.mjs']) || run(['--test', '--test-concurrency=1', '--test-timeout=30000', ...files]);
process.exit(status);
