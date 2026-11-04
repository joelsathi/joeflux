import { probeSilentVideo } from '../packages/assembly/src/media.js';
const target = process.argv[2];
if (!target) throw new Error('Usage: node scripts/verify-silent.mjs <video.mp4>');
process.stdout.write(`${JSON.stringify(await probeSilentVideo(target), null, 2)}\n`);
