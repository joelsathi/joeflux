// Browser-safe metadata: runtime dependencies are loaded only for plugin scenes.
import { pluginLayout } from './formats.js';
const capabilities = (color, quality) => ({
  formats: ['16:9', '1:1', '9:16'],
  copy: { title: { maxLength: 64 }, subtitle: { maxLength: 100 } },
  color: { default: color, variations: [
    { id: 'warm', label: 'Warm accent', value: '#ff9f66' },
    { id: 'cool', label: 'Cool accent', value: '#9faaff' },
    { id: 'mint', label: 'Mint accent', value: '#74e7cd' },
  ] },
  ...(quality ? { quality: [1, 2] } : {}),
});
export const ANIMATION_PLUGINS = [
  { id: 'animejs', capabilities: capabilities('#74e7cd', false), label: 'Anime.js choreography', license: 'MIT', source: 'https://github.com/juliangarnier/anime', version: '4.5.0', skill: 'animation-plugins', description: 'Staggered typography and graphic sequences with a manually sought timeline.' },
  { id: 'threejs', capabilities: capabilities('#74e7cd', true), label: 'Three.js product sculpture', license: 'MIT', source: 'https://github.com/mrdoob/three.js', version: '0.186.1', skill: 'three-video', description: 'Lit 3D objects with a deliberate camera and a stable reading hold.' },
  { id: 'react-three', capabilities: capabilities('#9faaff', true), label: 'React Three Fiber sculpture', license: 'MIT', source: 'https://github.com/pmndrs/react-three-fiber', version: '9.8.1', skill: 'three-video', description: 'Declarative React geometry evaluated at the requested video frame.' },
  { id: 'motion', capabilities: capabilities('#74e7cd', false), label: 'Motion interface reveal', license: 'MIT', source: 'https://github.com/motiondivision/motion', version: '14.0.0', skill: 'animation-plugins', description: 'Sequenced interface cards using Motion interpolation and easing.' },
];
export function pluginCapabilities(id) {
  return ANIMATION_PLUGINS.find(plugin => plugin.id === id)?.capabilities;
}

export function pluginErrors(scene, output) {
  if (scene.plugin === undefined) return [];
  const errors = [];
  if (output) try { pluginLayout(output); } catch (error) { errors.push(error.message); }
  if (!ANIMATION_PLUGINS.some(p => p.id === scene.plugin)) errors.push('unknown animation plugin.');
  if (scene.module || scene.kind || scene.preset) errors.push('plugin owns the scene; do not combine it with module, kind or preset.');
  const options = scene.pluginOptions;
  if (options !== undefined && (!options || typeof options !== 'object' || Array.isArray(options))) errors.push('pluginOptions must be an object.');
  if (options?.quality !== undefined && ![1, 2].includes(options.quality)) errors.push('plugin quality must be 1 or 2 (supersampling).');
  if (options?.color !== undefined && !/^#[0-9a-f]{6}$/i.test(options.color)) errors.push('plugin color must be a six-digit hex color.');
  for (const [key, limit] of [['title', 64], ['subtitle', 100]]) if (scene.params?.[key] !== undefined && (typeof scene.params[key] !== 'string' || scene.params[key].length > limit)) errors.push(`plugin ${key} must be a string of at most ${limit} characters.`);
  return errors;
}
