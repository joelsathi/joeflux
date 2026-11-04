import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ease } from '../packages/motion/src/timing.js';
import { cameraShots, evaluateShots, shotsFromStops, CAMERA_MOTIONS } from '../packages/motion/src/camera-motion.js';
import { validateProject } from '../packages/core/src/index.js';
import { EASINGS, screenSceneErrors } from '../packages/schema/src/scene.js';
import { buildVideoArgs } from '../packages/renderer/src/index.js';
import { createProjectTools, ToolError } from '../packages/tools/src/index.js';
import { renderProject } from '../packages/renderer/src/render.js';

const channels = (result) => ({ scale: result.zoom.scale, x: result.zoom.x, y: result.zoom.y, ...Object.fromEntries(['x', 'y', 'z', 'rotateX', 'rotateY', 'rotateZ', 'radius'].map((key) => [`pose.${key}`, result.pose[key]])) });
const sample = (camera, duration, frame) => channels(evaluateShots(camera, frame, duration));
const velocity = (camera, duration, frame, side, h = 1e-4) => {
  const a = sample(camera, duration, side < 0 ? frame - h : frame), b = sample(camera, duration, side < 0 ? frame : frame + h);
  return Object.fromEntries(Object.keys(a).map((key) => [key, (b[key] - a[key]) / h]));
};
// A pan through two areas that the camera passes on the way, then a hold.
const PAN = [{ at: 0, focus: [.25, .5], zoom: 2 }, { at: .25, focus: [.4, .5], zoom: 2 }, { at: .5, focus: [.6, .5], zoom: 2 }, { at: .75, focus: [.75, .5], zoom: 2 }, { at: 1, focus: [.75, .5], zoom: 2 }];

test('gentle, snappy and spring easings land exactly and the spring overshoot stays subtle', () => {
  for (const kind of ['gentle', 'snappy', 'spring']) {
    assert.equal(ease(0, kind), 0, kind); assert.equal(ease(1, kind), 1, kind);
    assert.equal(ease(-1, kind), 0, kind); assert.equal(ease(2, kind), 1, kind);
    assert.ok(Math.abs(ease(1e-4, kind)) < 1e-3, `${kind} starts from rest`);
    assert.ok(EASINGS.includes(kind));
  }
  for (const kind of ['gentle', 'snappy']) {
    assert.ok(Math.abs(ease(.5, kind) - .5) < 1e-12, kind);
    for (let i = 1; i <= 1000; i += 1) assert.ok(ease(i / 1000, kind) >= ease((i - 1) / 1000, kind), `${kind} is monotone`);
  }
  let peak = 0;
  for (let i = 0; i <= 10000; i += 1) peak = Math.max(peak, ease(i / 10000, 'spring'));
  assert.ok(peak > 1.02 && peak < 1.06, `spring peak ${peak}`);
  assert.ok(Math.abs(ease(.999, 'spring') - 1) < 1e-4, 'spring has settled before the end');
  // Existing kinds are unchanged.
  assert.equal(ease(.3, 'smootherstep'), .3 * .3 * .3 * (.3 * (.3 * 6 - 15) + 10));
  assert.equal(ease(.3), .3 * .3 * (3 - 2 * .3));
  assert.equal(ease(.3, 'easeOut'), 1 - .7 ** 3);
  assert.equal(ease(.3, 'linear'), .3);
});

