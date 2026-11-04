import { evaluateSourceTime } from '../../motion/src/timing.js';

export function isVideoAsset(assetPath = '') { return /\.(mp4|m4v|mov|webm)$/i.test(assetPath); }
export function sourceSecondsForFrame(scene, frame, outputFps) { return evaluateSourceTime(scene.playback, frame, outputFps); }

// Presentation intervals are [pts[i], pts[i+1]); clamp outside the source.
export function selectSourceFrame(timestamps, seconds) {
  if (!timestamps.length || !Number.isFinite(seconds)) throw new Error('A finite source time and nonempty timestamps are required.');
  let lo=0, hi=timestamps.length;
  while(lo<hi) { const mid=(lo+hi)>>>1; if(timestamps[mid]<=seconds+1e-9) lo=mid+1; else hi=mid; }
  return Math.max(0,lo-1);
}

// Immutable decoded images avoid competing seeks during rapid scrubbing.
export function createAssetLoader(project, {assetBase='/assets',frameEndpoint='/api/source-frame'}={}) {
  const images=new Map();
  return async function load(assetId, seconds=0) {
    if(!assetId) return null;
    const assetPath=project.assets?.[assetId];
    if(!assetPath) throw new Error(`Missing declared asset "${assetId}".`);
    const url=isVideoAsset(assetPath)
      ? `${frameEndpoint}?asset=${encodeURIComponent(assetId)}&time=${seconds}`
      : `${assetBase}/${assetPath.split('/').map(encodeURIComponent).join('/')}`;
    if(!images.has(url)) {
      const pending=(async()=>{const image=new Image();image.src=url;try{await image.decode();}catch{throw new Error(`Could not decode asset ${assetId} at ${seconds}s.`);}return image;})();
      images.set(url,pending); pending.catch(()=>images.delete(url));
      if(images.size>48) images.delete(images.keys().next().value);
    }
    return images.get(url);
  };
}
