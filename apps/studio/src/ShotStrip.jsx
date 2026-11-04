import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, ButtonBase, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, ArrowRight, Copy, Ellipsis, MonitorPlay, Plus, Sparkles, Trash2, Type } from '@wso2/oxygen-ui-icons-react';
import { createSceneRenderer } from '../../../packages/renderer/src/browser-scene.js';
import { toV2 } from '../../../packages/schema/src/migrate.js';
import { sceneKind, sceneLabel, seconds, uniqueId } from './api.js';
import { useStudio } from './studio-context.jsx';
import { TemplateBrowser } from './TemplateBrowser.jsx';

const KIND_ICON = { screen: MonitorPlay, text: Type, story: Sparkles };

function Thumbnail({ project, scene }) {
  const canvasRef = useRef(null);
  const identity = JSON.stringify([project.output, project.assets, project.theme, project.brand]);
  // A renderer per card: each keeps only its latest frame request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const render = useMemo(() => createSceneRenderer({ ...project, output: { ...project.output, width: 320, height: Math.round(320 * project.output.height / project.output.width) } }, { transient:true, assetBase: '/project-assets', frameEndpoint: '/project-assets/source-frame' }), [identity]);
  useEffect(() => () => { void render.dispose(); }, [render]);
  const key = JSON.stringify(scene);
  useEffect(() => {
    let active = true;
    render(canvasRef.current, toV2(scene), Math.round((scene.durationFrames - 1) * .45), { isCurrent: () => active }).catch(() => {});
    return () => { active = false; };
  }, [render, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Box className="shot-thumb"><canvas ref={canvasRef} aria-hidden="true" /></Box>;
}

export function ShotStrip() {
  const { project, selectedId, select, run, setNotice } = useStudio();
  const [menu, setMenu] = useState(null), [adding, setAdding] = useState(null), [dragging, setDragging] = useState(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const scenes = project.scenes, ids = scenes.map((scene) => scene.id);
  const move = (id, to) => { const order = ids.filter((item) => item !== id); order.splice(Math.max(0, Math.min(order.length, to)), 0, id); return run('scene_reorder', { order }).catch(() => {}); };
  const media = Object.entries(project.assets ?? {}).find(([, file]) => /\.(mp4|m4v|mov|webm|png|jpe?g|webp)$/i.test(file))?.[0];
  const insertAt = Math.max(0, ids.indexOf(selectedId) + 1);
  const add = async (scene) => { setAdding(null); await run('scene_create', { scene, index: insertAt }).then(() => select(scene.id), () => {}); };
  const actions = menu && scenes.find((scene) => scene.id === menu.id);
  return (
    <Box component="section" className="strip" aria-label="Shots">
      <Box className="strip-track" role="list">
        {scenes.map((scene, index) => {
          const Icon = KIND_ICON[sceneKind(scene)];
          return (
            <Box key={scene.id} role="listitem" className={`shot${scene.id === selectedId ? ' is-selected' : ''}${dragging === scene.id ? ' is-dragging' : ''}`}
              draggable onDragStart={(event) => { setDragging(scene.id); event.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setDragging(null)}
              onDragOver={(event) => { if (dragging && dragging !== scene.id) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); if (dragging) move(dragging, index); setDragging(null); }}>
              <ButtonBase className="shot-select" onClick={() => select(scene.id)} aria-pressed={scene.id === selectedId} aria-label={`Shot ${index + 1}: ${sceneLabel(scene)}`}>
                <Thumbnail project={project} scene={scene} />
                <Box className="shot-meta">
                  <span className="shot-index">{index + 1}</span>
                  <Icon size={13} aria-hidden="true" />
                  <Typography variant="caption" noWrap className="shot-name">{sceneLabel(scene)}</Typography>
                  <Typography variant="caption" color="text.secondary" className="shot-duration">{seconds(scene.durationFrames, project.output.fps)}</Typography>
                </Box>
              </ButtonBase>
              <IconButton size="small" className="shot-more" aria-label={`Actions for ${sceneLabel(scene)}`} onClick={(event) => setMenu({ id: scene.id, anchor: event.currentTarget })}><Ellipsis size={16} /></IconButton>
            </Box>
          );
        })}
        <Tooltip title="Add a shot"><ButtonBase className="shot-add" aria-label="Add a shot" onClick={(event) => setAdding(event.currentTarget)}><Plus size={20} /></ButtonBase></Tooltip>
      </Box>
      <Menu anchorEl={menu?.anchor} open={Boolean(actions)} onClose={() => setMenu(null)}>
        {actions && [
          <MenuItem key="dup" onClick={() => { setMenu(null); const id = uniqueId(actions.id, scenes); run('scene_duplicate', { id: actions.id, newId: id }).then(() => select(id), () => {}); }}><ListItemIcon><Copy size={16} /></ListItemIcon>Duplicate</MenuItem>,
          <MenuItem key="left" disabled={ids.indexOf(actions.id) === 0} onClick={() => { setMenu(null); move(actions.id, ids.indexOf(actions.id) - 1); }}><ListItemIcon><ArrowLeft size={16} /></ListItemIcon>Move left</MenuItem>,
          <MenuItem key="right" disabled={ids.indexOf(actions.id) === ids.length - 1} onClick={() => { setMenu(null); move(actions.id, ids.indexOf(actions.id) + 1); }}><ListItemIcon><ArrowRight size={16} /></ListItemIcon>Move right</MenuItem>,
          <MenuItem key="del" onClick={() => { setMenu(null); run('scene_delete', { id: actions.id }).then(() => setNotice({ severity: 'info', message: `Deleted ${sceneLabel(actions)}. Press ⌘Z to undo.` }), () => {}); }} sx={{ color: 'error.main' }}><ListItemIcon sx={{ color: 'inherit' }}><Trash2 size={16} /></ListItemIcon>Delete</MenuItem>,
        ]}
      </Menu>
      <Menu anchorEl={adding} open={Boolean(adding)} onClose={() => setAdding(null)}>
        <MenuItem onClick={() => { setAdding(null); setTemplatesOpen(true); }}><ListItemIcon><Sparkles size={16} /></ListItemIcon><ListItemText primary="Browse templates" secondary="Ready-made motion and copy" /></MenuItem>
        <MenuItem disabled={!media} onClick={() => add({ id: uniqueId('shot', scenes), kind: 'screen', durationFrames: project.output.fps * 5, screen: { asset: media }, camera: { shots: [{ at: 0 }] } })}>
          <ListItemIcon><MonitorPlay size={16} /></ListItemIcon><ListItemText primary="Screen recording" secondary={media ? `Uses “${media}”` : 'Import a recording first'} />
        </MenuItem>
        <MenuItem onClick={() => add({ id: uniqueId('title', scenes), preset: 'text-template', durationFrames: project.output.fps * 4, params: { title: 'Your headline here' }, textAnimation: { template: 'masked-lines' } })}>
          <ListItemIcon><Type size={16} /></ListItemIcon><ListItemText primary="Title card" secondary="Animated headline" />
        </MenuItem>
      </Menu>
      <TemplateBrowser open={templatesOpen} onClose={() => setTemplatesOpen(false)} insertAt={insertAt} />
    </Box>
  );
}