test('without flow or drift, shots evaluate exactly as the per-segment eased path', () => {
  // The pre-flow evaluator, kept as the reference for byte-identical output.
  const reference = (camera, frame, duration) => {
    const last = duration - 1, keys = camera.shots.map((shot) => ({ frame: shot.at * last, ease: shot.ease, shot }));
    const at = (shot) => { const zoom = shot.zoom ?? 1, bound = (v) => Math.max(.5 / zoom, Math.min(1 - .5 / zoom, v)), [fx, fy] = shot.focus ?? [.5, .5]; return { scale: zoom, x: (.5 - bound(fx)) * zoom, y: (.5 - bound(fy)) * zoom, ...Object.fromEntries(['x', 'y', 'z', 'rotateX', 'rotateY', 'rotateZ', 'radius'].map((key) => [`pose.${key}`, shot.pose?.[key] ?? 0])) }; };
    const right = keys.findIndex((key) => key.frame > frame);
    if (right <= 0) return at(keys[right < 0 ? keys.length - 1 : 0].shot);
    const a = at(keys[right - 1].shot), b = at(keys[right].shot), t = ease((frame - keys[right - 1].frame) / (keys[right].frame - keys[right - 1].frame), keys[right].ease ?? camera.ease ?? 'smootherstep');
    return Object.fromEntries(Object.keys(a).map((key) => [key, a[key] + (b[key] - a[key]) * t]));
  };
  const cameras = [...CAMERA_MOTIONS.map((preset) => ({ shots: cameraShots({ preset, focusX: .1, focusY: .9, endFocusX: .95 }, 101) })), { shots: PAN, ease: 'easeInOut' }, { shots: PAN, flow: false, drift: 0 }];
  for (const camera of cameras) for (let frame = 0; frame <= 100; frame += .5) {
    const actual = sample(camera, 101, frame), expected = reference(camera, frame, 101);
    for (const key of Object.keys(expected)) assert.equal(actual[key], key === 'scale' ? expected[key] : expected[key] || 0, `${key} at ${frame}`);
  }
});

test('flow is velocity-continuous through areas, never overshoots them, and keeps holds exact', () => {
  const duration = 101, knots = PAN.map((shot) => shot.at * (duration - 1)), flow = { shots: PAN, flow: true }, eased = { shots: PAN };
  for (const knot of knots.slice(1, 3)) {
    const left = velocity(flow, duration, knot, -1), right = velocity(flow, duration, knot, 1);
    assert.ok(Math.abs(left.x) > 1e-3, `flow keeps moving through frame ${knot} (${left.x})`);
    assert.ok(Math.abs(left.x - right.x) < 1e-4 * Math.max(1, Math.abs(left.x)) + 1e-6, `continuous velocity at ${knot}: ${left.x} vs ${right.x}`);
    const stopped = velocity(eased, duration, knot, 1);
    assert.ok(Math.abs(stopped.x) < 1e-6, `without flow the camera stops at ${knot}`);
  }
  assert.ok(Math.abs(velocity(flow, duration, 0, 1).x) < 1e-6 && Math.abs(velocity(flow, duration, 75, -1).x) < 1e-6, 'the run starts and ends at rest');
  for (let frame = 75; frame <= 100; frame += .25) assert.deepEqual(sample(flow, duration, frame), sample(flow, duration, 75), `hold at ${frame}`);

  // Uneven spacing, reversals, zoom and pose changes: every channel stays inside each segment's knot range.
  const shots = [{ at: 0 }, { at: .1, focus: [.3, .3], zoom: 1.6 }, { at: .35, focus: [.5, .35], zoom: 2.4 }, { at: .4, focus: [.8, .7], zoom: 3, pose: { rotateY: 8, z: -200 } }, { at: .8, focus: [.2, .7], zoom: 1.5, pose: { rotateY: -4 } }, { at: .8, focus: [.5, .5], zoom: 2 }, { at: .9, focus: [.6, .4], zoom: 2.5 }, { at: 1 }];
  const camera = { shots, flow: true };
  for (let index = 1; index < shots.length; index += 1) {
    const a = shots[index - 1].at * (duration - 1), b = shots[index].at * (duration - 1);
    if (b <= a) continue;
    const start = sample(camera, duration, a), end = sample({ shots: shots.slice(0, index + 1), flow: true }, duration, b);
    for (let step = 0; step < 64; step += 1) {
      const frame = a + (b - a) * step / 64, value = sample(camera, duration, frame);
      for (const key of Object.keys(value)) assert.ok(value[key] >= Math.min(start[key], end[key]) - 1e-9 && value[key] <= Math.max(start[key], end[key]) + 1e-9, `${key} at ${frame}: ${value[key]} outside ${start[key]}..${end[key]}`);
    }
  }
});

