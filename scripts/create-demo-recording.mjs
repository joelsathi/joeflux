// The demo project's screen recording is a generated FFmpeg test pattern, so it is not committed.
import { execFileSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { mediaTool } from '../packages/core/src/runtime.js';

const target = new URL('../projects/demo/assets/demo-recording.mp4', import.meta.url).pathname;
if (!(await access(target).then(() => true, () => false))) {
  execFileSync(mediaTool('ffmpeg'), ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30:d=6', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', target]);
}
