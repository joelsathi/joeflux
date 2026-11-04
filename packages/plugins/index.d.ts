/** Data-pack API v1. Runtime validators enforce IDs, exact semver and bounds. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type ReadonlyData<T> = T extends (...args: never[]) => unknown ? T : T extends object ? { readonly [K in keyof T]: ReadonlyData<T[K]> } : T;
export type PackageId = `${string}/${string}`;
export type TrustedEngine = 'animejs' | 'motion' | 'threejs' | 'react-three';
export type Duration = 'short' | 'medium' | 'long';
export interface TemplateOrigin { package: PackageId; version: string; template: string; digest: string }
export interface TextSlot { id: string; type: 'text'; label?: string; default?: string; maxLength: number; multiline?: boolean; required?: boolean }
export interface AssetSlot { id: string; type: 'asset'; label?: string; default?: string; required?: boolean }
export type TemplateSlot = TextSlot | AssetSlot;
interface ControlBase { id: string; label: string; path: string }
export type TemplateControl =
  | (ControlBase & { type: 'text'; maxLength: number; multiline?: boolean; default?: string })
  | (ControlBase & { type: 'asset'; default?: string })
  | (ControlBase & { type: 'color'; default?: string })
  | (ControlBase & { type: 'boolean'; default?: boolean })
  | (ControlBase & { type: 'number'; min: number; max: number; step?: number; default?: number })
  | (ControlBase & { type: 'select'; options: { value: string | number | boolean; label: string }[]; default?: string | number | boolean });
export interface TemplateControls {
  durations: Record<Duration, number>;
  intensity?: { path: string; base: number; scale: number; mirrorPath?: string };
  fields?: TemplateControl[];
}
/** Renderer-specific scene JSON is validated by validateTemplateDefinition. */
export type DataScene = JsonObject & ({ plugin: TrustedEngine } | { preset: string } | { kind: 'composition'; compositionVersion: 1 });
export interface TemplateDefinition {
  id: string; label: string; category: string; description?: string;
  scene: DataScene; slots: TemplateSlot[]; controls: TemplateControls;
}
export interface PluginManifest {
  manifestVersion: 1; apiVersion: 1; id: PackageId; version: string; license: 'MIT';
  label?: string; description?: string;
  dependencies?: Record<PackageId, string>;
  entryPoints?: Record<string, never>;
  capabilities: { execution: 'data'; offline: true };
  contributes: { templates: (string | TemplateDefinition)[] };
}
export interface PackageSnapshot { manifest: PluginManifest; templates: TemplateDefinition[]; digest: string }
export interface PackageMetadata {
  id: PackageId; version: string; license: 'MIT'; apiVersion: 1;
  dependencies: Record<PackageId, string>; capabilities: { execution: 'data'; offline: true }; digest: string;
}
export interface RegisteredTemplate extends TemplateDefinition { origin?: TemplateOrigin }
export interface RegistryJSON {
  apiVersion: 1; generation: string; digest: string;
  packages: PackageMetadata[]; templates: RegisteredTemplate[];
}
export interface Registry {
  readonly generation: string; readonly digest: string;
  listTemplates(): ReadonlyData<RegisteredTemplate[]>;
  getTemplate(id: string): ReadonlyData<RegisteredTemplate> | undefined;
  listPackages(): ReadonlyData<PackageMetadata[]>;
  toJSON(): ReadonlyData<RegistryJSON>;
}
export const PLUGIN_API_VERSION: 1;
export const PLUGIN_MANIFEST_VERSION: 1;
export function validatePluginManifest(input: unknown): PluginManifest;
export function validateTemplateDefinition(input: unknown): TemplateDefinition;
export function createPackageSnapshot(input: { manifest: PluginManifest; templates: TemplateDefinition[]; digest?: string }): ReadonlyData<PackageSnapshot>;
export function createRegistry(input?: { packages?: ReadonlyData<PackageSnapshot>[]; builtins?: (TemplateDefinition & { origin?: TemplateOrigin })[] }): Registry;
export function discoverLocalPackage(directory: string | URL): Promise<ReadonlyData<PackageSnapshot>>;