test('flow keeps the recording covering the screen and leaves single moves eased', () => {
  // Zooming in toward an edge, then re-centring while zooming further: channels take different shapes.
  const camera = { shots: [{ at: 0 }, { at: .5, focus: [.25, .5], zoom: 2 }, { at: 1, focus: [.5, .5], zoom: 3 }], flow: true };
  for (let frame = 0; frame <= 100; frame += .5) { const { zoom } = evaluateShots(camera, frame, 101); assert.ok(zoom.scale >= 1 && Math.abs(zoom.x) <= (zoom.scale - 1) / 2 + 1e-12, `covered at ${frame}`); }
  // Paced areas arrive, then hold: each move is on its own, so flow keeps its easing.
  const paced = shotsFromStops([{ focus: [.2, .3], zoom: 2 }, { focus: [.7, .6], zoom: 2.5 }]);
  for (let frame = 0; frame <= 100; frame += 1) assert.deepEqual(evaluateShots({ shots: paced, flow: true, ease: 'snappy' }, frame, 101), evaluateShots({ shots: paced, ease: 'snappy' }, frame, 101));
});

test('spring overshoots into a zoom but never uncovers the recording on the way out', () => {
  const camera = { shots: [{ at: 0 }, { at: .4, focus: [.2, .5], zoom: 2 }, { at: .6, focus: [.2, .5], zoom: 2 }, { at: 1 }], ease: 'spring' };
  let most = 0;
  for (let frame = 0; frame <= 100; frame += .25) {
    const { zoom } = evaluateShots(camera, frame, 101); most = Math.max(most, zoom.scale);
    assert.ok(zoom.scale >= 1 && Math.abs(zoom.x) <= (zoom.scale - 1) / 2 + 1e-12, `covered at ${frame}`);
  }
  assert.ok(most > 2.02, `spring overshoots the zoom (${most})`);
  assert.deepEqual(evaluateShots(camera, 100, 101).zoom, { scale: 1, x: 0, y: 0, strength: 0 });
});

test('drift orbits mid-shot and is exactly zero on the first and last frame', () => {
  const shots = cameraShots({ preset: 'focus-zoom' }, 97), plain = { shots }, drifting = { shots, drift: .8 };
  for (const frame of [0, 96]) assert.deepEqual(evaluateShots(drifting, frame, 97), evaluateShots(plain, frame, 97));
  const mid = evaluateShots(drifting, 48, 97).pose, quarter = evaluateShots(drifting, 24, 97).pose;
  assert.ok(Math.abs(mid.rotateX - 2) < 1e-9 && Math.abs(mid.z + 96) < 1e-9, `mid ${mid.rotateX}, ${mid.z}`);
  assert.ok(Math.abs(quarter.rotateY - .8 * 6 * Math.SQRT1_2) < 1e-9, `quarter rotateY ${quarter.rotateY}`);
  assert.deepEqual(evaluateShots(drifting, 48, 97).zoom, evaluateShots(plain, 48, 97).zoom, 'drift leaves the framing alone');
  for (const frame of [0, 1]) assert.deepEqual(evaluateShots({ shots: [{ at: 0 }], drift: 1 }, frame, 2), evaluateShots({ shots: [{ at: 0 }] }, frame, 2));
});

test('the schema and validator accept camera style and motion blur and reject bad values', () => {
  const output = { width: 320, height: 180, fps: 24, audio: false }, check = (scene) => validateProject({ output, assets: { screen: 'a.mp4' }, scenes: [scene] });
  const screen = { id: 'tour', kind: 'screen', durationFrames: 48, screen: { asset: 'screen' }, camera: { shots: [{ at: 0 }, { at: 1, focus: [.5, .5], zoom: 2, ease: 'snappy' }], ease: 'spring', flow: true, drift: .5 }, motionBlur: { samples: 4, shutter: .5 } };
  assert.deepEqual(screenSceneErrors(screen), []);
  assert.equal(check(screen).valid, true);
  assert.equal(check({ ...screen, motionBlur: {} }).valid, true);
  const errors = (scene) => check(scene).errors.join('\n');
  assert.match(errors({ ...screen, camera: { ...screen.camera, drift: 1.5 } }), /camera\.drift/);
  assert.match(errors({ ...screen, camera: { ...screen.camera, flow: 'yes' } }), /camera\.flow/);
  assert.match(errors({ ...screen, camera: { ...screen.camera, ease: 'bouncy' } }), /camera\.ease/);
  for (const motionBlur of [{ samples: 1 }, { samples: 17 }, { samples: 2.5 }, { shutter: 0 }, { shutter: 1.5 }, { samples: 4, extra: true }, 'on']) assert.match(errors({ ...screen, motionBlur }), /motionBlur/, JSON.stringify(motionBlur));
  const title = { id: 'title', preset: 'text-settle', durationFrames: 24, params: { title: 'Hello' } };
  assert.equal(check({ ...title, motionBlur: { samples: 8, shutter: .5 } }).valid, true);
  for (const motionBlur of [{ samples: 20 }, { shutter: .05 }, null]) assert.match(errors({ ...title, motionBlur }), /motionBlur needs whole-number samples 2–16 and shutter 0\.1–1/, JSON.stringify(motionBlur));
});

