export function assetUrlForScene(project, scene) {
  const assetName = scene?.params?.asset;
  const assetPath = assetName && project?.assets?.[assetName];
  if (!assetPath) return null;
  return `/project-assets/${assetPath.split('/').map(encodeURIComponent).join('/')}`;
}
