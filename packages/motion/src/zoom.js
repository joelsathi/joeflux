const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smooth = (value) => { const t = clamp(value); return t * t * (3 - 2 * t); };

export function evaluateZoom(region, frame) {
  if (!region) return { scale: 1, x: 0, y: 0, strength: 0 };
  const entry = Math.max(1, region.entryFrames ?? 12);
  const exit = Math.max(1, region.exitFrames ?? 12);
  const inStrength = smooth((frame - region.startFrame) / entry);
  const outStrength = 1 - smooth((frame - (region.endFrame - exit)) / exit);
  const strength = clamp(Math.min(inStrength, outStrength));
  const scale = 1 + ((region.scale ?? 1) - 1) * strength;
  const focus = evaluateFocus(region,frame);
  const focusX = clamp(focus.focusX ?? .5, 1 / scale / 2, 1 - 1 / scale / 2);
  const focusY = clamp(focus.focusY ?? .5, 1 / scale / 2, 1 - 1 / scale / 2);
  return { scale, x: (.5 - focusX) * scale, y: (.5 - focusY) * scale, strength };
}

function evaluateFocus(region,frame) {
  const keys=region.focusKeyframes;
  if(!keys?.length)return region;
  const right=keys.findIndex(key=>key.frame>frame);
  if(right===0)return keys[0];if(right<0)return keys.at(-1);
  const a=keys[right-1],b=keys[right],t=smooth((frame-a.frame)/(b.frame-a.frame));
  return {focusX:a.focusX+(b.focusX-a.focusX)*t,focusY:a.focusY+(b.focusY-a.focusY)*t};
}
