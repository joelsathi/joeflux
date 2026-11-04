import { createReadStream } from 'node:fs';
import path from 'node:path';
import { bundleRoot } from './build.js';
export function serveAnimationPlugin(pathname, response) {
  const file = pathname.slice('/animation-plugins/'.length);
  if (!pathname.startsWith('/animation-plugins/') || !['runtime.js', 'runtime.js.LEGAL.txt', 'THIRD_PARTY_LICENSES.txt'].includes(file)) return false;
  response.setHeader('content-type', file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/plain; charset=utf-8');
  response.setHeader('cache-control', 'no-cache');
  createReadStream(path.join(bundleRoot, file)).on('error', error => response.destroy(error)).pipe(response);
  return true;
}
