import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createRenderServer } from '../packages/renderer/src/server.js';
import { browserLaunchOptions } from '../packages/renderer/src/index.js';
import { startPreview } from '../packages/preview-server/src/index.js';
const project = new URL('../projects/animation-plugin-gallery', import.meta.url).pathname;
test('every animation plugin renders offline and repeats pixels after backward and fractional seeks', { timeout: 60000 }, async () => {
  const server = await createRenderServer(project), browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    const errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => { if (!route.request().url().startsWith(server.origin)) { external.push(route.request().url()); return route.abort(); } return route.continue(); });
    await page.goto(server.origin); await page.waitForFunction(() => window.joeFluxReady);
    for (const sceneId of ['animejs', 'motion', 'threejs', 'react-three']) {
      const render = frame => page.evaluate(args => window.renderScene(args), { sceneId, frame });
      await render(12.5); const reference = await page.locator('#frame').screenshot();
      await render(42); const changed = await page.locator('#frame').screenshot();
      assert.notDeepEqual(changed, reference, `${sceneId} must animate`);
      await render(0); await render(12.5);
      assert.deepEqual(await page.locator('#frame').screenshot(), reference, `${sceneId} must seek deterministically`);
    }
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
  } finally { await browser.close(); await server.close(); }
});
test('plugin host drops stale work, isolates canvases, and can be disposed and reused', { timeout: 60000 }, async () => {
  const server = await createRenderServer(project), browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage(); await page.goto(server.origin); await page.waitForFunction(() => window.joeFluxReady);
    const result = await page.evaluate(async () => {
      const { createSceneRenderer } = await import('/packages/renderer/src/browser-scene.js');
      const project = await (await fetch('/project.json')).json(); project.output.width=320; project.output.height=180;
      const a = document.createElement('canvas'), b = document.createElement('canvas');
      const render = createSceneRenderer(project), other = createSceneRenderer(project), scene = project.scenes.find(s=>s.plugin==='react-three');
      await Promise.all([render(a,scene,10),render(a,scene,20),render(a,scene,30)]);
      const latest = a.dataset.renderedFrame;
      await other(b,scene,30); const isolated = a.toDataURL()===b.toDataURL();
      await render.dispose(); await render(a,scene,30);
      const reusable = a.toDataURL()===b.toDataURL();
      await render.dispose(); await other.dispose(); return { latest, isolated, reusable };
    });
    assert.deepEqual(result, { latest:'30',isolated:true,reusable:true });
  } finally { await browser.close(); await server.close(); }
});
test('production studio serves the same local plugin bundle and licenses', { timeout: 60000 }, async () => {
  const server = await startPreview(project, 0, { production:true }), browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage(); await page.goto(server.url);
    await page.waitForSelector('.stage canvas[data-rendered-scene="animejs"]');
    const result = await page.evaluate(async () => {
      const runtime = await import('/animation-plugins/runtime.js');
      const license = await (await fetch('/animation-plugins/THIRD_PARTY_LICENSES.txt')).text();
      return { ids:runtime.ANIMATION_PLUGINS.map(p=>p.id), license:license.includes('Poimandres') };
    });
    assert.equal(result.ids.length,4); assert.equal(result.license,true);
  } finally { await browser.close(); await server.close(); }
});

test('many static 3D thumbnails do not evict the live stage context', { timeout: 60000 }, async () => {
  const server = await createRenderServer(project), browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage(); await page.goto(server.origin); await page.waitForFunction(() => window.joeFluxReady);
    const result = await page.evaluate(async () => {
      const { createSceneRenderer } = await import('/packages/renderer/src/browser-scene.js');
      const project = await (await fetch('/project.json')).json(); project.output.width=160;project.output.height=90;
      const scene=project.scenes.find(s=>s.plugin==='threejs'), stage=createSceneRenderer(project), canvas=document.createElement('canvas');
      await stage(canvas,scene,30);const before=canvas.toDataURL();
      const thumbnails=Array.from({length:24},()=>createSceneRenderer(project,{transient:true}));
      await Promise.all(thumbnails.map(render=>render(document.createElement('canvas'),scene,30)));
      await stage(canvas,scene,30);const same=canvas.toDataURL()===before;
      await Promise.all(thumbnails.map(render=>render.dispose()));await stage.dispose();return same;
    });
    assert.equal(result,true);
  } finally { await browser.close();await server.close(); }
});
test('moving from an adapter module to a plain custom module disposes its session', { timeout:60000 }, async () => {
  const server=await createRenderServer(project),browser=await chromium.launch(browserLaunchOptions());
  try {
    const page=await browser.newPage();
    await page.route('**/project-modules/scenes/adapter.js',route=>route.fulfill({contentType:'text/javascript',body:'const factory=async()=>({render(){},dispose(){window.disposals=(window.disposals||0)+1;}});export function renderFrame(frame,context){return context.renderPlugin(factory);}'}));
    await page.route('**/project-modules/scenes/plain.js',route=>route.fulfill({contentType:'text/javascript',body:'export function renderFrame(){}'}));
    await page.goto(server.origin);await page.waitForFunction(()=>window.joeFluxReady);
    assert.equal(await page.evaluate(async()=>{
      const {createSceneRenderer}=await import('/packages/renderer/src/browser-scene.js');
      const project=await(await fetch('/project.json')).json(),render=createSceneRenderer(project),canvas=document.createElement('canvas');
      await render(canvas,{id:'adapter',durationFrames:120,module:'scenes/adapter.js'},0);
      await render(canvas,{id:'plain',durationFrames:120,module:'scenes/plain.js'},0);
      const count=window.disposals||0;await render.dispose();return count;
    }),1);
  }finally{await browser.close();await server.close();}
});
