import { ensureAnimationPlugins } from '../../animation-plugins/build.js';
import { serveAnimationPlugin } from '../../animation-plugins/serve.js';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveSourceFrame } from './decoder.js';
import { loadProject } from '../../core/src/io.js';
import { BRAND_FILES, brandMime } from '../../presets/src/brand-kits.js';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RENDER_PAGE = path.join(PACKAGE_ROOT, 'apps', 'preview', 'render.html');
const MOTION_MODULE = path.join(PACKAGE_ROOT, 'packages', 'motion', 'src', 'index.js');
const CUSTOM_MODULE = path.join(PACKAGE_ROOT, 'packages', 'motion', 'src', 'custom.js');
const SOURCE_FRAMES_MODULE = path.join(PACKAGE_ROOT, 'packages', 'renderer', 'src', 'source-frames.js');
const TIMING_MODULE = path.join(PACKAGE_ROOT, 'packages', 'motion', 'src', 'timing.js');
const LAYOUT_MODULE = path.join(PACKAGE_ROOT, 'packages', 'motion', 'src', 'layout.js');
const ZOOM_MODULE = path.join(PACKAGE_ROOT, 'packages', 'motion', 'src', 'zoom.js');
const THEMES_MODULE = path.join(PACKAGE_ROOT, 'packages', 'presets', 'src', 'themes.js');

// With project, the page renders that snapshot instead of the files on disk.
export async function createRenderServer(projectRoot, {signal,project}={}) {
  await ensureAnimationPlugins();
  const resolvedRoot = path.resolve(projectRoot), current = () => project ?? loadProject(resolvedRoot);
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
      if(serveAnimationPlugin(pathname,response))return;
      if (pathname === '/') return await send(response, RENDER_PAGE, 'text/html; charset=utf-8');
      if(pathname==='/vendor/lottie-web/player.min.js')return await send(response,path.join(PACKAGE_ROOT,'packages/motion/vendor/lottie-web/player.min.js'),'text/javascript; charset=utf-8');
      if(pathname==='/vendor/looks/studio-cinematic.cube')return await send(response,path.join(PACKAGE_ROOT,'packages/motion/vendor/looks/studio-cinematic.cube'),'text/plain; charset=utf-8');
      const aliases={'motion':'motion/src/index','timing':'motion/src/timing','layout':'motion/src/layout','zoom':'motion/src/zoom','custom':'motion/src/custom','source-frames':'renderer/src/source-frames','text':'motion/src/text'};
      const alias=pathname.match(/^\/modules\/([a-z-]+)\.js$/)?.[1];
      if(alias && aliases[alias]) {response.writeHead(302,{location:`/packages/${aliases[alias]}.js`});response.end();return;}
      if(/^\/packages\/(composition|schema|motion|presets|renderer)\/src\/[a-z-]+\.js$/.test(pathname)) return await send(response,path.join(PACKAGE_ROOT,pathname),'text/javascript; charset=utf-8');
      if(pathname==='/api/source-frame') return await serveSourceFrame(new URL(request.url,'http://127.0.0.1'),resolvedRoot,response,signal,project);
      if(/^\/brand\/[a-zA-Z0-9.-]+$/.test(pathname)) return await send(response,path.join(PACKAGE_ROOT,'packages/presets/assets',path.basename(pathname)),pathname.endsWith('.svg')?'image/svg+xml':'font/woff2');
      if(pathname==='/brand-kits/registry.json')return await send(response,path.join(PACKAGE_ROOT,'brand-kits/registry.json'),'application/json');
      const brandFile=decodeURIComponent(pathname.slice(1));
      if(BRAND_FILES.has(brandFile))return await send(response,path.join(PACKAGE_ROOT,brandFile),brandMime(brandFile));
      if (pathname === '/project.json') return sendJson(response, await current());
      if (pathname.startsWith('/assets/')) return await sendProjectAsset(response, resolvedRoot, decodeURIComponent(pathname.slice('/assets/'.length)));
      if (pathname.startsWith('/project-modules/')) return await sendProjectModule(response, resolvedRoot, await current(), decodeURIComponent(pathname.slice('/project-modules/'.length)));
      response.writeHead(404); response.end('Not found');
    } catch (error) {
      response.writeHead(500, { 'content-type': 'application/json' }); response.end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const { port } = server.address();
  return { origin: `http://127.0.0.1:${port}`, close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

async function send(response, target, contentType) {
  const content=await readFile(target);
  response.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store' }); response.end(content);
}

function sendJson(response, value) {
  response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(value));
}

async function sendProjectAsset(response, projectRoot, relativePath) {
  const target = path.resolve(projectRoot, relativePath);
  if (!target.startsWith(`${projectRoot}${path.sep}`)) throw new Error('Asset path escapes the project.');
  const mime = target.endsWith('.svg') ? 'image/svg+xml' : target.endsWith('.png') ? 'image/png' : target.endsWith('.webp') ? 'image/webp' : /\.(mp4|m4v)$/i.test(target) ? 'video/mp4' : target.endsWith('.webm') ? 'video/webm' : 'application/octet-stream';
  return await send(response, target, mime);
}

async function sendProjectModule(response, projectRoot, project, relativePath) {
  if (!project.scenes.some((scene) => scene.module === relativePath)) {
    response.writeHead(404); response.end('Unknown scene module'); return;
  }
  const target = path.resolve(projectRoot, relativePath);
  const scenesRoot = path.resolve(projectRoot, 'scenes');
  if (!target.startsWith(`${scenesRoot}${path.sep}`)) throw new Error('Custom scene module escapes the scenes directory.');
  return await send(response, target, 'text/javascript; charset=utf-8');
}
