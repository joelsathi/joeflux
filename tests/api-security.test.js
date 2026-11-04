import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { chromium, expect } from '@playwright/test';
import { browserLaunchOptions } from '../packages/renderer/src/index.js';
import { startPreview } from '../packages/preview-server/src/index.js';

async function fixture(t, parent = tmpdir()) {
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, 'harness-security-'));
  await mkdir(path.join(root, 'scenes'));
  await writeFile(path.join(root, 'scenes/title.json'), JSON.stringify({ id: 'title', preset: 'text-settle', durationFrames: 24, params: { title: 'Hello' } }));
  await mkdir(path.join(root, 'assets')); await writeFile(path.join(root, 'assets/logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ name: 'Security', version: 1, output: { width: 320, height: 180, fps: 24, audio: false }, assets: { logo: 'assets/logo.svg' }, scenes: [{ id: 'title', file: 'scenes/title.json' }] }));
  const preview = await startPreview(root, 0);
  t.after(async () => { await preview.close(); await rm(root, { recursive: true, force: true }); });
  return { ...preview, root, headers: { 'x-joeflux-token': preview.token ?? 'missing', 'content-type': 'application/json' } };
}
const edit = JSON.stringify({ id: 'title', patch: { durationFrames: 48 } });
// fetch silently drops a Host header (a forbidden header), so DNS-rebinding cases use node:http.
const request = (url, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
  const call = http.request(url, { method, headers }, (response) => { response.resume(); response.on('end', () => resolve({ status: response.statusCode, headers: response.headers })); });
  call.on('error', reject); call.end(body);
});
const duration = async (root) => JSON.parse(await readFile(path.join(root, 'scenes/title.json'), 'utf8')).durationFrames;

test('unauthenticated and hostile browser mutations cannot edit files', async (t) => {
  const preview = await fixture(t), url = new URL('/api/tools/scene_update', preview.url);
  for (const headers of [
    { 'content-type': 'application/json' },
    { ...preview.headers, origin: 'https://evil.example' },
    { ...preview.headers, origin: 'null' },
    { ...preview.headers, 'sec-fetch-site': 'cross-site' },
    { ...preview.headers, 'sec-fetch-site': 'same-site' },
    { ...preview.headers, host: 'evil.example' },
    { ...preview.headers, host: `evil.example:${url.port}` },
  ]) {
    const response = await request(url, { method: 'POST', headers, body: edit });
    assert.ok([401, 403].includes(response.status), `${JSON.stringify(headers)}: ${response.status}`);
    assert.equal(await duration(preview.root), 24);
  }
  assert.equal((await fetch(new URL('/api/tools', preview.url))).status, 401);
  const allowed = await fetch(url, { method: 'POST', headers: { ...preview.headers, origin: new URL(preview.url).origin }, body: edit });
  assert.equal(allowed.status, 200);
  assert.equal(await duration(preview.root), 48);
});

test('cookies cannot bootstrap API credentials or authorize project reads', async (t) => {
  const preview = await fixture(t), session = new URL('/api/session', preview.url);
  // Host cookies reach every loopback port, even with HttpOnly and SameSite=Strict.
  const leakedCookie = `joeflux_${new URL(preview.origin).port}=${preview.token}`;
  const replay = await request(session, { headers: { cookie: leakedCookie, 'x-joeflux-bootstrap': '1' } });
  assert.equal(replay.status, 401, 'a cookie received by another loopback server must not reveal the API token');
  for (const pathname of ['/api/project', '/api/events', '/api/source-frame?asset=logo&time=0']) {
    assert.equal((await request(new URL(pathname, preview.url), { headers: { cookie: leakedCookie } })).status, 401, pathname);
  }
  const response = await fetch(session, { headers: preview.headers });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: true }, 'bootstrap validates the supplied token without issuing one');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(new URL(preview.url).search, '');
  assert.equal(new URL(preview.url).hash, `#token=${preview.token}`);
});

