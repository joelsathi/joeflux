import { OXYGEN_THEMES } from './oxygen-themes.js';
import { BACKGROUND_PACK } from './background-packs.js';
import { BRAND_KITS } from './brand-kits.js';
const THEMES = {
  'light-blue': { id: 'light-blue', background: '#F8FBFD', backgroundEnd: '#EDF4F7', surface: '#FFFFFF', text: '#173249', muted: '#597285', accent: '#2F93AE', border: '#CDDEE6', particle: '#3C7795', font: 'system-ui, sans-serif' },
  'navy-dark': { id: 'navy-dark', background: '#18263D', backgroundEnd: '#213B59', surface: '#233B56', text: '#FFFFFF', muted: '#BCE7F2', accent: '#F14E23', border: '#45647E', particle: '#BCE7F2', font: '"Harness Inter", system-ui, sans-serif' },
  ...OXYGEN_THEMES,
  ...Object.fromEntries(BRAND_KITS.flatMap((kit) => kit.themes.map((theme) => [`${kit.id}-${theme.id}`, { ...theme, id: `${kit.id}-${theme.id}` }]))),
  ...Object.fromEntries(BACKGROUND_PACK.map((item) => [item.themeId, {
    id: item.themeId, label: item.label, mode: item.mode,
    background: item.colors[0], backgroundEnd: item.colors.at(-1),
    surface: item.mode === 'dark' ? '#1b2940' : '#ffffff',
    border: item.mode === 'dark' ? '#475a75' : '#c8d6df',
    particle: item.theme.accent, font: '"Harness Inter", system-ui, sans-serif',
    ...item.theme,
  }])),
};

export function resolveTheme(projectTheme, sceneTheme) {
  const name = sceneTheme ?? projectTheme ?? 'light-blue';
  if (!THEMES[name]) throw new Error(`Unknown theme "${name}". Use one of: ${Object.keys(THEMES).join(', ')}.`);
  return THEMES[name];
}

export const THEME_NAMES = Object.keys(THEMES);
export const THEME_OPTIONS = THEME_NAMES.map(id=>({id,label:THEMES[id].label??(id==='light-blue'?'Light blue (original)':'Navy / orange (original)')}));