test('video arguments are unchanged without blur and average each sub-frame group with it', () => {
  const plain = ['-v', 'error', '-y', '-f', 'image2pipe', '-vcodec', 'png', '-framerate', '24', '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', 'out.mp4'];
  assert.deepEqual(buildVideoArgs({ fps: 24, outputPath: 'out.mp4' }), plain);
  assert.deepEqual(buildVideoArgs({ fps: 24, outputPath: 'out.mp4', blurSamples: 1 }), plain);
  const blurred = buildVideoArgs({ fps: 30, outputPath: 'out.mp4', blurSamples: 4 });
  assert.deepEqual(blurred.slice(0, 16), ['-v', 'error', '-y', '-f', 'image2pipe', '-vcodec', 'png', '-framerate', '120', '-i', 'pipe:0', '-vf', "tmix=frames=4,select='not(mod(n+1\\,4))',setpts=N/(30*TB)", '-r', '30', '-an']);
  assert.deepEqual(blurred.slice(16), plain.slice(12));
});

async function toolFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'harness camera style '));
  await mkdir(path.join(root, 'scenes')); await mkdir(path.join(root, 'assets'));
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=24:d=1', '-an', '-c:v', 'libx264', path.join(root, 'assets', 'clip.mp4')]);
  await writeFile(path.join(root, 'scenes', 'legacy.json'), JSON.stringify({ id: 'legacy', preset: 'recorded-showcase', durationFrames: 48, params: { asset: 'screen' }, cameraMotion: { preset: 'orbit', strength: .5 } }));
  await writeFile(path.join(root, 'scenes', 'title.json'), JSON.stringify({ id: 'title', preset: 'text-settle', durationFrames: 24, params: { title: 'Hello' } }));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ name: 'Camera style', version: 1, output: { width: 320, height: 180, fps: 24, audio: false }, assets: { screen: 'assets/clip.mp4' }, scenes: [{ id: 'legacy', file: 'scenes/legacy.json' }, { id: 'title', file: 'scenes/title.json' }] }));
  return root;
}

test('camera_style converts legacy scenes, merges into the camera and undoes in one step', async () => {
  const root = await toolFixture(), tools = createProjectTools(root), file = path.join(root, 'scenes', 'legacy.json'), json = async () => JSON.parse(await readFile(file, 'utf8'));
  const original = await readFile(file, 'utf8'), list = tools.list(), style = list.findIndex((tool) => tool.name === 'camera_style');
  assert.equal(list[style - 1].name, 'camera_frame_areas');
  assert.deepEqual(Object.keys(list[style].inputSchema.properties), ['id', 'ease', 'flow', 'drift']);
  assert.match(list[style].inputSchema.properties.flow.description, /holds still pause/i);

  await tools.call('camera_style', { id: 'legacy', ease: 'spring', flow: true, drift: .4 });
  const converted = await json();
  assert.equal(converted.kind, 'screen'); assert.equal(converted.cameraMotion, undefined); assert.equal(converted.preset, undefined);
  assert.deepEqual(converted.camera.move, { preset: 'orbit', strength: .5 }, 'keeps the ready-made move');
  assert.equal(converted.camera.shots.length, 6);
  assert.deepEqual({ ease: converted.camera.ease, flow: converted.camera.flow, drift: converted.camera.drift }, { ease: 'spring', flow: true, drift: .4 });

  await tools.call('camera_style', { id: 'legacy', drift: .7 });
  assert.deepEqual((await json()).camera, { ...converted.camera, drift: .7 }, 'only the given keys change');
  await tools.call('camera_style', { id: 'legacy', flow: false, drift: 0 });
  const cleared = (await json()).camera;
  assert.equal('flow' in cleared, false); assert.equal('drift' in cleared, false); assert.equal(cleared.ease, 'spring');

  await tools.call('history_undo');
  assert.deepEqual((await json()).camera, { ...converted.camera, drift: .7 });
  await tools.call('history_undo'); await tools.call('history_undo');
  assert.equal(await readFile(file, 'utf8'), original, 'undo restores the legacy file exactly');

  const rejects = (input, pattern) => assert.rejects(tools.call('camera_style', input), (error) => error instanceof ToolError && pattern.test([error.message, ...error.issues].join('\n')));
  await rejects({ id: 'legacy', drift: 2 }, /drift/);
  await rejects({ id: 'legacy', ease: 'bouncy' }, /ease/);
  await rejects({ id: 'legacy' }, /set ease, flow or drift/);
  await rejects({ id: 'legacy', easing: 'spring' }, /easing/);
  await rejects({ id: 'title', flow: true }, /not a screen shot/);
  assert.equal(await readFile(file, 'utf8'), original);
});

