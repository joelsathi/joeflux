import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProject, saveScene } from '../packages/core/src/io.js';
import { assetUrlForScene } from '../apps/preview/src/project-assets.js';

test('loads scene specifications from the project scenes directory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'joeflux-project-'));
  await mkdir(join(directory, 'scenes'));
  await writeFile(join(directory, 'project.json'), JSON.stringify({
    version: 1,
    name: 'Test',
    output: { width: 1920, height: 1080, fps: 24, audio: false },
    assets: { screen: 'assets/screen.svg' },
    scenes: [{ id: 'intro', file: 'scenes/intro.json' }],
  }));
  await writeFile(join(directory, 'scenes/intro.json'), JSON.stringify({ id: 'intro', preset: 'text-settle', durationFrames: 24 }));
  const project = await loadProject(directory);
  assert.equal(project.scenes[0].preset, 'text-settle');
  assert.equal(project.scenes[0].file, 'scenes/intro.json');
});

test('rejects a stale scene save instead of overwriting an external edit', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'joeflux-project-'));
  const scenePath = join(directory, 'scene.json');
  await writeFile(scenePath, JSON.stringify({ id: 'intro', preset: 'text-settle', durationFrames: 24 }));
  await assert.rejects(
    saveScene(scenePath, { id: 'intro', preset: 'text-settle', durationFrames: 48 }, 'not-the-current-fingerprint'),
    /changed outside the preview/
  );
});

test('maps a selected project asset to the loopback preview route', () => {
  assert.equal(
    assetUrlForScene({ assets: { recording: 'assets/demo screen.svg' } }, { params: { asset: 'recording' } }),
    '/project-assets/assets/demo%20screen.svg'
  );
  assert.equal(assetUrlForScene({ assets: {} }, { params: { asset: 'missing' } }), null);
});
