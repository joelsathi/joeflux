import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { startPreview } from '../packages/preview-server/src/index.js';
import { browserLaunchOptions } from '../packages/renderer/src/index.js';
import { createRenderServer } from '../packages/renderer/src/server.js';
import { renderProject } from '../packages/renderer/src/render.js';

const shots = [{ at: 0 }, { at: .5, focus: [.3, .3], zoom: 2 }, { at: 1 }];
async function fixture(scenes, { width = 640, height = 360 } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'harness screen studio '));
  await mkdir(path.join(root, 'scenes')); await mkdir(path.join(root, 'assets'));
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=24:d=2', '-an', '-c:v', 'libx264', path.join(root, 'assets', 'clip.mp4')]);
  for (const scene of scenes) await writeFile(path.join(root, 'scenes', `${scene.id}.json`), JSON.stringify(scene));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ name: 'Screen look', version: 1, output: { width, height, fps: 24, audio: false }, theme: 'navy-dark', assets: { screen: 'assets/clip.mp4' }, scenes: scenes.map(({ id }) => ({ id, file: `scenes/${id}.json` })) }));
  return root;
}
const scene = async (root, id) => JSON.parse(await readFile(path.join(root, 'scenes', `${id}.json`), 'utf8'));
async function eventually(check, message) {
  const deadline = Date.now() + 8000;
  for (;;) { try { return await check(); } catch (error) { if (Date.now() > deadline) throw new Error(`${message}: ${error.message}`); await new Promise((resolve) => setTimeout(resolve, 100)); } }
}
// Decode a PNG screenshot to RGB so tests can sample pixels.
const pixels = (png, width) => { const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { input: png }); return (x, y) => [...raw.subarray((Math.round(y) * width + Math.round(x)) * 3, (Math.round(y) * width + Math.round(x)) * 3 + 3)]; };
const near = (actual, expected, tolerance = 12) => actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance);

async function renderPage(root) {
  const server = await createRenderServer(root), browser = await chromium.launch(browserLaunchOptions());
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } }), errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(server.origin); await page.waitForFunction(() => window.joeFluxReady);
  // Render the first project scene with a screen override and describe the resulting stage.
  const render = (screen) => page.evaluate(async (override) => {
    const { createSceneRenderer } = await import('/packages/renderer/src/browser-scene.js');
    const { SCREEN_SHADOW } = await import('/packages/motion/src/spatial-stage.js');
    const project = await (await fetch('/project.json')).json(), canvas = document.querySelector('#frame'), base = project.scenes[0];
    // Repeated readbacks would move the canvas from GPU to CPU raster mid-test; start on CPU.
    if (!window.render) { canvas.getContext('2d', { willReadFrequently: true }); window.render = createSceneRenderer(project); }
    await window.render(canvas, { ...base, screen: { ...base.screen, ...override } }, 0);
    const stage = document.querySelector('[data-spatial-stage]'), media = stage.querySelector('canvas[data-asset]'), frame = stage.querySelector('[data-frame]'), outer = frame ?? media;
    const normal = (value) => { const probe = document.createElement('div'); probe.style.boxShadow = value; return probe.style.boxShadow; };
    const box = (element) => ({ left: parseFloat(element.style.left), top: parseFloat(element.style.top), width: parseFloat(element.style.width), height: parseFloat(element.style.height) });
    const title = frame?.querySelector('[data-frame-title]');
    const encode = (data) => { let text = ''; for (let index = 0; index < data.length; index += 0x8000) text += String.fromCharCode(...data.subarray(index, index + 0x8000)); return btoa(text); };
    return {
      frame: frame?.dataset.frame ?? null, mediaInFrame: media.parentElement === frame, media: { width: media.width, height: media.height, top: media.offsetTop },
      box: box(frame ?? media), transform: outer.style.transform, radius: outer.style.borderRadius, border: outer.style.border,
      shadow: Object.entries(SCREEN_SHADOW).find(([, value]) => normal(value) === outer.style.boxShadow)?.[0] ?? outer.style.boxShadow,
      dots: frame ? [...frame.querySelector('[data-frame-bar]').children].filter((child) => child !== title).map((dot) => getComputedStyle(dot).backgroundColor) : [],
      title: title?.textContent ?? null, pill: title ? getComputedStyle(title).backgroundColor : null, bar: frame ? getComputedStyle(frame).backgroundColor : null,
      background: encode(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data), html: stage.innerHTML,
    };
  }, screen).then((state) => ({ ...state, background: Buffer.from(state.background, 'base64') }));
  return { page, errors, render, close: async () => { await browser.close(); await server.close(); } };
}

