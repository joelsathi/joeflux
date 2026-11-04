import { BRAND_KITS, brandFile, brandUrl } from './brand-kits.js';

export const BACKGROUND_PACK = BRAND_KITS.flatMap((kit) => kit.backgrounds.map(({ id, label, file, mode, colors, safeArea, text, muted, accent }) => ({
  id: `${kit.id}/${id}`, label: `${kit.name} · ${label}`, kit: kit.id, file, mode, colors, safeArea, theme: { text, muted, accent },
  themeId: `background-${kit.id}-${id}`, url: brandUrl(kit.id, file), poster: brandUrl(kit.id, file), relativeFile: brandFile(kit.id, file),
})));

export function getPackBackground(id) {
  return BACKGROUND_PACK.find((item) => item.id === id) ?? null;
}
