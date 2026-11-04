export const COMPONENT_ANCHORS = ['top', 'center', 'bottom', 'left', 'right', 'full'];
export const COMPOSITION_LAYOUTS = ['landscape', 'square', 'portrait'];
const color = { id: 'color', label: 'Accent color', type: 'color', default: '#66dcc8' };
const tone = { id: 'treatment', label: 'Treatment', type: 'select', default: 'restrained', options: [{ value: 'restrained', label: 'Restrained' }, { value: 'bold', label: 'Bold' }] };
const text = (id, label, maxLength, required = false, value = '') => ({ id, label, type: 'text', maxLength, required, default: value });
const common = { version: '1.0.0', license: 'MIT', layouts: COMPOSITION_LAYOUTS, anchors: COMPONENT_ANCHORS, phases: ['entrance', 'hold', 'exit'], surface: { type: 'canvas2d', alpha: true, shared3D: false }, deterministic: { clock: 'absolute-fractional-frame', seed: true, resources: 'instance-owned', disposal: true } };
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
export const COMPONENT_DEFINITIONS = freeze([
  { ...common, id: 'harness/title', label: 'Title', engine: 'animejs', defaultAnchor: 'top', minimumHoldSeconds: 2, slots: [text('title', 'Title', 140, true, 'A useful change'), text('subtitle', 'Supporting copy', 220)], controls: [color, tone] },
  { ...common, id: 'harness/proof', label: 'Proof media', engine: 'canvas', defaultAnchor: 'center', minimumHoldSeconds: 1, slots: [{ id: 'asset', label: 'Proof asset', type: 'asset', required: true }], controls: [{ id: 'fit', label: 'Media fit', type: 'select', default: 'contain', options: [{ value: 'contain', label: 'Contain' }, { value: 'cover', label: 'Cover' }] }, { id: 'radius', label: 'Corner radius', type: 'number', default: 20, min: 0, max: 80, step: 1 }, color] },
  { ...common, id: 'harness/shape', label: 'Shape', engine: 'motion', defaultAnchor: 'center', minimumHoldSeconds: 0, slots: [], controls: [color, tone, { id: 'shape', label: 'Shape', type: 'select', default: 'ring', options: [{ value: 'ring', label: 'Ring' }, { value: 'disc', label: 'Disc' }, { value: 'pill', label: 'Pill' }] }, { id: 'scale', label: 'Size', type: 'number', min: 0.25, max: 1, step: .05, default: .75 }] },
  { ...common, id: 'harness/cta', label: 'Call to action', engine: 'animejs', defaultAnchor: 'bottom', minimumHoldSeconds: 2, slots: [text('title', 'Call to action', 100, true, 'Explore the next step'), text('subtitle', 'Supporting copy', 140)], controls: [color, tone] },
  { ...common, id: 'harness/terminal', label: 'Terminal walkthrough', engine: 'canvas', defaultAnchor: 'full', minimumHoldSeconds: 2,
    slots: [
      text('title', 'Title', 100, true, 'From command to result'),
      text('subtitle', 'Eyebrow', 120, false, 'EXAMPLE SESSION'),
      text('windowTitle', 'First window title', 64, true, 'server — zsh'),
      { ...text('transcript', 'First transcript ($ command, then output)', 1000, true, '$ toolkit start\nReady on localhost:3000'), multiline: true },
      text('secondWindowTitle', 'Second window title', 64, false, 'client — zsh'),
      { ...text('secondTranscript', 'Second transcript (empty for one window)', 1000, false, '$ toolkit status\n{"status":"ready"}'), multiline: true },
      text('firstStep', 'First step', 24, false, 'Start'),
      text('secondStep', 'Second step', 24, false, 'Check'),
      text('status', 'Result status', 80, false, 'Ready to build'),
    ],
    controls: [
      { id: 'palette', label: 'Terminal theme', type: 'select', default: 'dark', options: [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }] },
      { ...color, default: '#ff8754' },
      { id: 'typingSpeed', label: 'Typing speed (characters/second)', type: 'number', min: 10, max: 100, step: 5, default: 45 },
    ],
  },
]);
export function getComponentDefinition(id, version = '1.0.0') { return COMPONENT_DEFINITIONS.find(d => d.id === id && d.version === version) ?? null; }
export function listComponentDefinitions() { return structuredClone(COMPONENT_DEFINITIONS); }
export function compositionFormat(output) {
  const ratio = output.width / output.height;
  for (const [name, expected] of [['landscape', 16 / 9], ['square', 1], ['portrait', 9 / 16]]) if (Math.abs(ratio - expected) < .02) return name;
  throw new Error('Composition format must be landscape 16:9, square 1:1 or portrait 9:16.');
}
