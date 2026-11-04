import {useRef,useState} from 'react';
import {Box,Button,Dialog,DialogActions,DialogContent,DialogTitle,FormControlLabel,Slider,Switch,ToggleButton,ToggleButtonGroup,Typography} from '@wso2/oxygen-ui';
import {useStudio} from './studio-context.jsx';

export function MotionBlurPanel({scene}) {
 const {commit,preview,run,progress}=useStudio();
 const blur=scene.motionBlur??{enabled:false,samples:8,shutter:.5},enabled=Boolean(scene.motionBlur)&&blur.enabled!==false;
 const samples=blur.samples??8,shutter=blur.shutter??.5;
 const [saving,setSaving]=useState(false),[rendering,setRendering]=useState(false),[result,setResult]=useState(null),[playing,setPlaying]=useState(true);
 const video=useRef(null);
 const save=async patch=>{
  const motionBlur={...blur,...patch};preview({motionBlur});setSaving(true);
  try {await commit('scene_update',{id:scene.id,patch:{motionBlur}});} finally {setSaving(false);}
 };
 const sample=async()=>{setRendering(true);try {setResult(await run('render_preview',{id:scene.id,seconds:1,at:.35,width:640}));setPlaying(true);}catch{ /* reported by run */ }finally{setRendering(false);}};
 return <>
  <FormControlLabel control={<Switch size="small" checked={enabled} disabled={saving||rendering} onChange={(_,checked)=>save({enabled:checked})} />} label={<Typography variant="caption">Motion blur (export)</Typography>} />
  <ToggleButtonGroup exclusive fullWidth size="small" aria-label="Motion blur quality" value={[4,8,16].includes(samples)?samples:null} disabled={saving||rendering} onChange={(_,value)=>value!==null&&save({samples:value})}>
   <ToggleButton value={4}>Draft</ToggleButton><ToggleButton value={8}>Balanced</ToggleButton><ToggleButton value={16}>High</ToggleButton>
  </ToggleButtonGroup>
  <Box sx={{mt:1.5}}><Typography variant="caption">Accumulation</Typography><ToggleButtonGroup exclusive fullWidth size="small" aria-label="Motion blur accumulation" value={blur.accumulator??'ffmpeg'} disabled={saving||rendering} onChange={(_,value)=>value&&save({accumulator:value})}><ToggleButton value="ffmpeg">FFmpeg</ToggleButton><ToggleButton value="webgl">WebGL</ToggleButton></ToggleButtonGroup></Box>
  <Box sx={{mt:1.5}}><Typography variant="caption">Samples · {samples}</Typography><Slider size="small" aria-label="Motion blur samples" min={2} max={16} step={1} value={samples} disabled={saving||rendering} onChange={(_,value)=>preview({motionBlur:{...blur,samples:value}})} onChangeCommitted={(_,value)=>save({samples:value})} /></Box>
  <Box><Typography variant="caption">Shutter · {Math.round(shutter*100)}%</Typography><Slider size="small" aria-label="Motion blur shutter" min={.1} max={1} step={.05} value={shutter} disabled={saving||rendering} onChange={(_,value)=>preview({motionBlur:{...blur,shutter:value}})} onChangeCommitted={(_,value)=>save({shutter:value})} /></Box>
  <Typography variant="caption" color="text.secondary" className="hint">{enabled?`Applies to exported clips only. ${samples} samples per frame; rendering takes about ${samples}× longer. The stage stays sharp.`:'Motion blur is off. Quality settings are saved for next time.'}</Typography>
  <Button size="small" variant="outlined" sx={{mt:1}} disabled={saving||rendering||Boolean(progress)} onClick={sample}>{rendering?'Rendering sample…':'Preview 1 second'}</Button>
  <Dialog slotProps={{paper:{sx:{backgroundColor:'var(--ground)',backgroundImage:'none'}}}} open={Boolean(result)} onClose={()=>setResult(null)} maxWidth="md" fullWidth>
   <DialogTitle>Export sample</DialogTitle>
   <DialogContent>{result&&<><video ref={video} src={result.url} autoPlay muted playsInline loop style={{width:'100%',display:'block'}} aria-label="Export sample video" /><Typography variant="caption">Frames {result.startFrame}–{result.startFrame+result.frames-1} · {result.width}×{result.height} · {result.fps} fps</Typography></>}</DialogContent>
   <DialogActions><Button onClick={()=>{if(playing)video.current?.pause();else video.current?.play().catch(()=>{});setPlaying(!playing);}}>{playing?'Pause':'Play'}</Button><Button onClick={()=>setResult(null)}>Close</Button></DialogActions>
  </Dialog>
 </>;
}
