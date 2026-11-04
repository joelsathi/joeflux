import { ensureAnimationPlugins } from '../../animation-plugins/build.js';
import path from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { hashFile } from './decoder.js';
import { fingerprint } from '../../core/src/index.js';
import { compositionAssetIds } from '../../composition/src/model.js';

const HARNESS_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const hashes=new Map();
async function cachedHash(file) {
  const info=await stat(file),key=`${info.size}:${info.mtimeMs}:${info.ctimeMs}`,hit=hashes.get(file);
  if(hit?.key===key)return hit.hash;
  const hash=await hashFile(file);hashes.set(file,{key,hash});return hash;
}
export async function engineFingerprint(root=HARNESS_ROOT) {
  if(root===HARNESS_ROOT)await ensureAnimationPlugins();
  const files=[];
  async function walk(relative) {
    let entries;try{entries=await readdir(path.join(root,relative),{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}
    for(const entry of entries) {const file=path.join(relative,entry.name);if(entry.isDirectory())await walk(file);else files.push(file);}
  }
  for(const directory of ['packages/composition/src','packages/animation-plugins/src','packages/animation-plugins/dist','packages/schema/src','packages/motion/src','packages/motion/vendor','packages/presets/src','packages/presets/assets','packages/renderer/src','brand-kits']) await walk(directory);
  files.push('apps/preview/render.html');files.sort();
  return fingerprint(await Promise.all(files.map(async file=>[file,await cachedHash(path.join(root,file))])));
}
export async function sceneFingerprint(project,scene) {
  const names=[scene.params?.asset,scene.screen?.asset,scene.params?.outgoingAsset,scene.params?.incomingAsset,...(scene.assetDependencies??[]),...(scene.layers??[]).map(layer=>layer.asset),...compositionAssetIds(scene)].filter(Boolean);
  const files=names.map(name=>{const file=project.assets?.[name];if(!file)throw new Error(`Scene ${scene.id} refers to missing asset ${name}.`);return file;});
  files.push(...(scene.dependencies??[]));if(scene.module)files.push(scene.module);
  if(scene.background?.image){
    const { getPackBackground } = await import('../../presets/src/background-packs.js');
    const background=getPackBackground(scene.background.image);
    if(!background)throw new Error(`Unknown background ${scene.background.image}.`);
    files.push(background.relativeFile);
  }
  const versions=await Promise.all([...new Set(files)].sort().map(async file=>{
    const library=file.startsWith('brand-kits/');
    const absolute=path.resolve(library?path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'):project.root,file);
    const allowed=path.resolve(library?path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'):project.root);
    if(!absolute.startsWith(`${allowed}${path.sep}`))throw new Error(`Scene dependency escapes project: ${file}`);
    return [file,await cachedHash(absolute)];
  }));
  return fingerprint({output:project.output,theme:project.theme??'light-blue',brand:project.brand??'none',scene,versions,engine:await engineFingerprint()});
}
