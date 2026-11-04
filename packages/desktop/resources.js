import { cp, rm } from 'node:fs/promises';

// macOS frameworks use relative symlinks. Preserve them so a packaged browser
// never points back into the build machine's cache, including on repeat builds.
export async function copyRuntimeDirectory(source, destination) {
  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true, verbatimSymlinks: true });
}
