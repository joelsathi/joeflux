const path = require('node:path');
const os = require('node:os');

exports.desktopEnvironment = function desktopEnvironment(resources, inherited = process.env) {
  const runtime = path.join(resources, 'runtime');
  const home = inherited.HOME || os.homedir();
  const extra = [path.join(home, '.local/bin'), path.join(home, '.npm-global/bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];
  return {
    ...inherited,
    PATH: [...new Set([...(inherited.PATH || '').split(path.delimiter).filter(Boolean), ...extra])].join(path.delimiter),
    ELECTRON_RUN_AS_NODE: '1',
    JOEFLUX_FFMPEG: path.join(runtime, 'ffmpeg'),
    JOEFLUX_FFPROBE: path.join(runtime, 'ffprobe'),
    PLAYWRIGHT_BROWSERS_PATH: path.join(runtime, 'browsers'),
  };
};
