import { ensureAnimationPlugins } from '../../animation-plugins/build.js';
import { serveAnimationPlugin } from '../../animation-plugins/serve.js';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { loadProject } from '../../core/src/io.js';
import { serveSourceFrame } from '../../renderer/src/decoder.js';
import { createProjectTools } from '../../tools/src/index.js';
import { AGENTS, detectAgents, loginAgent, runAgent } from '../../agents/src/index.js';
import { BRAND_FILES, brandMime } from '../../presets/src/brand-kits.js';

const HARNESS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const APPS = { studio: path.join(HARNESS_ROOT, 'apps', 'studio'), classic: path.join(HARNESS_ROOT, 'apps', 'preview') };

export async function startPreview(projectRoot, port = 4173, { agents = AGENTS, app = 'studio', connections, production = false, staticRoot = path.join(APPS[app], 'dist') } = {}) {
  await ensureAnimationPlugins();
  if (production) {
    const { startProduction } = await import('./production.js');
    return startProduction(projectRoot, port, { agents, staticRoot, connections });
  }
  const [{ createServer }, { default: react }] = await Promise.all([import('vite'), import('@vitejs/plugin-react')]);
  const root = path.resolve(projectRoot), tools = createProjectTools(root), unwatch = tools.watch(), studio = { agents, connections, token: randomBytes(32).toString('base64url') };
  const server = await createServer({
    root: APPS[app],
    plugins: [react(), projectApi(root, tools, studio)],
    // The studio is same-origin only; no route should answer CORS preflights.
    // Project files reach the page through /project-assets, never Vite's /@fs.
    server: { host: '127.0.0.1', port, strictPort: true, cors: false, fs: { allow: ['apps', 'packages', 'library', 'brand-kits', 'node_modules'].map(directory => path.join(HARNESS_ROOT, directory)) } },
  });
  await server.listen();
  studio.url = server.resolvedUrls?.local[0] ?? `http://127.0.0.1:${port}/`;
  // Closing during Vite's first dependency scan orphans its esbuild service and keeps the process alive.
  const close = async () => { unwatch(); await server.environments.client.depsOptimizer?.scanProcessing; return server.close(); };
  // The fragment never reaches the server; the page keeps the key in origin-scoped sessionStorage.
  return { url: `${studio.url}#token=${studio.token}`, origin: studio.url, token: studio.token, close };
}

