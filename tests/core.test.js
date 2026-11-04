import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAssemblyPlan,
  createProjectManifest,
  evaluateCamera,
  mapSourceFrame,
  validateProject,
} from '../packages/core/src/index.js';

test('creates a silent 24 fps project manifest', () => {
  const project = createProjectManifest({ name: 'Product overview' });
  assert.equal(project.output.fps, 24);
  assert.equal(project.output.width, 1920);
  assert.equal(project.output.height, 1080);
  assert.equal(project.output.audio, false);
  assert.deepEqual(project.scenes, []);
});

test('rejects audio and invalid scene durations', () => {
  const project = createProjectManifest({ name: 'Invalid video' });
  project.output.audio = true;
  project.scenes.push({ id: 'bad scene', preset: 'text-settle', durationFrames: 0 });
  const result = validateProject(project);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /Audio is not supported/);
  assert.match(result.errors.join('\n'), /durationFrames/);
});

test('evaluates camera keyframes independently from source playback', () => {
  const camera = evaluateCamera({
    start: { x: 0, y: 0, z: 0, rotateX: 0, rotateY: 0, rotateZ: 0, scale: 1, focusX: .5, focusY: .5 },
    end: { x: 100, y: -20, z: 0, rotateX: 0, rotateY: 16, rotateZ: 0, scale: 1.1, focusX: .4, focusY: .6 },
    easing: 'easeInOut',
  }, 12, 24);
  assert.ok(camera.x > 50 && camera.x < 55);
  assert.ok(camera.rotateY > 8 && camera.rotateY < 9);
  assert.ok(camera.scale > 1.05 && camera.scale < 1.06);

  const sourceFrame = mapSourceFrame({ startFrame: 0, endFrame: 23, segments: [{ outputStart: 0, outputEnd: 11, rate: 2 }], holds: [] }, 6, 24);
  assert.equal(sourceFrame, 12);
});

test('holds a source frame while the camera can continue moving', () => {
  const sourceFrame = mapSourceFrame({
    startFrame: 4,
    endFrame: 30,
    segments: [],
    holds: [{ outputStart: 8, outputEnd: 16, sourceFrame: 17 }],
  }, 12, 24);
  assert.equal(sourceFrame, 17);
});

test('creates a silent assembly plan with frame-exact transition offsets', () => {
  const plan = buildAssemblyPlan({
    output: { fps: 24 },
    scenes: [
      { id: 'title', durationFrames: 48, transition: { type: 'crossfade', frames: 6 } },
      { id: 'showcase', durationFrames: 72 },
    ],
  });
  assert.equal(plan.totalFrames, 114);
  assert.deepEqual(plan.clips.map((clip) => clip.startFrame), [0, 42]);
  assert.equal(plan.ffmpegArgs.includes('-an'), true);
});
