import {TRANSITIONS} from '../../presets/src/transitions.js';
export function buildFilterGraph({ fps, clips }) {
  if (!clips.length) throw new Error('Cannot assemble an empty video.');
  const inputs = clips.map((_, index) => `[${index}:v]settb=1/${fps},setpts=PTS-STARTPTS[v${index}]`);
  let active = '[v0]';
  let elapsed = clips[0].durationFrames / fps;
  let label = 0;
  const filters = [...inputs];
  for (let index = 1; index < clips.length; index += 1) {
    const previous = clips[index - 1];
    const duration = clips[index].durationFrames / fps;
    const transition = previous.transition;
    label += 1;
    if (TRANSITIONS[transition?.type]) {
      const fade = transition.frames / fps;
      const offset = elapsed - fade;
      filters.push(`${active}[v${index}]xfade=transition=${TRANSITIONS[transition.type]}:duration=${formatSeconds(fade)}:offset=${formatSeconds(offset)}[mix${label}];[mix${label}]settb=1/${fps}[timed${label}]`);
      elapsed += duration - fade;
    } else {
      filters.push(`${active}[v${index}]concat=n=2:v=1:a=0[mix${label}];[mix${label}]settb=1/${fps}[timed${label}]`);
      elapsed += duration;
    }
    active = `[timed${label}]`;
  }
  filters.push(`${active}format=yuv420p[video]`);
  return { filter: filters.join(';'), args: ['-filter_complex', filters.join(';'), '-map', '[video]', '-an', '-shortest'] };
}

function formatSeconds(value) {
  return Number(value.toFixed(6)).toString();
}