export function projectApi(projectRoot, tools, studio) {
  return {
    name: 'joeflux-project-api',
    configureServer(server) {
      // First for every route, Vite's own included: open the launch link, then same-origin only.
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1'), launch = request.method === 'GET' && url.pathname === '/';
        if (!localHost(request)) return reply(response, 403, { error: FORBIDDEN });
        if (trusted(request) || (launch && request.headers['sec-fetch-mode'] === 'navigate')) return next();
        return reply(response, 403, { error: FORBIDDEN });
      });
      server.middlewares.use((request,response,next)=>{if(!serveAnimationPlugin(new URL(request.url??'/', 'http://127.0.0.1').pathname,response))next();});
      server.middlewares.use('/brand', async (request,response,next)=>{
        const name=decodeURIComponent((request.url??'').split('?')[0]).replace(/^\//,'');
        if(name!=='InterVariable.woff2')return next();
        response.setHeader('content-type','font/woff2');
        createReadStream(path.join(HARNESS_ROOT,'packages/presets/assets',name)).on('error',error=>response.destroy(error)).pipe(response);
      });
      server.middlewares.use('/vendor/lottie-web/player.min.js',(request,response)=>{
        response.setHeader('content-type','text/javascript; charset=utf-8');
        createReadStream(path.join(HARNESS_ROOT,'packages/motion/vendor/lottie-web/player.min.js')).pipe(response);
      });
      server.middlewares.use('/vendor/looks/studio-cinematic.cube',(request,response)=>{
        response.setHeader('content-type','text/plain; charset=utf-8');
        createReadStream(path.join(HARNESS_ROOT,'packages/motion/vendor/looks/studio-cinematic.cube')).pipe(response);
      });
      server.middlewares.use('/brand-kits', (request,response,next)=>{
        const file=`brand-kits${decodeURIComponent(new URL(request.url??'/', 'http://127.0.0.1').pathname)}`;
        if(!BRAND_FILES.has(file))return next();
        response.setHeader('content-type',brandMime(file));
        createReadStream(path.join(HARNESS_ROOT,file)).on('error',(error)=>response.destroy(error)).pipe(response);
      });
      server.middlewares.use('/project-assets', async (request, response, next) => {
        try {
          if (request.method !== 'GET' && request.method !== 'HEAD') return next();
          const assetUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
          // Declared media is public to local clients, as are the original assets below.
          if (assetUrl.pathname === '/source-frame' && request.method === 'GET') return await serveSourceFrame(assetUrl, projectRoot, response);
          const relativePath = decodeURIComponent(assetUrl.pathname).replace(/^\/+/, '');
          if (/^\.runtime\/previews\/[a-z0-9-]+\.mp4$/.test(relativePath)) return await sendPreview(request, response, path.join(projectRoot, relativePath));
          if (/^\.runtime\/posters\/[a-z0-9-]+\.png$/.test(relativePath)) return await sendProjectAsset(response, projectRoot, relativePath, request.method === 'HEAD');
          if (/^\.runtime\/reviews\/[a-z0-9-]+\.png$/.test(relativePath)) return await sendProjectAsset(response, projectRoot, relativePath, request.method === 'HEAD');
          const project = await loadProject(projectRoot);
          if (!Object.values(project.assets ?? {}).includes(relativePath)) return next();
          return await sendProjectAsset(response, projectRoot, relativePath, request.method === 'HEAD');
        } catch (error) { return reply(response, 400, { error: error.message }); }
      });
      server.middlewares.use('/project-modules', async (request, response, next) => {
        try {
          if (request.method !== 'GET' && request.method !== 'HEAD') return next();
          const relativePath = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname).replace(/^\/+/, '');
          const project = await loadProject(projectRoot);
          if (!project.scenes.some((scene) => scene.module === relativePath)) return next();
          return sendProjectModule(response, projectRoot, relativePath, request.method === 'HEAD');
        } catch (error) { return reply(response, 400, { error: error.message }); }
      });
      server.middlewares.use('/api', trackOperation(studio, async (request, response, next) => {
        try {
          const url = new URL(request.url ?? '/', 'http://127.0.0.1');
          if (!same(request.headers['x-joeflux-token'], studio.token)) return reply(response, 401, { error: 'Open the studio from the link the preview command printed; this request needs its session key.' });
          if (request.method === 'GET' && url.pathname === '/session') return reply(response, 200, { authenticated: true });
          const body = ['POST', 'PUT'].includes(request.method) ? await readJson(request, url.pathname === '/tools/artwork_import' ? 8 * MiB : MiB) : undefined;
          if(request.method==='GET' && url.pathname==='/source-frame') return await serveSourceFrame(url,projectRoot,response);
          if (request.method === 'GET' && url.pathname === '/tools') return reply(response, 200, tools.list());
          if (request.method === 'POST' && url.pathname.startsWith('/tools/')) {
            // A closed request cancels renders; the client may name the job it follows for progress.
            const controller = new AbortController(), job = request.headers['x-joeflux-job'];
            response.on('close', () => { if (!response.writableFinished) controller.abort(); });
            return reply(response, 200, await tools.call(decodeURIComponent(url.pathname.slice('/tools/'.length)), body, { signal: controller.signal, jobId: /^[\w-]{8,64}$/.test(job ?? '') ? job : undefined }));
          }
          if (request.method === 'GET' && url.pathname === '/events') return streamEvents(tools, request, response);
          if (request.method === 'GET' && url.pathname === '/agents') return reply(response, 200, await agentStatus(studio, url.searchParams.has('refresh')));
          if (request.method === 'POST' && url.pathname.startsWith('/connections/')) {
            const [, , id, action, extra] = url.pathname.split('/');
            if (!studio.connections || extra || !['claude', 'codex'].includes(id) || !['install', 'login', 'device-login', 'save-key', 'remove-key', 'approve-cli'].includes(action)) throw failure(400, 'Unknown connection action.');
            studio.detected = null;
            return reply(response, 200, await studio.connections.action(id, action, body));
          }
          if (request.method === 'POST' && /^\/agents\/[a-z-]+\/login$/.test(url.pathname)) return streamLogin(studio, url.pathname.split('/')[2], request, response);
          if (request.method === 'POST' && url.pathname === '/chat') return streamChat(projectRoot, studio, body, request, response);
          // Legacy preview endpoints, kept as thin wrappers so every change goes through the tools.
          const legacy = {
            'GET /project': () => ['project_get', {}],
            'PUT /project': (body) => ['project_update', { theme: body.theme, fingerprint: body.fingerprint }],
            'POST /render': (body) => ['render_scene', { id: body.sceneId, force: true }],
            'POST /assemble': () => ['assemble', {}],
            'POST /review': () => ['review_contact_sheet', {}],
          }[`${request.method} ${url.pathname}`];
          if (legacy) return reply(response, 200, await tools.call(...legacy(body ?? {})));
          if (request.method === 'PUT' && url.pathname.startsWith('/scenes/')) {
            return reply(response, 200, await tools.call('scene_replace', { id: decodeURIComponent(url.pathname.slice('/scenes/'.length)), scene: body.scene, fingerprint: body.fingerprint }));
          }
          return next();
        } catch (error) { return reply(response, error.status ?? 400, { error: error.message, issues: error.issues }); }
      }));
    },
  };
}

