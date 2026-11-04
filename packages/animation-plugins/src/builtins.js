import { createAnimeScene, createMotionScene, createThreeScene, createReactThreeScene, THREE, React } from './adapters.js';
import { backdrop, base, copy, easeProgress } from './drawing.js';
import { pluginLayout, animeCardLayout, motionCardLayout, sculptureLayout } from './formats.js';
const accent = context => context.scene.pluginOptions?.color ?? '#74e7cd';
const anime = createAnimeScene({
  build(timeline) {
    const state = { copy: 0, y: 36, cards: Array.from({ length: 7 }, () => ({ y: 140, opacity: 0 })) };
    timeline.add(state, { copy: [0, 1], y: [36, 0], duration: 1000, ease: 'outQuart' }, 250);
    state.cards.forEach((card, i) => timeline.add(card, { y: [140, 0], opacity: [0, 1], duration: 1100, ease: 'outExpo' }, i * 100));
    return state;
  },
  draw(state, frame, context) {
    const ctx = base(context), color = accent(context), layout = pluginLayout(context.output);
    state.cards.forEach((card, i) => {
      const placement = animeCardLayout(layout, i);
      ctx.save(); ctx.globalAlpha = card.opacity; ctx.translate(placement.x, placement.y + card.y); ctx.scale(placement.scale, placement.scale);
      ctx.rotate(placement.rotation); ctx.fillStyle = '#182b46'; ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(-86, -110, 172, 245, 30); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, -24, 24 + i * 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#89a4c5'; ctx.fillRect(-44, 56, 88, 6); ctx.fillRect(-28, 76, 56, 6); ctx.restore();
    });
    copy(context, { label: 'ANIME.JS / ORCHESTRATED REVEAL', opacity: state.copy, y: state.y });
    ctx.resetTransform();
  },
});
const motion = createMotionScene({ draw({ seconds, interpolate, cubicBezier }, frame, context) {
  const ctx = base(context), layout = pluginLayout(context.output);
  for (let i = 0; i < 3; i++) {
    const progress = interpolate([0, 1.2], [0, 1], { ease: cubicBezier(.16, 1, .3, 1) })(seconds - i * .16);
    const card = motionCardLayout(layout, i), padding = 30;
    ctx.save(); ctx.translate(card.x, card.y + (1 - progress) * 150); ctx.globalAlpha = progress;
    ctx.fillStyle = '#162943'; ctx.strokeStyle = '#304c69'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(0, 0, card.width, card.height, 28); ctx.fill(); ctx.stroke();
    ctx.fillStyle = accent(context); ctx.font = '500 20px "Harness Inter", sans-serif'; ctx.fillText(`0${i + 1}`, padding, 46);
    ctx.fillStyle = '#f4f7ff'; ctx.font = '500 36px "Harness Inter", sans-serif'; ctx.fillText(['Compose', 'Animate', 'Render'][i], padding, card.compact ? 94 : 129);
    const chartX = card.compact && layout.format === 'portrait' ? card.width * .48 : padding;
    const chartWidth = card.width - chartX - padding, step = chartWidth / 6, baseline = card.height - 30;
    const chartHeight = card.compact ? card.height - 146 : 146;
    for (let j = 0; j < 6; j++) {
      const barHeight = Math.max(12, chartHeight * (.18 + ((j * 23 + i * 31) % 126) / 150));
      ctx.fillStyle = j === i + 1 ? accent(context) : '#294462'; ctx.beginPath(); ctx.roundRect(chartX + j * step, baseline - barHeight, step * .64, barHeight, 6); ctx.fill();
    }
    ctx.restore();
  }
  copy(context, { label: 'MOTION / INTERFACE CHOREOGRAPHY', opacity: easeProgress(seconds, .25) }); ctx.resetTransform();
} });
function setup(context) {
  const { THREE, output, scene: config } = context;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(backdrop(context)[0]);
  const camera = new THREE.PerspectiveCamera(38, output.width / output.height, .1, 100); camera.position.set(0, 0, 7);
  scene.add(new THREE.HemisphereLight('#d6efff', '#152243', 2.2));
  for (const [color, intensity, position] of [['#d4ebff', 65, [-3, 4, 5]], ['#70ffd9', 45, [4, 1, 2]], ['#7184ff', 80, [1, 3, -4]]]) {
    const light = new THREE.PointLight(color, intensity); light.position.set(...position); scene.add(light);
  }
  const object = new THREE.Mesh(new THREE.TorusKnotGeometry(.95, .28, 192, 32), new THREE.MeshStandardMaterial({ color: config.pluginOptions?.color ?? '#74e7cd', metalness: .65, roughness: .23 }));
  const placement = sculptureLayout(output); object.position.y = placement.y; scene.add(object);
  return { scene, camera, object, placement };
}
const three = createThreeScene({ setup,
  update({ object, placement }, seconds) { const p = easeProgress(seconds, 0, 2); object.rotation.set(.3 + (1 - p) * .45, -.65 + p * 1.2, -.15); object.scale.setScalar(placement.scale * (.65 + p * .35)); },
  overlay(frame, context) { copy(context, { label: 'THREE.JS / LIGHT · MATERIAL · FORM', opacity: easeProgress(frame / context.output.fps, .2) }); },
});
function Sculpture({ seconds, scene, output, theme }) {
  const p = easeProgress(seconds, 0, 2), h = React.createElement, placement = sculptureLayout(output);
  return h(React.Fragment, null,
    h('color', { attach: 'background', args: [backdrop({ theme })[0]] }),
    h('hemisphereLight', { args: ['#d6efff', '#152243', 2.2] }),
    h('pointLight', { position: [-3, 4, 5], intensity: 65, color: '#d4ebff' }),
    h('pointLight', { position: [4, 1, 2], intensity: 45, color: '#70ffd9' }),
    h('pointLight', { position: [1, 3, -4], intensity: 80, color: '#7184ff' }),
    h('group', { position: [0, placement.y, 0], rotation: [.3, -.65 + p * 1.2, -.15], scale: placement.scale * (.65 + p * .35) },
      ...[0, 1, 2].map(i => h('mesh', { key: i, rotation: [i * Math.PI / 3, i * Math.PI / 3, 0] },
        h('torusGeometry', { args: [.95, .13, 32, 128] }),
        h('meshStandardMaterial', { color: scene.pluginOptions?.color ?? '#9faaff', metalness: .65, roughness: .23 })))));
}
const fiber = createReactThreeScene({ component: Sculpture,
  overlay(frame, context) { copy(context, { label: 'REACT THREE FIBER / DECLARATIVE 3D', opacity: easeProgress(frame / context.output.fps, .2) }); },
});
// Validate composition support before allocating timelines or GPU resources.
const withFormat = factory => context => { pluginLayout(context.output); return factory(context); };
export const builtins = { animejs: withFormat(anime), motion: withFormat(motion), threejs: withFormat(three), 'react-three': withFormat(fiber) };
