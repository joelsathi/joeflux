import { mediaTool } from '../../core/src/runtime.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function probeSilentVideo(filePath) {
  const { stdout } = await execFileAsync(mediaTool('ffprobe'), [
    '-v', 'error', '-count_frames', '-show_streams', '-of', 'json', filePath,
  ]);
  const streams = JSON.parse(stdout).streams ?? [];
  const videos = streams.filter((stream) => stream.codec_type === 'video');
  const audioStreams = streams.filter((stream) => stream.codec_type === 'audio').length;
  if (videos.length !== 1) throw new Error(`Expected one video stream in ${filePath}.`);
  if (audioStreams !== 0) throw new Error(`Expected a silent video, found ${audioStreams} audio stream(s) in ${filePath}.`);
  const video = videos[0];
  return {
    width: video.width,
    height: video.height,
    fps: video.avg_frame_rate,
    frames: Number(video.nb_read_frames ?? video.nb_frames),
    codec: video.codec_name,
    audioStreams,
  };
}