test('the spatial stage wraps the recording in browser and window chrome with shadow presets', { timeout: 90000 }, async () => {
  const root = await fixture([{ id: 'shot', kind: 'screen', durationFrames: 24, screen: { asset: 'screen', presentation: 'studio', backdrop: 'paper', fit: 'contain', tilt: [0, 0, 0] }, camera: { shots } }]);
  const { page, errors, render, close } = await renderPage(root);
  try {
    const rect = { left: 1920 * .13, top: 1080 * .13, width: 1920 * .74, height: 1080 * .74 };
    const plain = await render({});
    assert.equal(plain.frame, null); assert.equal(plain.shadow, 'soft'); assert.match(plain.border, /1px solid/); assert.equal(plain.radius, '22px');

    const light = await render({ frame: 'browser-light', frameTitle: 'app.example.com/billing', shadow: 'floating', radius: 14 });
    assert.equal(light.frame, 'browser-light'); assert.equal(light.mediaInFrame, true); assert.equal(light.shadow, 'floating'); assert.equal(light.radius, '14px');
    assert.equal(light.title, 'app.example.com/billing'); assert.equal(light.pill, 'rgb(255, 255, 255)'); assert.equal(light.bar, 'rgb(238, 241, 245)');
    assert.deepEqual(light.dots, ['rgb(255, 95, 87)', 'rgb(254, 188, 46)', 'rgb(40, 200, 64)']);
    assert.match(light.transform, /translate3d/);
    // Contain: the media keeps the 16:9 recording aspect below the 40px bar, inside the studio rect.
    assert.ok(Math.abs(light.media.width / light.media.height - 16 / 9) < .01, `aspect ${light.media.width}x${light.media.height}`);
    assert.equal(light.media.top, 40);
    assert.ok(light.box.top >= rect.top - .01 && light.box.top + light.box.height <= rect.top + rect.height + .01 && light.box.left >= rect.left - .01 && light.box.left + light.box.width <= rect.left + rect.width + .01, JSON.stringify(light.box));
    assert.ok(Math.abs(light.box.height - light.media.height - 40) < 1);

    const dark = await render({ frame: 'browser-dark', shadow: 'deep', fit: 'cover' });
    assert.equal(dark.bar, 'rgb(28, 35, 48)'); assert.equal(dark.pill, 'rgb(43, 52, 67)'); assert.equal(dark.shadow, 'deep'); assert.equal(dark.title, '');
    for (const key of Object.keys(rect)) assert.ok(Math.abs(dark.box[key] - rect[key]) < .01, `cover fills the rect: ${key}`);
    assert.equal(dark.media.height, Math.round(rect.height - 40));
    const shot = pixels(await page.locator('#stage').screenshot(), 640), scale = 640 / 1920, barY = (rect.top + 20) * scale;
    assert.ok(near(shot((rect.left + rect.width * .2) * scale, barY), [28, 35, 48]), `dark bar visible: ${shot((rect.left + rect.width * .2) * scale, barY)}`);
    assert.ok(near(shot((rect.left + 22) * scale, barY), [255, 95, 87], 60), `red dot visible: ${shot((rect.left + 22) * scale, barY)}`);
    assert.ok(near(shot((rect.left + rect.width / 2) * scale, barY), [43, 52, 67], 20), `address pill visible: ${shot((rect.left + rect.width / 2) * scale, barY)}`);

    const window = await render({ frame: 'window', frameTitle: 'Settings', shadow: 'none' });
    assert.equal(window.frame, 'window'); assert.equal(window.pill, 'rgba(0, 0, 0, 0)'); assert.equal(window.title, 'Settings'); assert.equal(window.shadow, 'none');

    const full = await render({ presentation: 'fullscreen', frame: 'browser-light' });
    assert.equal(full.frame, 'browser-light'); assert.equal(full.box.top, 0); assert.ok(full.box.left >= 0 && full.box.width <= 1920 && full.box.height === 1080);
    assert.equal(full.shadow, 'none');
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test('screen lighting changes background pixels only when set', { timeout: 90000 }, async () => {
  const root = await fixture([{ id: 'shot', kind: 'screen', durationFrames: 24, screen: { asset: 'screen', presentation: 'studio', backdrop: 'slate', fit: 'cover' }, camera: { shots } }]);
  const { errors, render, close } = await renderPage(root);
  try {
    const changed = (a, b) => { let count = 0; for (let index = 0; index < a.background.length; index++) count += a.background[index] !== b.background[index]; return count; };
    const plain = await render({}), again = await render({}), none = await render({ lighting: { style: 'none', intensity: 1 } }), zero = await render({ lighting: { style: 'glow', intensity: 0 } });
    assert.equal(changed(again, plain), 0, 'deterministic backdrop');
    assert.equal(changed(none, plain), 0, 'style none draws nothing'); assert.equal(changed(zero, plain), 0, 'zero intensity draws nothing');
    for (const style of ['spotlight', 'glow', 'floor']) {
      const lit = await render({ lighting: { style, intensity: .8 } }), softer = await render({ lighting: { style, intensity: .3 } });
      assert.ok(changed(lit, plain) > 10000, `${style} changes the backdrop`);
      assert.ok(changed(lit, softer) > 1000, `${style} scales with intensity`);
      assert.equal(lit.html, plain.html, `${style} leaves the screen plane alone`);
    }
    const left = await render({ offset: [-.3, 0], lighting: { style: 'spotlight' } }), right = await render({ offset: [.3, 0], lighting: { style: 'spotlight' } });
    const at = (state, x) => state.background[(180 * 640 + x) * 4];
    assert.ok(at(left, 120) > at(right, 120) && at(right, 520) > at(left, 520), 'the light follows the screen');
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test('explicit default presentation values export frames identical to unset ones (framemd5)', { timeout: 120000 }, async () => {
  const studio = { asset: 'screen', presentation: 'studio', backdrop: 'paper', fit: 'cover', tilt: [14, -9, -3] };
  const root = await fixture([
    { id: 'studio-default', kind: 'screen', durationFrames: 6, screen: studio, camera: { shots } },
    { id: 'studio-explicit', kind: 'screen', durationFrames: 6, screen: { ...studio, padding: .13, offset: [0, 0], radius: 22, shadow: 'soft', frame: 'none', lighting: { style: 'none', intensity: .5 } }, camera: { shots } },
    { id: 'full-default', kind: 'screen', durationFrames: 6, screen: { asset: 'screen' }, camera: { shots } },
    { id: 'full-explicit', kind: 'screen', durationFrames: 6, screen: { asset: 'screen', radius: 0, shadow: 'none', frame: 'none', lighting: { style: 'none' } }, camera: { shots } },
  ], { width: 320, height: 180 });
  await renderProject(root);
  const md5 = (id) => execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(root, 'exports', 'clips', `${id}.mp4`), '-f', 'framemd5', '-'], { encoding: 'utf8' }).split('\n').filter((line) => line && !line.startsWith('#'));
  assert.equal(md5('studio-default').length, 6);
  assert.deepEqual(md5('studio-explicit'), md5('studio-default'));
  assert.deepEqual(md5('full-explicit'), md5('full-default'));
  assert.notDeepEqual(md5('full-default'), md5('studio-default'));
});

test('the Screen tab edits framing, surface, frame and lighting, previews drags, and applies the look to all shots', { timeout: 120000 }, async () => {
  const legacy = { id: 'legacy', preset: 'recorded-showcase', durationFrames: 48, params: { asset: 'screen' }, cameraMotion: { preset: 'orbit' } };
  const root = await fixture([{ id: 'tour', kind: 'screen', durationFrames: 48, screen: { asset: 'screen' }, camera: { shots } }, legacy, { id: 'title', preset: 'text-settle', durationFrames: 24, params: { title: 'Hello' } }]);
  const preview = await startPreview(root, 0, { agents: {} }), browser = await chromium.launch(browserLaunchOptions());
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } }), errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const saved = async () => (await scene(root, 'tour')).screen;
  try {
    await page.goto(preview.url);
    await page.waitForSelector('canvas[data-rendered-scene="tour"]', { timeout: 30000 });
    await page.getByRole('tab', { name: 'Screen' }).click();
    assert.equal(await page.getByRole('slider', { name: 'Padding' }).isDisabled(), true, 'padding needs a floating screen');
    await page.getByRole('button', { name: 'Floating' }).click();
    await eventually(async () => assert.equal((await saved()).presentation, 'studio'), 'floating');

    // Dragging previews on the stage without saving; releasing commits once.
    const media = page.locator('.stage-frame canvas[data-asset]'), padding = page.getByRole('slider', { name: 'Padding' });
    await eventually(async () => assert.equal(await padding.isDisabled(), false), 'padding enabled');
    // Saving the look updates the inspector before the asynchronous stage render
    // has recreated its media canvas. Measure only the visible rendered plane.
    const mediaBox = await eventually(async () => {
      const box = await media.boundingBox();
      assert.ok(box && box.width > 0 && box.height > 0, 'stage media is visible');
      return box;
    }, 'floating stage ready');
    const width = mediaBox.width, track = await page.locator('.MuiSlider-root', { has: padding }).boundingBox();
    const thumb = await page.locator('.MuiSlider-thumb', { has: padding }).boundingBox();
    await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2); await page.mouse.down();
    await page.mouse.move(track.x + 1, track.y + track.height / 2, { steps: 6 });
    await eventually(async () => assert.ok((await media.boundingBox()).width > width * 1.2, 'stage previews a larger screen'), 'drag preview');
    assert.equal((await saved()).padding, undefined, 'nothing saved mid-drag');
    await page.mouse.up();
    await eventually(async () => assert.equal((await saved()).padding, 0), 'drag commits');
    await padding.focus(); await page.keyboard.press('ArrowRight');
    await eventually(async () => assert.equal((await saved()).padding, .01), 'padding keyboard step');

    await page.getByRole('slider', { name: 'Position X' }).focus(); await page.keyboard.press('ArrowRight');
    await eventually(async () => assert.deepEqual((await saved()).offset, [.01, 0]), 'position x');
    await page.getByRole('slider', { name: 'Position Y' }).focus(); await page.keyboard.press('ArrowLeft');
    await eventually(async () => assert.deepEqual((await saved()).offset, [.01, -.01]), 'position y');
    await page.getByRole('button', { name: 'Center', exact: true }).click();
    await eventually(async () => assert.deepEqual((await saved()).offset, [0, 0]), 'center');
    await eventually(async () => assert.equal(await page.getByRole('button', { name: 'Center', exact: true }).isDisabled(), true), 'center disables once centered');

    await page.getByRole('slider', { name: 'Corner radius' }).focus(); await page.keyboard.press('ArrowRight');
    await eventually(async () => assert.equal((await saved()).radius, 23), 'radius');
    assert.equal(await page.getByRole('group', { name: 'Shadow' }).getByRole('button', { name: 'Soft' }).getAttribute('aria-pressed'), 'true', 'studio default shadow');
    await page.getByRole('group', { name: 'Shadow' }).getByRole('button', { name: 'Deep' }).click();
    await eventually(async () => assert.equal((await saved()).shadow, 'deep'), 'shadow');

    assert.equal(await page.getByLabel('Address').count(), 0, 'no title field without a frame');
    await page.getByRole('radio', { name: 'Dark browser' }).click();
    await eventually(async () => assert.equal((await saved()).frame, 'browser-dark'), 'frame');
    const address = page.getByLabel('Address');
    await address.fill('app.example.com'); await address.press('Enter');
    await eventually(async () => assert.equal((await saved()).frameTitle, 'app.example.com'), 'frame title');
    await eventually(async () => assert.equal(await page.locator('.stage-frame [data-frame="browser-dark"] [data-frame-title]').textContent(), 'app.example.com'), 'stage shows the chrome');
    await eventually(async () => assert.equal(await page.getByRole('radio', { name: 'Dark browser' }).getAttribute('aria-checked'), 'true'), 'frame card selected');
    await page.getByRole('radio', { name: 'Window' }).click();
    await eventually(async () => assert.equal((await saved()).frame, 'window'), 'window frame');
    await page.getByLabel('Window title').waitFor();
    const frameToggle = page.getByRole('button', { name: 'Frame areas', exact: true });
    await frameToggle.click();
    await eventually(async () => { assert.equal(await page.locator('.stage-frame [data-frame]').count(), 0); assert.equal(await page.locator('.frame-overlay').count(), 1); }, 'framing shows the bare recording');
    await frameToggle.click();
    await eventually(async () => assert.equal(await page.locator('.stage-frame [data-frame="window"]').count(), 1), 'chrome returns after framing');

    await page.getByRole('group', { name: 'Style' }).getByRole('button', { name: 'Spotlight' }).click();
    await eventually(async () => assert.deepEqual((await saved()).lighting, { style: 'spotlight' }), 'lighting style');
    await page.getByRole('slider', { name: 'Intensity' }).focus(); await page.keyboard.press('ArrowRight');
    await eventually(async () => assert.deepEqual((await saved()).lighting, { style: 'spotlight', intensity: .65 }), 'lighting intensity');

    const look = { presentation: 'studio', tilt: [14, -9, -3], backdrop: 'paper', fit: 'cover', padding: .01, offset: [0, 0], radius: 23, shadow: 'deep', frame: 'window', frameTitle: 'app.example.com', lighting: { style: 'spotlight', intensity: .65 } };
    assert.deepEqual(await saved(), { asset: 'screen', ...look });
    const titleBefore = await readFile(path.join(root, 'scenes', 'title.json'), 'utf8');
    await page.getByRole('button', { name: 'Apply to all shots' }).click();
    await page.getByRole('button', { name: 'Apply to 1 shot', exact: true }).click();
    await eventually(async () => { const next = await scene(root, 'legacy'); assert.equal(next.kind, 'screen'); assert.deepEqual(next.screen, { asset: 'screen', ...look }); }, 'look applied to the legacy shot');
    await page.getByText('Applied this look to 1 other shot.').waitFor();
    assert.equal(await readFile(path.join(root, 'scenes', 'title.json'), 'utf8'), titleBefore);
    await page.getByRole('button', { name: 'Undo' }).click();
    await eventually(async () => assert.deepEqual(await scene(root, 'legacy'), legacy), 'one undo restores the legacy shot');
    assert.deepEqual(await saved(), { asset: 'screen', ...look });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await preview.close(); }
});
