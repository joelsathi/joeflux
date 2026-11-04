// A negative gate, not a legal approval: retain notices and audit corresponding
// source/build obligations separately for every actual distributed binary.
export function assertRedistributableMedia(name, {buildConfiguration,licenseOutput}) {
  if (!buildConfiguration?.trim() || !licenseOutput?.trim()) throw new Error(`${name}: missing binary build/license audit.`);
  if (/--enable-nonfree\b/i.test(buildConfiguration) || /not (?:legally )?redistributable|nonfree parts/i.test(licenseOutput)) {
    throw new Error(`${name}: the selected binary reports a nonredistributable build. Replace it with an audited distributable build before desktop packaging.`);
  }
}
