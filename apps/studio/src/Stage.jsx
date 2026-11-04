import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, IconButton, Slider, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Crosshair, Pause, Play, SkipBack } from '@wso2/oxygen-ui-icons-react';
import { createSceneRenderer } from '../../../packages/renderer/src/browser-scene.js';
import { useStudio } from './studio-context.jsx';
import { FrameOverlay } from './FrameOverlay.jsx';
import { FilmPreview } from './FilmPreview.jsx';
import { sceneKind } from './api.js';

const clock = (frame, fps) => `${Math.floor(frame / fps / 60)}:${String(Math.floor(frame / fps) % 60).padStart(2, '0')}.${String(frame % fps).padStart(2, '0')}`;

export function Stage() {
  const { project, scene, framing, setFraming } = useStudio();
  const canvasRef = useRef(null), frameRef = useRef(0), boxRef = useRef(null);
  const [frame, setFrame] = useState(0), [playing, setPlaying] = useState(false), [error, setError] = useState(null), [plane, setPlane] = useState(null);
  const [filmOpen, setFilmOpen] = useState(false);
  const canFrame = scene && sceneKind(scene) === 'screen' && scene.screen;
  // Framing shows the recording flat and unzoomed so areas map straight onto it.
  const shown = useMemo(() => framing && canFrame ? { ...scene, screen: { asset: scene.screen.asset, fit: scene.screen.fit }, camera: { shots: [{ at: 0 }] } } : scene, [framing, canFrame, scene]);
  const { fps, width, height } = project.output, last = Math.max(0, (scene?.durationFrames ?? 1) - 1);
  const identity = JSON.stringify([project.output, project.assets, project.theme, project.brand]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const render = useMemo(() => createSceneRenderer(project, { assetBase: '/project-assets', frameEndpoint: '/project-assets/source-frame' }), [identity]);
  useEffect(() => () => { void render.dispose(); }, [render]);
  useEffect(() => { frameRef.current = frame; }, [frame]);
  useEffect(() => { setFrame(0); setPlaying(false); }, [scene?.id]);
  useEffect(() => {
    if (!scene || !canvasRef.current) return undefined;
    let active = true;
    render(canvasRef.current, shown, Math.min(frame, last), { isCurrent: () => active }).then(() => {
      if (!active) return;
      setError(null);
      const media = boxRef.current?.querySelector('canvas[data-asset]'), box = boxRef.current?.getBoundingClientRect();
      if (!media || !box) return setPlane(null);
      const rect = media.getBoundingClientRect();
      setPlane({ left: `${(rect.left - box.left) / box.width * 100}%`, top: `${(rect.top - box.top) / box.height * 100}%`, width: `${rect.width / box.width * 100}%`, height: `${rect.height / box.height * 100}%` });
    }, (reason) => { if (active) { setError(reason.message); setPlaying(false); } });
    return () => { active = false; };
  }, [render, shown, frame, last]);
  useEffect(() => { if (framing) setPlaying(false); }, [framing]);
  useEffect(() => {
    if (!playing) return undefined;
    const start = performance.now(), first = frameRef.current >= last ? 0 : frameRef.current;
    let id;
    const tick = (now) => {
      const next = first + Math.floor((now - start) * fps / 1000);
      if (next >= last) { setFrame(last); setPlaying(false); return; }
      setFrame(next); id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing, fps, last]);
  const onKey = (event) => {
    if (event.target.closest('input, textarea, [role="slider"], .frame-area')) return;
    if (event.key === 'Escape' && framing) setFraming(false);
    if (event.key.toLowerCase() === 'f' && canFrame && !event.metaKey && !event.ctrlKey) setFraming((value) => !value);
    if (event.key === ' ') { event.preventDefault(); setPlaying((value) => !value); }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setPlaying(false); setFrame((value) => Math.max(0, Math.min(last, value + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? fps : 1)))); }
  };
  return (
    <><Box component="section" className="stage" aria-label="Stage" tabIndex={0} onKeyDown={onKey}>
      <Box className="stage-viewport">
        {scene ? <Box className={`stage-frame${framing ? ' is-framing' : ''}`} style={{ '--ar': width / height }} ref={boxRef}>
          <canvas ref={canvasRef} aria-label={`Preview of ${scene.id}`} data-scene={scene.id} />
          {framing && canFrame && plane && <FrameOverlay plane={plane} />}
          {error && <Box className="stage-error" role="alert"><Typography variant="body2">{error}</Typography></Box>}
        </Box> : <Typography color="text.secondary">Add a shot to begin.</Typography>}
      </Box>
      <Box className="transport">
        <Button size="small" disabled={!scene} onClick={() => { setPlaying(false); setFilmOpen(true); }}>Play from this shot</Button>
        <Tooltip title="Back to start"><IconButton size="small" aria-label="Back to start" onClick={() => { setPlaying(false); setFrame(0); }}><SkipBack size={16} /></IconButton></Tooltip>
        <Tooltip title={playing ? 'Pause (Space)' : 'Play (Space)'}><IconButton aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying((value) => !value)} className="play-button"><>{playing ? <Pause size={18} /> : <Play size={18} />}</></IconButton></Tooltip>
        <Typography variant="caption" className="timecode" aria-live="off">{clock(frame, fps)}</Typography>
        <Slider size="small" aria-label="Scrub" value={Math.min(frame, last)} min={0} max={last} onChange={(_, value) => { setPlaying(false); setFrame(value); }} sx={{ mx: 1.5 }} />
        <Typography variant="caption" className="timecode" color="text.secondary">{clock(last, fps)}</Typography>
        {canFrame && <Tooltip title={framing ? 'Done framing (Esc)' : 'Frame areas on the recording (F)'}><IconButton size="small" aria-label="Frame areas" aria-pressed={framing} onClick={() => setFraming((value) => !value)} className={`frame-toggle${framing ? ' is-on' : ''}`}><Crosshair size={16} /></IconButton></Tooltip>}
      </Box>
    </Box><FilmPreview open={filmOpen} onClose={() => setFilmOpen(false)} fromId={scene?.id} /></>
  );
}
