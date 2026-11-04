import registry from '../../../brand-kits/registry.json' with { type: 'json' };

// Kits come from brand-kits/registry.json, written by `pnpm run brand -- sync`.
export const BRAND_KITS = registry.kits;
export const getBrandKit = (id) => BRAND_KITS.find((kit) => kit.id === id) ?? null;
export const brandFile = (kit, file) => `brand-kits/${kit}/${file}`;
export const brandUrl = (kit, file) => `/${brandFile(kit, file).split('/').map(encodeURIComponent).join('/')}`;

export const BRAND_FONTS = BRAND_KITS.flatMap((kit) => kit.fonts.map((font) => ({ ...font, url: brandUrl(kit.id, font.file) })));
export const BRAND_FILES = new Set(BRAND_KITS.flatMap((kit) => [
  ...Object.values(kit.logos), ...kit.fonts.map((font) => font.file), ...kit.backgrounds.map((item) => item.file), ...kit.bookends.map((item) => item.file),
].map((file) => brandFile(kit.id, file))));

export const BRAND_MIME = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp4': 'video/mp4' };
export const brandMime = (file) => BRAND_MIME[file.slice(file.lastIndexOf('.')).toLowerCase()] ?? 'application/octet-stream';

export function brandLogo(id, mode) {
  const kit = getBrandKit(id);
  const file = kit && (mode === 'dark' ? kit.logos.onDark ?? kit.logos.onLight : kit.logos.onLight ?? kit.logos.onDark);
  return file ? { url: brandUrl(kit.id, file), alt: kit.name, placement: kit.logoPlacement } : null;
}
