import { useRef, useState } from 'react';
import { Box } from '@wso2/oxygen-ui';
import { cameraStops, reframeStop, appendStop, removeStop } from '../../../packages/motion/src/camera-motion.js';
import { drawCrop, moveCrop, resizeCrop } from '../../preview/src/composition-geometry.js';
import { useStudio } from './studio-context.jsx';

// Draw what the camera shows: focus is clamped so the frame stays on the recording.
const toRect = (stop) => { const size = 1 / stop.zoom, clamp = (v) => Math.min(1 - size, Math.max(0, v - size / 2)); return { x: clamp(stop.focus[0]), y: clamp(stop.focus[1]), size }; };
const toStop = (rect) => ({ focus: [+(rect.x + rect.size / 2).toFixed(4), +(rect.y + rect.size / 2).toFixed(4)], zoom: +(1 / rect.size).toFixed(3) });
const GUIDES = [1 / 3, 1 / 2, 2 / 3];
function snap(rect) {
  const guides = [];
  const center = [rect.x + rect.size / 2, rect.y + rect.size / 2].map((value, axis) => {
    const line = GUIDES.find((guide) => Math.abs(guide - value) < .012);
    if (line === undefined) return value;
    guides.push({ axis, at: line }); return line;
  });
  return { rect: moveCrop(rect, center[0] - rect.size / 2 - rect.x, center[1] - rect.size / 2 - rect.y), guides };
}
export const pacing = (shots) => ({ startFull: !shots[0]?.focus, returnToFull: !shots.at(-1)?.focus });

// Areas are edited in the recording's own normalized space (the flat media plane).
export function FrameOverlay({ plane }) {
  const { scene, preview, commit, activeStop, setActiveStop, setNotice } = useStudio();
  const shots = scene.camera?.shots ?? [], stops = cameraStops(shots);
  const drag = useRef(null), [guides, setGuides] = useState([]);
  const point = (event) => { const box = event.currentTarget.closest('.frame-overlay').getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)), y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)) }; };
  const shotsFor = (index, stop) => { const base=drag.current?.shots??shots; return index < cameraStops(base).length ? reframeStop(base, index, stop) : appendStop(base, stop); };
  const apply = (index, rect, final) => {
    let next;
    try { next = shotsFor(index, toStop(rect)); }
    catch(error) { drag.current=null;setGuides([]);preview({});setNotice({severity:'error',message:error.message});return; }
    if (final) { drag.current = null; setGuides([]); return commit('camera_set_shots', { id: scene.id, shots: next }); }
    preview({ camera: { ...scene.camera, shots: next } });
  };
  const down = (event, index, corner) => {
    if (event.button !== 0) return;
    event.stopPropagation(); event.currentTarget.setPointerCapture?.(event.pointerId);
    const start = point(event);
    drag.current = { shots, index: index ?? stops.length, corner, start, rect: index === undefined ? null : toRect(stops[index]), moved: false };
    if (index !== undefined) setActiveStop(index);
  };
  const move = (event) => {
    const state = drag.current;
    if (!state) return;
    const now = point(event);
    if (Math.hypot(now.x - state.start.x, now.y - state.start.y) < .01 && !state.moved) return;
    state.moved = true;
    let rect;
    if (!state.rect) rect = drawCrop(state.start, now);
    else if (state.corner) rect = resizeCrop(state.rect, state.corner, now);
    else { const snapped = snap(moveCrop(state.rect, now.x - state.start.x, now.y - state.start.y)); rect = snapped.rect; setGuides(snapped.guides); }
    state.current = rect; apply(state.index, rect, false);
  };
  const up = () => { const state = drag.current; if (state?.moved && state.current) { if (!state.rect) setActiveStop(state.index); apply(state.index, state.current, true); } else drag.current = null; setGuides([]); };
  const remove = (index) => { setActiveStop(null); commit('camera_set_shots', { id: scene.id, shots: removeStop(shots,index) }); };
  const onKey = (event, index) => {
    const delta = { ArrowLeft: [-.01, 0], ArrowRight: [.01, 0], ArrowUp: [0, -.01], ArrowDown: [0, .01] }[event.key];
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove(index); }
    if (!delta) return;
    event.preventDefault(); event.stopPropagation();
    const step = event.shiftKey ? 5 : 1;
    apply(index, moveCrop(toRect(stops[index]), delta[0] * step, delta[1] * step), true);
  };
  const centers = stops.map((stop) => { const rect = toRect(stop); return `${(rect.x + rect.size / 2) * 100},${(rect.y + rect.size / 2) * 100}`; }).join(' ');
  return (
    <Box className="frame-overlay" style={plane} onPointerDown={(event) => down(event)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDragStart={(event) => event.preventDefault()} role="application" aria-label="Frame areas: drag on the recording to add an area">
      <svg className="frame-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {stops.length > 1 && <polyline points={centers} />}
        {guides.map((guide) => guide.axis ? <line key={`y${guide.at}`} x1="0" x2="100" y1={guide.at * 100} y2={guide.at * 100} className="guide" /> : <line key={`x${guide.at}`} y1="0" y2="100" x1={guide.at * 100} x2={guide.at * 100} className="guide" />)}
      </svg>
      {stops.map((stop, index) => { const rect = toRect(stop); return (
        <Box key={index} className={`frame-area${activeStop === index ? ' is-active' : ''}`} tabIndex={0} role="group" aria-label={`Area ${index + 1}, ${stop.zoom.toFixed(1)}× zoom`}
          style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.size * 100}%`, height: `${rect.size * 100}%` }}
          onPointerDown={(event) => down(event, index)} onFocus={() => setActiveStop(index)} onKeyDown={(event) => onKey(event, index)}>
          <span className="frame-badge">{index + 1}</span>
          {['nw', 'ne', 'sw', 'se'].map((corner) => <span key={corner} className={`frame-handle ${corner}`} onPointerDown={(event) => down(event, index, corner)} />)}
        </Box>
      ); })}
      {!stops.length && <Box className="frame-empty">Drag on the recording to frame an area</Box>}
    </Box>
  );
}
