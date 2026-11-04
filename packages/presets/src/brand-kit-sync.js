import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

export const REGISTRY_FILE = 'brand-kits/registry.json';
const DEFAULT_FONT = '"Harness Inter", system-ui, sans-serif';

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'use lowercase letters, digits and single hyphens');
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'use a six-digit hex color');
const unit = z.number().min(0).max(1);
const file = (extensions) => z.string().min(1)
  .refine((value) => !path.isAbsolute(value) && !value.split(/[\\/]/).includes('..'), 'must be a relative path inside the kit')
  .refine((value) => extensions.includes(path.extname(value).toLowerCase()), `must end with ${extensions.join(', ')}`);
const IMAGE = ['.svg', '.png', '.jpg', '.jpeg', '.webp'];

const Theme = z.strictObject({
  id: slug, label: z.string().min(1).optional(), mode: z.enum(['light', 'dark']),
  background: color, backgroundEnd: color.optional(), surface: color.optional(), text: color, muted: color.optional(),
  accent: color, border: color.optional(), particle: color.optional(), font: z.string().min(1).optional(),
});
const Background = z.strictObject({
  id: slug, label: z.string().min(1), file: file(IMAGE), mode: z.enum(['light', 'dark']),
  colors: z.array(color).min(1).max(4), text: color, muted: color.optional(), accent: color,
  safeArea: z.tuple([unit, unit, unit, unit]).optional(),
});
const Bookend = z.strictObject({ id: slug, role: z.enum(['intro', 'outro']), label: z.string().min(1).optional(), file: file(['.mp4']), seconds: z.number().positive().max(30) });
const Font = z.strictObject({ family: z.string().min(1), file: file(['.woff2', '.woff', '.ttf', '.otf']), weight: z.string().min(1).optional(), style: z.enum(['normal', 'italic']).optional() });

export const BrandKitSchema = z.strictObject({
  id: slug,
  name: z.string().min(1),
  logos: z.strictObject({ onDark: file(IMAGE).optional(), onLight: file(IMAGE).optional() }).default({}),
  logoPlacement: z.strictObject({
    corner: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']).optional(),
    width: z.number().min(24).max(960).optional(),
    margin: z.tuple([z.number().min(0), z.number().min(0)]).optional(),
  }).default({}),
  fonts: z.array(Font).default([]),
  themes: z.array(Theme).default([]),
  backgrounds: z.array(Background).default([]),
  bookends: z.array(Bookend).default([]),
  guidelines: file(['.md']).optional(),
});

function normalize(kit) {
  return {
    ...kit,
    logoPlacement: { corner: 'top-left', width: 240, margin: [96, 64], ...kit.logoPlacement },
    fonts: kit.fonts.map((font) => ({ weight: '400', style: 'normal', ...font })),
    themes: kit.themes.map((theme) => ({
      label: `${kit.name} · ${theme.id}`, backgroundEnd: theme.background, surface: theme.background, muted: theme.text,
      border: theme.muted ?? theme.text, particle: theme.accent, font: DEFAULT_FONT, ...theme,
    })),
    backgrounds: kit.backgrounds.map((item) => ({ muted: item.text, safeArea: [0.1, 0.1, 0.8, 0.8], ...item })),
    bookends: kit.bookends.map((item) => ({ label: item.id, ...item })),
  };
}

export const kitFiles = (kit) => [
  ...Object.values(kit.logos), ...kit.fonts.map((font) => font.file), ...kit.backgrounds.map((item) => item.file),
  ...kit.bookends.map((item) => item.file), ...(kit.guidelines ? [kit.guidelines] : []),
];

function duplicates(list, label) {
  const seen = new Set();
  return list.filter((id) => seen.has(id) || !seen.add(id)).map((id) => `duplicate ${label} id "${id}"`);
}

