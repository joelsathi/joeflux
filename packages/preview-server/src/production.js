import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import connect from 'connect';
import { createProjectTools } from '../../tools/src/index.js';
import { loadProject } from '../../core/src/io.js';
import { projectApi } from './index.js';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };

export async function startProduction(projectRoot, port, { agents, staticRoot, connections }) {
  const root = path.resolve(projectRoot), built = await realpath(staticRoot);
  await access(path.join(built, 'index.html'));
  await loadProject(root);
  const tools = createProjectTools(root), unwatch = tools.watch();
  const studio = { agents, connections, token: randomBytes(32).toString('base64url') };
  const middlewares = connect();
  projectApi(root, tools, studio).configureServer({ middlewares });
  middlewares.use(async (request, response, next) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) return next();
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      const target = path.resolve(built, pathname === '/' ? 'index.html' : `.${pathname}`);
      if (!target.startsWith(`${built}${path.sep}`)) return next();
      const actual = await realpath(target).catch(() => null);
      if (!actual?.startsWith(`${built}${path.sep}`)) return next();
      const info = await stat(actual);
      if (!info.isFile()) return next();
      response.writeHead(200, { 'content-type': MIME[path.extname(actual)] ?? 'application/octet-stream', 'content-length': info.size, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      if (request.method === 'HEAD') return response.end();
      createReadStream(actual).on('error', error => response.destroy(error)).pipe(response);
    } catch { next(); }
  });
  middlewares.use((_request, response) => { response.writeHead(404); response.end('Not found'); });
  const server = createServer(middlewares);
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  } catch (error) { unwatch(); throw error; }
  studio.url = `http://127.0.0.1:${server.address().port}/`;
  let closing;
  const close = () => closing ??= new Promise((resolve, reject) => {
    studio.closing = true;
    unwatch();
    server.close(error => error ? reject(error) : resolve());
    // Disconnect SSE and active requests, which also abort their agent/render work.
    server.closeAllConnections();
  }).then(() => drainOperations(studio));
  return { origin: studio.url, url: `${studio.url}#token=${studio.token}`, token: studio.token, close };
}

export async function drainOperations(studio) {
  studio.closing = true;
  await Promise.allSettled([...(studio.pending ?? [])]);
}
