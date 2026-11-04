import { mediaTool } from '../../core/src/runtime.js';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, rename, rm, stat, readdir, realpath } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { selectSourceFrame } from './source-frames.js';
import { loadProject } from '../../core/src/io.js';

const exec=promisify(execFile), pending=new Map(), probes=new Map();
// One ffprobe pass per recording version serves both frame decoding and source timing tools.
export async function probeSource(source,signal) {
  const info=await stat(source),key=JSON.stringify([source,info.size,info.mtimeMs,info.ctimeMs]);
  if(!probes.has(key)) {
    const task=exec(mediaTool('ffprobe'),['-v','error','-select_streams','v:0','-show_entries','stream=avg_frame_rate,duration:frame=best_effort_timestamp_time,pkt_duration_time','-of','json',source],{signal,maxBuffer:64*1024*1024}).then(({stdout})=>{
      const data=JSON.parse(stdout),frames=data.frames??[],first=Number(frames[0]?.best_effort_timestamp_time);
      const timestamps=frames.map(frame=>Number(frame.best_effort_timestamp_time)-first);
      if(!timestamps.length || timestamps.some((t,i)=>!Number.isFinite(t)||(i>0&&t<timestamps[i-1]))) throw new Error(`Invalid video timestamps: ${source}`);
      const [numerator,denominator]=(data.streams?.[0]?.avg_frame_rate??'0/1').split('/').map(Number);
      return {timestamps,sourceFps:numerator/denominator,lastFrameSeconds:Number(frames.at(-1).pkt_duration_time),streamSeconds:Number(data.streams?.[0]?.duration)};
    });
    probes.set(key,task);task.catch(()=>probes.delete(key));
    if(probes.size>16) probes.delete(probes.keys().next().value);
  }
  return probes.get(key);
}
export async function hashFile(file) {
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export async function getSourceFrame(source, seconds, {cacheRoot, signal}={}) {
  signal?.throwIfAborted();
  if(!Number.isFinite(seconds)) throw new Error('Source time must be finite.');
  const info=await stat(source);
  const identity=JSON.stringify([source,info.size,info.mtimeMs,info.ctimeMs,cacheRoot]);
  if(!pending.has(identity)) {
    const task=prepare(source,cacheRoot,signal);
    pending.set(identity,task); task.catch(()=>pending.delete(identity));
    if(pending.size>32) pending.delete(pending.keys().next().value);
  }
  const {directory,timestamps}=await pending.get(identity);
  signal?.throwIfAborted();
  const index=selectSourceFrame(timestamps,seconds);
  return {index,seconds:timestamps[index],path:path.join(directory,`${String(index).padStart(8,'0')}.png`)};
}
async function prepare(source,cacheRoot,signal) {
  const digest=await hashFile(source);
  const directory=path.join(cacheRoot??path.join(path.dirname(source),'.runtime','source-frames'),`pts-v1-${digest}`);
  try {const manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));await stat(path.join(directory,'00000000.png'));return {directory,...manifest};}catch{}
  signal?.throwIfAborted();
  const {timestamps}=await probeSource(source,signal);
  const temporary=`${directory}.decoding-${randomUUID()}`;
  await mkdir(temporary,{recursive:true});
  try {
    await exec(mediaTool('ffmpeg'),['-v','error','-y','-i',source,'-map','0:v:0','-an','-fps_mode','passthrough','-start_number','0',path.join(temporary,'%08d.png')],{signal,maxBuffer:4*1024*1024});
    const count=(await readdir(temporary)).filter(file=>file.endsWith('.png')).length;
    if(count!==timestamps.length) throw new Error(`Decoded ${count} frames but probed ${timestamps.length}: ${source}`);
    await writeFile(path.join(temporary,'manifest.json'),JSON.stringify({timestamps}));
    try {await rename(temporary,directory);}catch(error){if(!['EEXIST','ENOTEMPTY'].includes(error.code))throw error;await rm(temporary,{recursive:true,force:true});}
    return {directory,timestamps};
  }catch(error){await rm(temporary,{recursive:true,force:true});throw error;}
}

// project, when given, is a render snapshot: frames resolve against its assets, not the live files.
export async function serveSourceFrame(url,projectRoot,response,signal,project) {
  project??=await loadProject(projectRoot);
  const asset=project.assets?.[url.searchParams.get('asset')];
  if(!asset) throw new Error('Unknown source asset.');
  const root=await realpath(projectRoot),source=await realpath(path.resolve(root,asset));
  if(!source.startsWith(`${root}${path.sep}`)) throw new Error('Source asset escapes project.');
  const result=await getSourceFrame(source,Number(url.searchParams.get('time')),{cacheRoot:path.join(root,'.runtime','source-frames'),signal});
  response.writeHead(200,{'content-type':'image/png','cache-control':'no-store','x-source-index':String(result.index),'x-source-seconds':String(result.seconds)});
  const stream=createReadStream(result.path);stream.on('error',error=>response.destroy(error));stream.pipe(response);
}
