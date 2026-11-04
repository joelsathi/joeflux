import {useState} from 'react';
import {Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Typography} from '@wso2/oxygen-ui';
import {useStudio} from './studio-context.jsx';
import {sceneKind} from './api.js';

export function ScreenMatch({scene}) {
 const {project,run,setNotice}=useStudio();
 const [plan,setPlan]=useState(null),[selected,setSelected]=useState([]),[busy,setBusy]=useState(false);
 const open=async()=>{
  setBusy(true);
  try {const next=await run('screen_match_preview',{id:scene.id});setPlan(next);setSelected(next.eligible.map(s=>s.id));}
  catch { /* reported by run */ } finally {setBusy(false);}
 };
 const apply=async()=>{
  setBusy(true);
  try {
   const result=await run('screen_match',{id:scene.id,ids:selected});
   setNotice({severity:result.skipped.length?'warning':'success',message:`Applied this look to ${result.matched.length} other shot${result.matched.length===1?'':'s'}.${result.skipped.length?' Skipped: '+result.skipped.map(s=>`${s.id}: ${s.reason}`).join('; '):''}`});setPlan(null);
  } catch { /* reported by run */ } finally {setBusy(false);}
 };
 return <>
  <Button fullWidth size="small" variant="outlined" disabled={busy||!project.scenes.some(s=>s.id!==scene.id&&sceneKind(s)==='screen')} onClick={open}>Apply to all shots</Button>
  <Typography variant="caption" color="text.secondary" className="hint">Review eligible shots and choose where to copy this look. One undo restores them all.</Typography>
  <Dialog slotProps={{paper:{sx:{backgroundColor:'var(--ground)',backgroundImage:'none'}}}} open={Boolean(plan)} onClose={()=>!busy&&setPlan(null)} fullWidth maxWidth="sm">
   <DialogTitle>Apply screen look</DialogTitle>
   <DialogContent>
    <Typography sx={{mb:1}}>{plan?.eligible.length??0} eligible · {plan?.skipped.length??0} skipped</Typography>
    <FormControlLabel label="Select all eligible shots" control={<Checkbox checked={Boolean(plan?.eligible.length)&&selected.length===plan.eligible.length} indeterminate={selected.length>0&&selected.length<(plan?.eligible.length??0)} onChange={(_,checked)=>setSelected(checked?plan.eligible.map(s=>s.id):[])} />} />
    {plan?.eligible.map(item=><Box key={item.id}><FormControlLabel label={`${item.id}${item.converts?' (convert recording)':''}`} control={<Checkbox checked={selected.includes(item.id)} onChange={(_,checked)=>setSelected(ids=>checked?[...ids,item.id]:ids.filter(id=>id!==item.id))} />} /></Box>)}
    {plan?.skipped.map(item=><Typography key={item.id} variant="body2" color="text.secondary" sx={{mt:1}}>{item.id}: {item.reason}</Typography>)}
   </DialogContent>
   <DialogActions><Button disabled={busy} onClick={()=>setPlan(null)}>Cancel</Button><Button variant="contained" disabled={busy||!selected.length} onClick={apply}>Apply to {selected.length} shot{selected.length===1?'':'s'}</Button></DialogActions>
  </Dialog>
 </>;
}
