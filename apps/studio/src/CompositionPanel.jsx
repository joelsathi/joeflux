import { useEffect, useState } from 'react';
import { Box, Button, FormControlLabel, MenuItem, Switch, TextField, Typography } from '@wso2/oxygen-ui';
import { DeclaredControls } from './DeclaredControls.jsx';
import { callTool, uniqueId } from './api.js';
import { useStudio } from './studio-context.jsx';
import { replacementErrors, minimumComponentHold } from '../../../packages/composition/src/model.js';

export function CompositionPanel({ scene }) {
  const { project, commit } = useStudio();
  const [definitions, setDefinitions] = useState([]), [selected, setSelected] = useState(scene.components[0]?.id ?? ''), [addType, setAddType] = useState('harness/shape');
  const [duration, setDuration] = useState(scene.durationFrames / project.output.fps);
  useEffect(() => { let live = true; callTool('component_list').then(items => { if (live) setDefinitions(items); }); return () => { live = false; }; }, []);
  useEffect(() => setDuration(scene.durationFrames / project.output.fps), [scene.durationFrames, project.output.fps]);
  const component = scene.components.find(item => item.id === selected) ?? scene.components[0];
  const definition = definitions.find(item => item.id === component?.component);
  const target = { id: scene.id, componentId: component?.id };
  const add = () => { const id = uniqueId(addType.split('/').at(-1), scene.components); commit('component_add', { id: scene.id, componentId: id, component: addType, inputs: addType === 'harness/proof' ? { asset: Object.keys(project.assets)[0] ?? '' } : undefined }); setSelected(id); };
  return <>
    <Typography variant="overline">Layers, from back to front</Typography>
    <TextField select fullWidth size="small" label="Component" value={component?.id ?? ''} onChange={event => setSelected(event.target.value)} sx={{ my: 1 }}>{scene.components.map(item => <MenuItem key={item.id} value={item.id}>{item.id} · {item.component.split('/').at(-1)}</MenuItem>)}</TextField>
    {component && definition && <>
      <DeclaredControls fields={[...definition.slots, ...definition.controls]} values={component.inputs} assets={project.assets} onChange={(input, value) => commit('component_set_input', { ...target, input, value })} />
      <TextField select fullWidth size="small" label="Compatible component" value={component.component} onChange={event => commit('component_replace', { ...target, component: event.target.value })} sx={{ mb: 1.5 }}>{definitions.filter(item => !replacementErrors(component, item).length).map(item => <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}</TextField>
      <TextField select fullWidth size="small" label="Shared anchor" value={component.layout.anchor} onChange={event => commit('component_bind_anchor', { ...target, anchor: event.target.value })} sx={{ mb: 1.5 }}>{definition.anchors.map(anchor => <MenuItem key={anchor} value={anchor}>{anchor}</MenuItem>)}</TextField>
      <Typography variant="caption" color="text.secondary">Reading hold: {(component.timing.holdFrames / project.output.fps).toFixed(1)}s · minimum {(minimumComponentHold(component, project.output.fps) / project.output.fps).toFixed(1)}s</Typography>
      <Box sx={{ my: 1 }}>{['copy', 'asset', 'layout', 'motion', 'beat'].map(scope => <FormControlLabel key={scope} label={`Lock ${scope}`} control={<Switch size="small" checked={Boolean(component.locks?.[scope])} onChange={event => commit('component_lock', { ...target, scope, locked: event.target.checked })} />} />)}</Box>
    </>}
    <Typography variant="overline">Shot duration</Typography>
    <TextField fullWidth size="small" label="Composition seconds" type="number" value={duration} onChange={event => setDuration(event.target.value)} onBlur={() => { const frames = Math.round(Number(duration) * project.output.fps); if (frames !== scene.durationFrames) commit('composition_retime', { id: scene.id, durationFrames: frames }); }} inputProps={{ min: 1, max: 600, step: .5 }} sx={{ my: 1 }} />
    <Typography variant="caption" color="text.secondary">Shorter durations preserve reading holds. Shorten copy if a requested duration cannot fit.</Typography>
    <Box sx={{ mt: 2 }}><TextField select size="small" fullWidth label="Add component" value={addType} onChange={event => setAddType(event.target.value)}>{definitions.map(item => <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}</TextField><Button onClick={add} disabled={addType === 'harness/proof' && !Object.keys(project.assets).length}>Add layer</Button></Box>
  </>;
}
