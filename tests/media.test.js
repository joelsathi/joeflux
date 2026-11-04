import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { probeSilentVideo } from '../packages/assembly/src/media.js';

test('accepts a silent H.264 video and reports its frame rate', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'joeflux-media-'));
  const output = join(directory, 'silent.mp4');
  const result = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=1920x1080:r=24:d=1', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', output]);
  assert.equal(result.status, 0, result.stderr.toString());
  const info = await probeSilentVideo(output);
  assert.equal(info.audioStreams, 0);
  assert.equal(info.width, 1920);
  assert.equal(info.fps, '24/1');
});