test('forwarded ports work; cross-site navigation reaches only the launch page; project documents are sandboxed', async (t) => {
  const preview = await fixture(t), url = new URL('/api/tools/scene_update', preview.url), harness = path.resolve('.');
  const forwarded = await request(url, { method: 'POST', headers: { ...preview.headers, host: 'localhost:8080', origin: 'http://localhost:8080' }, body: edit });
  assert.equal(forwarded.status, 200, 'ssh -L 8080 or a container port map');
  const navigate = { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' };
  assert.equal((await request(new URL('/', preview.url), { headers: navigate })).status, 200);
  for (const pathname of [`/@fs${harness}/package.json`, '/project-assets/assets/logo.svg', '/src/main.jsx', '/api/project']) {
    assert.equal((await request(new URL(pathname, preview.url), { headers: navigate })).status, 403, pathname);
  }
  const asset = await request(new URL('/project-assets/assets/logo.svg', preview.url));
  assert.deepEqual([asset.status, asset.headers['content-security-policy'], asset.headers['x-content-type-options']], [200, 'sandbox', 'nosniff']);
  const accented = await request(url, { method: 'POST', headers: { ...preview.headers, 'x-joeflux-token': 'é'.repeat(preview.token.length) }, body: edit });
  assert.equal(accented.status, 401);
});

test('mutation endpoints reject non-JSON, malformed, empty and oversized bodies before executing', async (t) => {
  const preview = await fixture(t), url = new URL('/api/tools/scene_update', preview.url);
  for (const [body, type, status] of [[edit, 'text/plain', 415], [edit, 'application/x-www-form-urlencoded', 415], ['{', 'application/json', 400], ['', 'application/json', 400], ['null', 'application/json', 400], ['[]', 'application/json', 400], [JSON.stringify({ ...JSON.parse(edit), padding: 'x'.repeat(1024 * 1024) }), 'application/json', 413]]) {
    assert.equal((await fetch(url, { method: 'POST', headers: { ...preview.headers, 'content-type': type }, body })).status, status);
    assert.equal(await duration(preview.root), 24);
  }
  const response = await fetch(new URL('/api/agents/missing/login', preview.url), { method: 'POST', headers: { ...preview.headers, 'content-type': 'text/plain' }, body: '{}' });
  assert.equal(response.status, 415);
});

test('chunked request bodies are bounded without relying on Content-Length', async (t) => {
  const preview = await fixture(t);
  const status = await new Promise((resolve, reject) => {
    const request = http.request(new URL('/api/tools/scene_update', preview.url), { method: 'POST', headers: preview.headers }, (response) => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
    request.on('error', reject);
    request.write('{"padding":"');
    for (let n = 0; n < 18; n++) request.write('x'.repeat(65536));
    request.end('"}');
  });
  assert.equal(status, 413);
  assert.equal(await duration(preview.root), 24);
});


test('launch credentials survive reload only in their origin and never enter host cookies', async (t) => {
  const preview = await fixture(t), browser = await chromium.launch(browserLaunchOptions());
  t.after(() => browser.close());
  let receivedCookie;
  const other = http.createServer((request, response) => { receivedCookie = request.headers.cookie; response.end('Another local service'); });
  await new Promise(resolve => other.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => other.close(resolve)));
  const page = await browser.newPage();
  await page.goto(preview.url);
  await expect(page.getByLabel('Preview of title', { exact: true })).toBeVisible();
  assert.equal(new URL(page.url()).hash, '', 'remove the launch key from the address bar');
  assert.deepEqual(await page.context().cookies(), [], 'host cookies would leak credentials across ports');
  await page.reload();
  await expect(page.getByLabel('Preview of title', { exact: true })).toBeVisible();
  await page.goto(`http://127.0.0.1:${other.address().port}/`);
  assert.equal(receivedCookie, undefined);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('joeflux-token')), null);
  await page.goto(preview.origin);
  await expect(page.getByLabel('Preview of title', { exact: true })).toBeVisible();
});

test('Vite cannot serve project metadata from projects inside the harness checkout', async (t) => {
  const preview = await fixture(t, path.resolve('.runtime'));
  for (const relative of ['project.json', 'scenes/title.json']) {
    const file = path.join(preview.root, relative);
    for (const suffix of ['', '?raw', '?import']) {
      const response = await fetch(new URL(`/@fs${file}${suffix}`, preview.origin));
      assert.equal(response.status, 403, `${relative}${suffix} must not bypass API authentication`);
    }
  }
  assert.equal((await fetch(new URL('/api/project', preview.origin), { headers: preview.headers })).status, 200);
  assert.equal((await fetch(new URL('/project-assets/assets/logo.svg', preview.origin))).status, 200);
});
