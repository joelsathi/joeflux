import { assertCompositionLocks } from './composition-locks.js';
import { EventEmitter } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import { constants, createReadStream, watch } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { fingerprint, validateProject } from '../../core/src/index.js';
import { loadProject } from '../../core/src/io.js';
import { withProjectLock } from '../../core/src/project-lock.js';

export class ToolError extends Error {
  constructor(message, issues = []) { super(message); this.issues = issues; }
}
export const defineTool = (tool) => ({ mutates: false, input: z.object({}), ...tool });

const HISTORY = '.runtime/history.json', LIMIT = 100;
const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);

// Advertised schemas leave out what server-side validation already enforces; every agent turn carries them.
const OMITTED = { $schema: () => true, additionalProperties: (value) => value === false, minLength: (value) => value === 1 };
export function compactSchema(node) {
  if (Array.isArray(node)) return node.map(compactSchema);
  if (!isRecord(node)) return node;
  return Object.fromEntries(Object.entries(node).filter(([key, value]) => !(Object.hasOwn(OMITTED, key) && OMITTED[key](value))).map(([key, value]) => [key, compactSchema(value)]));
}

export function createToolRunner(projectRoot, tools) {
  const root = path.resolve(projectRoot), registry = new Map(tools.map((tool) => [tool.name, tool]));
  const events = new EventEmitter(), known = new Map();
  let queue = Promise.resolve();
  const file = (relative) => {
    const target = path.resolve(root, relative);
    if (!target.startsWith(`${root}${path.sep}`)) throw new ToolError(`Path escapes the project: ${relative}`);
    return target;
  };
  const readText = (relative) => readFile(file(relative), 'utf8').catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error));
  const emit = (event) => events.emit('event', { at: new Date().toISOString(), ...event });

  const blob = value => value && typeof value === 'object' && typeof value.blob === 'string';
  const digest = async target => {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(target)) hash.update(chunk);
    return hash.digest('hex');
  };
  const blobFile = value => {
    if (!/^[a-f0-9]{64}$/.test(value.blob)) throw new ToolError('Invalid history blob.');
    return file(`.runtime/blobs/${value.blob}`);
  };
  async function atomicWrite(target, value) {
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      if (blob(value)) await copyFile(blobFile(value), temporary, constants.COPYFILE_FICLONE);
      else await writeFile(temporary, value);
      await rename(temporary, target);
    } finally { await rm(temporary, { force: true }); }
  }
  async function storeBlob(source) {
    const temporary = file(`.runtime/blobs/${randomUUID()}.tmp`);
    await mkdir(path.dirname(temporary), { recursive: true });
    try {
      // Copy-on-write clones keep media history nearly free on APFS, Btrfs and XFS.
      await copyFile(source, temporary, constants.COPYFILE_FICLONE);
      const value = { blob: await digest(temporary), bytes: (await stat(temporary)).size };
      await rename(temporary, blobFile(value));
      return value;
    } finally { await rm(temporary, { force: true }); }
  }
  async function current(relative, binary = false) {
    if (!binary) return readText(relative);
    try { return { blob: await digest(file(relative)), bytes: (await stat(file(relative))).size }; }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  const equal = (a, b) => blob(a) && blob(b) ? a.blob === b.blob : a === b;
  async function writeChange(relative, after) {
    const target = file(relative);
    if (after === null) await rm(target, { force: true });
    else await atomicWrite(target, after);
    if (!blob(after)) known.set(relative, after);
  }
  const loadHistory = async () => {
    const history = JSON.parse(await readText(HISTORY) ?? '{"entries":[],"cursor":0}');
    // Stable IDs for pre-upgrade entries, without changing the history on a read.
    history.entries = history.entries.map(entry => ({ ...entry, id: entry.id ?? createHash('sha256').update(JSON.stringify(entry)).digest('hex'), details: entry.details ?? entry.changes.map(change => change.file) }));
    return history;
  };
  const saveHistory = history => atomicWrite(file(HISTORY), JSON.stringify(history));
  // New files land before the manifest that names them, and removals after it, so a
  // live reader never sees project.json refer to a missing scene.
  const rank = change => change.after === null ? 2 : change.file === 'project.json' ? 1 : 0;
  async function pruneBlobs(history) {
    const used = new Set(history.entries.flatMap(entry => entry.changes.flatMap(change => [change.before, change.after])).filter(blob).map(value => value.blob));
    for (const name of await readdir(file('.runtime/blobs')).catch(() => [])) if (!used.has(name)) await rm(file(`.runtime/blobs/${name}`), { force: true }).catch(() => {});
  }
  async function publish(changes, history) {
    const applied = [];
    try {
      for (const change of [...changes].sort((a, b) => rank(a) - rank(b))) { await writeChange(change.file, change.after); applied.push(change); }
      await saveHistory(history);
    } catch (error) {
      const failures = [];
      for (const change of applied.reverse()) try { await writeChange(change.file, change.before); } catch (failure) { failures.push(failure); }
      if (failures.length) throw new AggregateError([error, ...failures], 'Change failed and rollback could not restore every file.');
      throw error;
    }
    // Blobs are created and pruned only under the project lock; pruning is best effort.
    await pruneBlobs(history);
  }
  // Readable lines for change cards: "intro · params.title: "Hi" → "Hello"".
  function detailsFor(changes) {
    const details = [];
    const show = (value) => {
      if (value === undefined) return 'unset';
      if (Array.isArray(value) && value.length && value.every(item => item?.id)) return value.map(item => item.id).join(', ');
      const text = JSON.stringify(value, (_, item) => typeof item === 'number' ? +item.toFixed(3) : item);
      return text.length > 80 ? `${text.slice(0, 79)}…` : text;
    };
    const diff = (before, after, name, key) => {
      if (JSON.stringify(before) === JSON.stringify(after)) return;
      if (isRecord(before) && isRecord(after)) for (const next of new Set([...Object.keys(before), ...Object.keys(after)])) diff(before[next], after[next], name, key ? `${key}.${next}` : next);
      else details.push(`${name} · ${key || 'file'}: ${show(before)} → ${show(after)}`);
    };
    for (const { file: relative, before, after } of changes) {
      const scene = /^scenes\/(.+)\.json$/.exec(relative)?.[1], name = relative === 'project.json' ? 'project' : scene ?? relative;
      const size = blob(after) ? ` (${after.bytes} bytes)` : '';
      if (before === null) details.push(`Added ${scene ? `shot ${scene}` : relative}${size}`);
      else if (after === null) details.push(`Removed ${scene ? `shot ${scene}` : relative}`);
      else if (blob(before) || blob(after)) details.push(`Replaced ${relative}${size}`);
      else try { diff(JSON.parse(before), JSON.parse(after), name, ''); } catch { details.push(`Edited ${relative}`); }
    }
    return details.length > 30 ? [...details.slice(0, 29), `…and ${details.length - 29} more`] : details;
  }
  function transaction() {
    const pending = new Map();
    const read = async (relative) => {
      const text = pending.has(relative) ? pending.get(relative) : await readText(relative);
      if (text === null) throw new ToolError(`Missing file ${relative}.`);
      return blob(text) ? readFile(blobFile(text), 'utf8') : text;
    };
    return {
      pending, read,
      readJson: async (relative) => JSON.parse(await read(relative)),
      writeJson: (relative, value) => { file(relative); pending.set(relative, `${JSON.stringify(value, null, 2)}\n`); },
      writeText: (relative, value) => { file(relative); pending.set(relative, value); },
      importFile: async (relative, source) => { file(relative); pending.set(relative, await storeBlob(source)); },
      remove: (relative) => { file(relative); pending.set(relative, null); },
      project: () => loadProject(root, read),
    };
  }

  async function execute(tool, input, context) {
    try { return await commitTool(tool, input, context); }
    catch (error) {
      // Drop blobs a rejected change stored, unless a failed rollback may still need them.
      if (!(error instanceof AggregateError)) await loadHistory().then(pruneBlobs, () => {});
      throw error;
    }
  }
  // Only rewritten files can break a lock, and an unreadable file holds none.
  const lockedState = pending => relative => relative !== 'project.json' && !pending.has(relative) ? '{}'
    : readText(relative).then(text => JSON.parse(text) ? text : '{}').catch(() => '{}');
  async function commitTool(tool, input, context) {
    const tx = transaction(), result = await tool.run({ ...context, tx }, input);
    if (!tx.pending.size) return result;
    const updatedProject = await tx.project();
    assertCompositionLocks(await loadProject(root, lockedState(tx.pending)), updatedProject);
    const validation = validateProject(updatedProject);
    if (!validation.valid) throw new ToolError('The change would make the project invalid.', validation.errors);
    const changes = [];
    for (const [relative, after] of tx.pending) {
      let before = await current(relative, blob(after));
      if (!equal(before, after)) {
        if (blob(before)) before = await storeBlob(file(relative));
        changes.push({ file: relative, before, after });
      }
    }
    if (!changes.length) return result;
    const history = await loadHistory();
    const entry = { id: randomUUID(), tool: tool.name, summary: tool.summary?.(input) ?? tool.name, details: detailsFor(changes), at: new Date().toISOString(), changes };
    history.entries = [...history.entries.slice(0, history.cursor), entry].slice(-LIMIT);
    history.cursor = history.entries.length;
    await publish(changes, history);
    const metadata = { id: entry.id, summary: entry.summary, details: entry.details };
    emit({ type: 'change', source: 'tool', tool: tool.name, files: changes.map((change) => change.file), change: metadata });
    return result && typeof result === 'object' && !Array.isArray(result) ? { ...result, _change: metadata } : result;
  }

  async function step(direction, { entryId } = {}) {
    const history = await loadHistory(), index = direction === 'undo' ? history.cursor - 1 : history.cursor;
    const entry = history.entries[index];
    if (!entry) throw new ToolError(`Nothing to ${direction}.`);
    if (entryId && entry.id !== entryId) throw new ToolError(direction === 'undo' ? 'This change is no longer the latest change. Undo the more recent change first.' : 'Another change is next to redo now.');
    const [from, to] = direction === 'undo' ? ['after', 'before'] : ['before', 'after'];
    for (const change of entry.changes) if (!equal(await current(change.file, blob(change.before) || blob(change.after)), change[from])) throw new ToolError(`${change.file} changed after "${entry.summary}"; ${direction} would overwrite that edit.`);
    history.cursor = direction === 'undo' ? index : index + 1;
    await publish(entry.changes.map(change => ({ file: change.file, before: change[from], after: change[to] })), history);
    emit({ type: 'change', source: direction, tool: entry.tool, files: entry.changes.map((change) => change.file) });
    return { [direction === 'undo' ? 'undid' : 'redid']: entry.summary, canUndo: history.cursor > 0, canRedo: history.cursor < history.entries.length };
  }

  const runner = {
    root, events,
    list: () => [...registry.values()].map(({ name, description, input, mutates }) => ({ name, description, mutates, inputSchema: compactSchema(z.toJSONSchema(input)) })),
    // History is published by atomic rename, so reads need no lock and never wait on a long import.
    async history() { const { entries, cursor } = await loadHistory(); return { cursor, entries: entries.map(({ id, tool, summary, details, at }) => ({ id, tool, summary, details, at })) }; },
    undo: (options) => serialize(() => step('undo', options)),
    redo: (options) => serialize(() => step('redo', options)),
    async call(name, raw = {}, { signal, jobId = randomUUID() } = {}) {
      const tool = registry.get(name);
      if (!tool) throw new ToolError(`Unknown tool "${name}".`);
      const parsed = tool.input.safeParse(raw);
      if (!parsed.success) throw new ToolError(`Invalid input for ${name}.`, parsed.error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`));
      const context = { root, runner, emit, file, readText, fingerprint, signal };
      const invoke = () => tool.mutates ? serialize(() => execute(tool, parsed.data, context)) : tool.run(context, parsed.data);
      if (!['render_scene', 'render_preview', 'transition_preview', 'film_preview', 'review_clip'].includes(name)) return invoke();
      const progress = (status, detail = {}) => emit({ ...detail, type: 'progress', tool: name, jobId, status });
      context.emit = (event) => event.type === 'progress' ? progress('running', event) : emit(event);
      progress('started');
      try {
        const result = await invoke();
        progress('completed');
        return result;
      } catch (error) {
        progress('failed', { message: error.message });
        throw error;
      }
    },
    // Report edits made outside the tools (editors, agents writing files directly).
    // Content comparison filters the tools' own writes and replayed OS events.
    watch() {
      let timer, changed = new Set();
      const seeded = (async () => {
        const scenes = await readdir(file('scenes')).catch(() => []);
        for (const relative of ['project.json', ...scenes.filter((name) => name.endsWith('.json')).map((name) => `scenes/${name}`)]) if (!known.has(relative)) known.set(relative, await readText(relative));
      })();
      const report = (relative) => {
        if (!/^(project\.json|scenes\/[^/]+\.json)$/.test(relative)) return;
        changed.add(relative); clearTimeout(timer);
        timer = setTimeout(async () => {
          await seeded;
          const files = [];
          for (const item of changed) { const text = await readText(item); if (known.get(item) !== text) { known.set(item, text); files.push(item); } }
          changed = new Set();
          if (files.length) emit({ type: 'change', source: 'external', files });
        }, 120);
      };
      // Two directory watches instead of one recursive watch: on Linux, Node 22's recursive
      // watcher follows file inodes and goes silent once an atomic rename replaces a scene file.
      const watchers = [];
      const watchScenes = () => { try { watchers.push(watch(file('scenes'), (_, name) => name && report(`scenes/${name}`))); return true; } catch { return false; } };
      let scenesWatched = watchScenes();
      watchers.push(watch(root, (_, name) => {
        if (name === 'scenes' && !scenesWatched) scenesWatched = watchScenes();
        if (name) report(name);
      }));
      runner.ready = seeded;
      return () => { clearTimeout(timer); for (const watcher of watchers) watcher.close(); };
    },
  };
  function serialize(task) { const locked = () => withProjectLock(root, 'project-mutations', task); const next = queue.then(locked, locked); queue = next.catch(() => {}); return next; }
  return runner;
}