async function blurFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'harness motion blur '));
  await mkdir(path.join(root, 'scenes')); await mkdir(path.join(root, 'assets'));
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=640x360', '-frames:v', '1', path.join(root, 'assets', 'still.png')]);
  // Holds on the full view for frames 0–6, zooms in fast over frames 6–10, then holds.
  const scene = (id, extra = {}) => ({ id, kind: 'screen', durationFrames: 16, background: { style: 'static' }, screen: { asset: 'screen' }, camera: { shots: [{ at: 0 }, { at: .4 }, { at: 10 / 15, focus: [.8, .3], zoom: 3, ease: 'linear' }, { at: 1, focus: [.8, .3], zoom: 3 }] }, ...extra });
  await writeFile(path.join(root, 'scenes', 'sharp.json'), JSON.stringify(scene('sharp')));
  await writeFile(path.join(root, 'scenes', 'blurred.json'), JSON.stringify(scene('blurred', { motionBlur: { samples: 4, shutter: 1 } })));
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ name: 'Motion blur', version: 1, output: { width: 320, height: 180, fps: 24, audio: false }, assets: { screen: 'assets/still.png' }, scenes: [{ id: 'sharp', file: 'scenes/sharp.json' }, { id: 'blurred', file: 'scenes/blurred.json' }] }));
  return root;
}
const frames = (file) => {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 64 << 20 }), size = 320 * 180 * 3;
  return Array.from({ length: raw.length / size }, (_, index) => raw.subarray(index * size, (index + 1) * size));
};
const difference = (a, b) => { let sum = 0; for (let index = 0; index < a.length; index += 1) sum += Math.abs(a[index] - b[index]); return sum / a.length; };

test('motion blur exports exact silent frames, leaves held frames sharp and streaks fast ones', async () => {
  const root = await blurFixture(), progress = [];
  await renderProject(root, { onProgress: (event) => progress.push(event) });
  assert.deepEqual(progress.filter((event) => event.scene === 'blurred').map((event) => event.frame), Array.from({ length: 16 }, (_, index) => index + 1), 'progress counts output frames');
  const clip = (id) => path.join(root, 'exports', 'clips', `${id}.mp4`);
  const media = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-of', 'json', clip('blurred')], { encoding: 'utf8' }));
  assert.equal(media.streams.length, 1); assert.equal(media.streams[0].codec_type, 'video');
  assert.equal(Number(media.streams[0].nb_read_frames), 16); assert.equal(media.streams[0].r_frame_rate, '24/1');
  const sharp = frames(clip('sharp')), blurred = frames(clip('blurred'));
  assert.equal(blurred.length, 16);
  for (const frame of [2, 14]) assert.ok(difference(sharp[frame], blurred[frame]) < 1.5, `held frame ${frame} stays sharp (${difference(sharp[frame], blurred[frame])})`);
  const moving = difference(sharp[8], blurred[8]);
  assert.ok(moving > 4, `fast frame blurs (${moving})`);
});
