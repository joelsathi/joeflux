import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toV2 } from '../../../packages/schema/src/migrate.js';
import { callTool, subscribeEvents, mergePatch } from './api.js';

const StudioContext = createContext(null);
export const useStudio = () => useContext(StudioContext);

export function StudioProvider({ children }) {
  const [project, setProject] = useState(null);
  const [history, setHistory] = useState({ cursor: 0, entries: [] });
  const [selectedId, select] = useState(null);
  const [draft, setDraft] = useState(null);
  const [notice, setNotice] = useState(null);
  const [jobs, setJobs] = useState({ active: new Map(), finished: new Set() });
  const progress = [...jobs.active.values()].at(-1) ?? null;
  const [loadError, setLoadError] = useState(null);
  const [framing, setFraming] = useState(false), [activeStop, setActiveStop] = useState(null);

  const refresh = useCallback(async () => {
    const [next, log] = await Promise.all([callTool('project_get', { detail: 'full' }), callTool('history_list')]);
    setProject(next); setHistory(log); setLoadError(null);
    select((id) => next.scenes.some((scene) => scene.id === id) ? id : next.scenes[0]?.id ?? null);
    return next;
  }, []);

  // Tool writes, agent edits and outside file edits all arrive as change events.
  useEffect(() => {
    refresh().catch((error) => setLoadError(error.message));
    let timer;
    const listen = (event) => {
      if (event.type === 'progress') {
        if (!event.jobId) return;
        return setJobs((current) => {
          const active = new Map(current.active), finished = new Set(current.finished);
          if (event.status === 'completed' || event.status === 'failed') {
            // A delayed frame or start event must not revive a completed job.
            active.delete(event.jobId); finished.add(event.jobId);
          } else if (!finished.has(event.jobId)) active.set(event.jobId, event);
          return { active, finished };
        });
      }
      clearTimeout(timer); timer = setTimeout(() => refresh().catch(() => {}), 60);
    };
    const stop = subscribeEvents(listen);
    return () => { stop(); clearTimeout(timer); };
  }, [refresh]);

  const run = useCallback(async (name, input) => {
    try { const result = await callTool(name, input); await refresh(); return result; }
    catch (error) { setNotice({ severity: 'error', message: error.message, issues: error.issues }); throw error; }
  }, [refresh]);

  // Sliders preview a local patch and commit once, so each drag is one undo step.
  const commit = useCallback(async (name, input) => {
    try { await run(name, input); } catch { /* reported through notice */ } finally { setDraft(null); }
  }, [run]);

  useEffect(() => { setFraming(false); setActiveStop(null); }, [selectedId]);
  const saved = project?.scenes.find((scene) => scene.id === selectedId) ?? null;
  const scene = useMemo(() => {
    if (!saved) return null;
    const base = toV2(saved);
    return draft?.id === saved.id ? mergePatch(base, draft.patch) : base;
  }, [saved, draft]);

  const value = { project, scene, saved, selectedId, select, history, run, commit, refresh, notice, setNotice, preview: (patch) => setDraft({ id: selectedId, patch }), progress, jobs: jobs.active, loadError, framing, setFraming, activeStop, setActiveStop };
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}