// Read every brand-kits/<id>/brand.json under root and report problems per kit.
export async function loadBrandKits(root) {
  const directory = path.join(root, 'brand-kits'), kits = [], errors = [];
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => error.code === 'ENOENT' ? [] : Promise.reject(error));
  for (const entry of entries.filter((item) => item.isDirectory() || item.isSymbolicLink()).sort((a, b) => a.name.localeCompare(b.name))) {
    const kitRoot = path.join(directory, entry.name), manifest = path.join(kitRoot, 'brand.json');
    let raw;
    try { raw = JSON.parse(await readFile(manifest, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') errors.push(`${entry.name}: brand.json is not valid JSON (${error.message})`); continue; }
    const parsed = BrandKitSchema.safeParse(raw);
    if (!parsed.success) { errors.push(...parsed.error.issues.map((issue) => `${entry.name}: ${issue.path.join('.') || 'brand.json'} ${issue.message}`)); continue; }
    const kit = normalize(parsed.data), problems = [];
    if (kit.id !== entry.name) problems.push(`id "${kit.id}" must match its folder name`);
    problems.push(...duplicates(kit.themes.map((item) => item.id), 'theme'), ...duplicates(kit.backgrounds.map((item) => item.id), 'background'), ...duplicates(kit.bookends.map((item) => item.id), 'bookend'));
    for (const relative of kitFiles(kit)) if (!(await stat(path.join(kitRoot, relative)).catch(() => null))?.isFile()) problems.push(`missing file ${relative}`);
    if (problems.length) errors.push(...problems.map((problem) => `${entry.name}: ${problem}`));
    else kits.push(kit);
  }
  return { kits, errors };
}

export const registryText = (kits) => `${JSON.stringify({ version: 1, kits }, null, 2)}\n`;

export async function syncBrandKits(root) {
  const { kits, errors } = await loadBrandKits(root);
  if (errors.length) throw Object.assign(new Error(`Brand kits have ${errors.length} problem${errors.length === 1 ? '' : 's'}.`), { issues: errors });
  await mkdir(path.join(root, 'brand-kits'), { recursive: true });
  await writeFile(path.join(root, REGISTRY_FILE), registryText(kits));
  return { registry: REGISTRY_FILE, kits: kits.map(summarizeKit) };
}

export function summarizeKit(kit) {
  return {
    id: kit.id, name: kit.name, logos: Object.keys(kit.logos), fonts: kit.fonts.map((font) => font.family),
    themes: kit.themes.map((theme) => `${kit.id}-${theme.id}`), backgrounds: kit.backgrounds.map((item) => `${kit.id}/${item.id}`),
    bookends: kit.bookends.map(({ id, role, seconds }) => ({ id, role, seconds })), guidelines: Boolean(kit.guidelines),
  };
}

export async function createBrandKit(root, id, name = id) {
  if (!slug.safeParse(id).success) throw new Error('Kit id must use lowercase letters, digits and single hyphens.');
  const kitRoot = path.join(root, 'brand-kits', id);
  if (await stat(kitRoot).catch(() => null)) throw new Error(`brand-kits/${id} already exists.`);
  for (const folder of ['logos', 'fonts', 'backgrounds', 'bookends']) await mkdir(path.join(kitRoot, folder), { recursive: true });
  const kit = {
    id, name, logos: {}, logoPlacement: { corner: 'top-left', width: 240, margin: [96, 64] }, fonts: [],
    themes: [{ id: 'dark', mode: 'dark', background: '#101828', backgroundEnd: '#1D2939', text: '#FFFFFF', muted: '#D0D5DD', accent: '#7A5AF8' }],
    backgrounds: [], bookends: [], guidelines: 'guidelines.md',
  };
  await writeFile(path.join(kitRoot, 'brand.json'), `${JSON.stringify(kit, null, 2)}\n`);
  await writeFile(path.join(kitRoot, 'guidelines.md'), `# ${name} brand guidelines\n\n- Voice:\n- Logo use:\n- Color use:\n- Motion:\n`);
  return { created: `brand-kits/${id}`, next: 'Add logos, fonts, backgrounds and bookends, list them in brand.json, then run pnpm run brand -- sync.' };
}