// Browser requests must come from this studio's own page: a loopback Host name blocks
// DNS rebinding, and Origin plus Fetch Metadata block other sites and other ports.
// The port is not checked, so SSH or container port forwarding still works.
const FORBIDDEN = 'Requests must come from the studio page itself.', MiB = 1024 * 1024;
const localHost = (request) => ['127.0.0.1', 'localhost', '[::1]'].includes((request.headers.host ?? '').replace(/:\d+$/, ''));
function trusted(request) {
  const { host, origin } = request.headers;
  if (!localHost(request) || origin !== undefined && origin !== `http://${host}`) return false;
  return [undefined, 'same-origin', 'none'].includes(request.headers['sec-fetch-site']);
}
const same = (value, token) => typeof value === 'string' && Buffer.byteLength(value) === Buffer.byteLength(token) && timingSafeEqual(Buffer.from(value), Buffer.from(token));
const failure = (status, message) => Object.assign(new Error(message), { status });
// Drain the whole body so the client always receives the status instead of a reset.
async function readJson(request, limit) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw failure(415, 'Send a JSON object with content-type application/json.');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size <= limit) chunks.push(chunk); }
  if (size > limit) throw failure(413, `Request body exceeds ${limit / MiB} MiB.`);
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw failure(400, 'Request body is not valid JSON.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw failure(400, 'Request body must be a JSON object.');
  return body;
}

// One agent turn as server-sent events; closing the request cancels the agent.
async function streamChat(projectRoot, studio, { agent, prompt, session, model, context }, request, response) {
  if (typeof prompt !== 'string' || !prompt.trim()) return reply(response, 400, { error: 'A prompt is required.' });
  return pipeEvents(response, async function* (signal) {
    const key = studio.connections ? await studio.connections.key(agent) : null;
    if (signal.aborted) return;
    if (studio.connections && !key) {
      const status = await studio.connections.status();
      if (signal.aborted) return;
      if (!status[agent]?.cliApproved) throw new Error('Open Connections and confirm use of your CLI account before directing.');
    }
    const auth = studio.connections ? { mode: key ? 'api-key' : 'cli', key } : undefined;
    yield* runAgent({ auth, agent, agents: studio.agents, prompt, session, model, context, project: projectRoot, studioUrl: studio.url, studioToken: studio.token, signal });
  });
}

async function agentStatus(studio, refresh) {
  if (refresh || !studio.detected) studio.detected = detectAgents(studio.agents, { desktop: Boolean(studio.connections) });
  if (!studio.connections) return studio.detected;
  const connections = await studio.connections.status();
  return studio.detected.map(item => ({ ...item, cliSignedIn: item.signedIn, signedIn: connections[item.id]?.keyError ? false : connections[item.id]?.keyConfigured ? true : Boolean(item.signedIn && connections[item.id]?.cliApproved), connection: connections[item.id] }));
}

