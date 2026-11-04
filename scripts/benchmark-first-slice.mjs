import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProject } from '../packages/core/src/io.js';
import { validateProject } from '../packages/core/src/index.js';
import { dataDigest } from '../packages/plugins/src/registry.js';
import { hashFile } from '../packages/renderer/src/decoder.js';
import { renderScene, sceneFingerprint } from '../packages/renderer/src/render.js';
import { probeSilentVideo } from '../packages/assembly/src/media.js';

const repository = fileURLToPath(new URL('../', import.meta.url));
export async function benchmarkCases() {
  const definition = JSON.parse(await readFile(path.join(repository, 'benchmarks/first-slice.json'), 'utf8'));
  const cases = [], content = new Map();
  for (const format of definition.formats) {
    const project = await loadProject(path.join(repository, format.project));
    const validation = validateProject(project);
    if (!validation.valid) throw new Error(validation.errors.join('\n'));
    const [w,h] = format.ratio.split(':').map(Number);
    if (project.output.width*h !== project.output.height*w || project.output.fps !== 24 || project.output.audio !== false) throw new Error(`Benchmark output changed: ${format.id}`);
    const assets = Object.fromEntries(await Promise.all(Object.entries(project.assets).map(async ([id,file]) => [id,await hashFile(path.join(project.root,file))])));
    for (const brief of definition.briefs) {
      const scene = project.scenes.find(item => item.id === brief.id);
      if (!scene || scene.durationFrames !== brief.durationFrames) throw new Error(`Benchmark duration changed: ${format.id}/${brief.id}`);
      // Layout may adapt to format; copy, evidence, motion and duration must stay identical.
      const comparable = {assets,components:scene.components.map(({layout,...component})=>component),durationFrames:scene.durationFrames,background:scene.background};
      const contentDigest = dataDigest(comparable);
      if (content.has(brief.id) && content.get(brief.id)!==contentDigest) throw new Error(`Benchmark content differs across formats: ${brief.id}`);
      content.set(brief.id,contentDigest);
      cases.push({id:`${brief.id}/${format.id}`,brief,format,project,scene,contentDigest});
    }
  }
  return {definition,cases};
}

export async function runBenchmark({render=false}={}) {
  const {definition,cases} = await benchmarkCases();
  const records=[];
  for (const item of cases) {
    const {id,format,project,scene,contentDigest}=item;
    const record={id,contentDigest,inputFingerprint:await sceneFingerprint(project,scene),output:project.output,previewWidth:format.previewWidth,status:render?'pending':'validated',previewRenderMilliseconds:null,firstFrameMilliseconds:null,nodePeakRssBytes:null,renderFailure:null,humanMetrics:Object.fromEntries(definition.humanMetrics.map(key=>[key,null])),creativeApproval:false};
    if (render) {
      const started=performance.now(); let firstFrame;
      try {
        const result=await renderScene(project,scene,{preview:{startFrame:0,frames:scene.durationFrames,width:format.previewWidth,height:Math.round(format.previewWidth*project.output.height/project.output.width)},onProgress:detail=>{if(firstFrame===undefined&&detail.frame>=1)firstFrame=performance.now()-started;}});
        const media=await probeSilentVideo(result.outputPath);
        if (media.frames!==scene.durationFrames) throw new Error('Frame count mismatch.');
        Object.assign(record,{status:'rendered',previewRenderMilliseconds:Math.round(performance.now()-started),firstFrameMilliseconds:firstFrame===undefined?null:Math.round(firstFrame),media,artifact:path.relative(repository,result.outputPath)});
      } catch(error) {record.status='failed';record.renderFailure=error.message;}
      // Node process only; Chromium/GPU/FFmpeg process memory is deliberately not inferred.
      record.nodePeakRssBytes=process.resourceUsage().maxRSS*1024;
    }
    records.push(record);
    console.log(`${record.status}: ${id}${record.previewRenderMilliseconds===null?'':` (${record.previewRenderMilliseconds} ms)`}`);
  }
  const result={benchmark:definition.id,definitionDigest:dataDigest(definition),at:new Date().toISOString(),environment:{node:process.version,platform:process.platform,arch:process.arch},mode:render?'preview-render':'validation',renderFailures:records.filter(r=>r.status==='failed').length,records,limitations:['Low-resolution preview elapsed time includes browser and encoding setup, not final export latency.','Node peak RSS is cumulative for this process; it excludes Chromium, GPU and FFmpeg.','Acceptance time, author effort, corrections, comprehension and normal-speed creative judgment require recorded human evidence.']};
  const output=path.join(repository,'.runtime/benchmarks',`${definition.id}-${render?'render':'validation'}.json`);
  await mkdir(path.dirname(output),{recursive:true}); await writeFile(output,JSON.stringify(result,null,2)+'\n');
  return {result,output};
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  if (args.some(arg=>!['--render'].includes(arg))) throw new Error('Usage: pnpm benchmark [--render]');
  const {result,output}=await runBenchmark({render:args.includes('--render')});
  console.log(output); if (result.renderFailures)process.exitCode=1;
}
