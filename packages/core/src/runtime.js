// CLI defaults remain on PATH; desktop builds supply immutable bundled paths.
export function mediaTool(name) {
  return process.env[`JOEFLUX_${name.toUpperCase()}`] || name;
}

export function nodeSubprocessEnvironment(env = process.env) {
  return env.ELECTRON_RUN_AS_NODE === '1' ? { ELECTRON_RUN_AS_NODE: '1' } : {};
}