function streamLogin(studio, agent, request, response) {
  studio.detected = null;
  return pipeEvents(response, (signal) => loginAgent({ agent, agents: studio.agents, signal }));
}

async function pipeEvents(response, start) {
  const controller = new AbortController();
  response.on('close', () => { if (!response.writableFinished) controller.abort(); });
  if (response.destroyed) { controller.abort(); return; }
  openStream(response);
  try {
    for await (const event of start(controller.signal)) response.write(`data: ${JSON.stringify(event)}\n\n`);
  } catch (error) {
    response.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    response.write(`data: ${JSON.stringify({ type: 'done', ok: false })}\n\n`);
  }
  response.end();
}

function openStream(response) {
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
  response.write(': connected\n\n');
}

function streamEvents(tools, request, response) {
  openStream(response);
  const send = (event) => response.write(`data: ${JSON.stringify(event)}\n\n`), ping = setInterval(() => response.write(': ping\n\n'), 25000);
  tools.events.on('event', send);
  request.on('close', () => { clearInterval(ping); tools.events.off('event', send); });
}

function reply(response, status, body) { response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(body)); }

async function sendProjectAsset(response, projectRoot, relativePath, headOnly) {
  const target = path.resolve(projectRoot, relativePath);
  if (!target.startsWith(`${path.resolve(projectRoot)}${path.sep}`)) throw new Error('Asset path escapes the project.');
  const info = await stat(target).catch(() => null);
  if (!info?.isFile()) { response.writeHead(404); response.end(); return; }
  const type = target.endsWith('.svg') ? 'image/svg+xml' : target.endsWith('.png') ? 'image/png' : target.endsWith('.webp') ? 'image/webp' : /\.(mp4|m4v)$/i.test(target) ? 'video/mp4' : target.endsWith('.webm') ? 'video/webm' : 'application/octet-stream';
  // A project SVG opened as a page runs sandboxed, so its script cannot reach the studio API.
  response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', 'content-security-policy': 'sandbox', 'x-content-type-options': 'nosniff' });
  if (headOnly) return response.end();
  return createReadStream(target).on('error', error => response.destroy(error)).pipe(response);
}

// Only generated preview MP4s are exposed from .runtime; byte ranges let the
// video element load and loop without registering temporary clips as assets.
async function sendPreview(request, response, target) {
  const info = await stat(target).catch(() => null);
  if (!info?.isFile()) { response.writeHead(404); response.end(); return; }
  let start = 0, end = info.size - 1;
  if (request.headers.range) {
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
    if (range && (range[1] || range[2])) {
      if (!range[1]) start = Math.max(0, info.size - Number(range[2]));
      else { start = Number(range[1]); if (range[2]) end = Math.min(end, Number(range[2])); }
    } else start = info.size;
    if (start > end || start >= info.size) { response.writeHead(416, {'content-range': `bytes */${info.size}`}); response.end(); return; }
  }
  response.writeHead(request.headers.range ? 206 : 200, {
    'content-type': 'video/mp4', 'cache-control': 'no-store', 'accept-ranges': 'bytes', 'content-length': end - start + 1,
    ...(request.headers.range ? {'content-range': `bytes ${start}-${end}/${info.size}`} : {}),
  });
  if (request.method === 'HEAD') { response.end(); return; }
  createReadStream(target, {start, end}).on('error', error => response.destroy(error)).pipe(response);
}

function sendProjectModule(response, projectRoot, relativePath, headOnly) {
  const target = path.resolve(projectRoot, relativePath);
  const scenesRoot = path.resolve(projectRoot, 'scenes');
  if (!target.startsWith(`${scenesRoot}${path.sep}`)) throw new Error('Custom scene module escapes the scenes directory.');
  response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
  if (headOnly) return response.end();
  return createReadStream(target).on('error', error => response.destroy(error)).pipe(response);
}

function trackOperation(studio, handler) {
  studio.pending ??= new Set();
  return (request, response, next) => {
    if (studio.closing) return reply(response, 503, { error: 'The studio is closing.' });
    const operation = handler(request, response, next);
    studio.pending.add(operation);
    operation.catch(next).finally(() => studio.pending.delete(operation));
  };
}
