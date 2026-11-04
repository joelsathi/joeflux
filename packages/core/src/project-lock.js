import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, realpath, stat, unlink, utimes } from 'node:fs/promises';
import { hostname, uptime } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Holders refresh the lock's mtime; an unreadable or remote lock left alone this long is abandoned.
const STALE = 30_000, BEAT = 5_000;
const missing = error => { if (error.code !== 'ENOENT') throw error; return null; };
const bootTime = () => {
  // Some sandboxes allow project writes and process checks but deny system uptime.
  try { return Date.now() - uptime() * 1000; } catch { return null; }
};

// Owner is null while unreadable: being written, or left empty by a crash or power loss.
async function inspect(file) {
  const info = await stat(file).catch(missing);
  if (!info) return null;
  let owner = null;
  try { owner = JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; }
  return { owner, age: Date.now() - info.mtimeMs, id: owner?.token ?? `${info.ino}:${info.mtimeMs}` };
}

// A local owner is judged by its process, so a live holder is never stolen, even across sleep.
// Its pid means nothing after a reboot; remote and unreadable owners are judged by heartbeat.
function abandoned({ owner, age }) {
  if (owner?.host === hostname() && Number.isInteger(owner.pid)) {
    const boot = bootTime();
    if (Number.isFinite(owner.boot) && Number.isFinite(boot) && Math.abs(owner.boot - boot) > 120_000) return true;
    try { process.kill(owner.pid, 0); return false; } catch (error) { return error.code === 'ESRCH'; }
  }
  return age > STALE;
}

// Exclusive create works on every local and network filesystem, unlike hard links (exFAT, FAT, SMB).
async function acquire(file, signal) {
  const token = randomUUID(), owner = JSON.stringify({ token, pid: process.pid, host: hostname(), boot: bootTime() });
  for (;;) {
    signal?.throwIfAborted();
    const handle = await open(file, 'wx').catch(error => { if (error.code === 'EEXIST') return null; throw error; });
    if (handle) {
      try { await handle.writeFile(owner); await handle.close(); }
      catch (error) { await handle.close().catch(() => {}); await unlink(file).catch(missing); throw error; }
      const beat = setInterval(() => { const now = new Date(); utimes(file, now, now).catch(() => {}); }, BEAT);
      beat.unref();
      return async () => {
        clearInterval(beat);
        if ((await inspect(file))?.owner?.token === token) await unlink(file).catch(missing);
      };
    }
    const seen = await inspect(file);
    if (!seen) continue;
    if (!abandoned(seen)) { await delay(20, undefined, { signal }); continue; }
    // Serialize reapers of this exact lock state, then recheck: a delayed reaper
    // must never unlink a newer owner's lock. The guard recovers the same way.
    const release = await acquire(`${file}.${createHash('sha256').update(seen.id).digest('hex').slice(0, 16)}.reap`, signal);
    try {
      const again = await inspect(file);
      if (again?.id === seen.id && abandoned(again)) await unlink(file).catch(missing);
    } finally { await release(); }
  }
}

/** Cross-process lock on a local project. The callback must not reacquire the same key. */
export async function withProjectLock(root, key, callback, { signal } = {}) {
  signal?.throwIfAborted();
  const directory = path.join(await realpath(root), '.runtime', 'locks');
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `${createHash('sha256').update(key).digest('hex')}.lock`);
  const release = await acquire(file, signal);
  try { signal?.throwIfAborted(); return await callback(); } finally { await release(); }
}
