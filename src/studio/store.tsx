'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Asset, StudioState } from '@/domain/types';
import { seed } from '@/domain/sample';
import { type Command, type CommandArgs, type CommandName, type CommandResult, runCommand } from '@/domain/commands';
import { newSeed } from '@/domain/ids';
import { hashState } from '@/domain/hash';
import { StudioError, isStudioError } from '@/domain/errors';
import { type Job, type JobPayload, type JobType, isActiveStatus } from '@/domain/jobs';
import { api, type Capabilities } from './api';

/** THE STORE — the studio as the server holds it, mirrored in React state. Every change is a named command: it is
 *  applied here at once (so the interface never waits) and sent to the server in small batches, where the same
 *  command runs against the authoritative state. If the server refuses, or the two copies drift, the browser
 *  re-reads the snapshot. Jobs (generation work) arrive and update through the event stream. */

export type AddFileResult = { ok: true; asset: Asset } | { ok: false; error: string };

interface Api {
  state: StudioState;
  /** True once the first snapshot has arrived. Pages render a skeleton until then. */
  ready: boolean;
  /** True when the studio differs from the last seed (sample or empty). */
  modified: boolean;
  /** The event stream is open and the last batch was accepted. */
  connected: boolean;
  version: number;
  capabilities: Capabilities | null;
  /** The last problem syncing or running a command, for the toast layer. Cleared by `clearError`. */
  lastError: { id: number; message: string; code: string } | null;
  clearError: () => void;
  /** Run a studio command. Applied immediately; throws a StudioError when the rule refuses it. */
  act: <K extends CommandName>(name: K, ...args: CommandArgs<K>) => CommandResult<K>;
  /** Upload a file to the library and record it as an asset. */
  addFile: (file: File, meta: { label?: string; tags?: string[]; expect?: Asset['kind'] }) => Promise<AddFileResult>;
  /** Remove an asset and its file. Refused for a picture a used character's appearance rests on. */
  removeAsset: (id: string) => Promise<{ ok: true } | { ok: false; protectedBy: string; error: string }>;
  reset: () => Promise<void>;
  startEmpty: () => Promise<void>;
  refresh: () => Promise<void>;
  jobs: Job[];
  /** Counts up whenever the studio records an activity event (an agent started, finished, handed off, inspected);
   *  pages that show the organisation refetch on it. */
  activityTick: number;
  startJob: <T extends JobType>(type: T, payload: JobPayload<T>, opts?: { idempotencyKey?: string; priority?: number }) => Promise<Job>;
  cancelJob: (id: string) => Promise<Job>;
  retryJob: (id: string, changeMade?: string) => Promise<Job>;
}

const Ctx = createContext<Api | null>(null);

const clientId = () => { try { let id = sessionStorage.getItem('vewbox.client'); if (!id) { id = newSeed(); sessionStorage.setItem('vewbox.client', id); } return id; } catch { return newSeed(); } };

export function StudioProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StudioState>(seed);
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);
  const [seedVersion, setSeedVersion] = useState(0);
  const [connected, setConnected] = useState(false);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [lastError, setLastError] = useState<Api['lastError']>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activityTick, setActivityTick] = useState(0);
  const latest = useRef(state); latest.current = state;
  /** The newest server version this page has seen. A change event from our own client id for a newer version than
   *  this (with nothing in flight) means a previous page's last writes landed after our snapshot: refresh. */
  const knownVersion = useRef(0);
  const bumpVersion = useCallback((v: number) => { knownVersion.current = Math.max(knownVersion.current, v); setVersion(v); }, []);
  const pending = useRef<Command[]>([]);
  const inflight = useRef<Command[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jobsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const me = useRef<string>('');
  const errorSeq = useRef(0);
  const failures = useRef(0);

  const raise = useCallback((code: string, message: string) => { errorSeq.current += 1; setLastError({ id: errorSeq.current, code, message }); }, []);

  const applyLocal = useCallback((next: StudioState) => { latest.current = next; setState(next); }, []);

  /** Re-read the authoritative snapshot, keeping unsent and in-flight commands applied on top. */
  const refresh = useCallback(async () => {
    try {
      const snap = await api.snapshot();
      let s = snap.state;
      for (const c of [...inflight.current, ...pending.current]) { try { s = runCommand(s, c).state; } catch { /* the server will say */ } }
      applyLocal(s); bumpVersion(snap.version); setSeedVersion(snap.seeded?.version ?? 0); setCapabilities(snap.capabilities); setReady(true);
    } catch (e) { raise(isStudioError(e) ? e.code : 'UNAVAILABLE', isStudioError(e) ? e.message : 'The studio server cannot be reached.'); }
  }, [applyLocal, bumpVersion, raise]);

  const scheduleRefresh = useCallback((ms = 150) => { if (refreshTimer.current) clearTimeout(refreshTimer.current); refreshTimer.current = setTimeout(() => { refreshTimer.current = null; void refresh(); }, ms); }, [refresh]);

  const loadJobs = useCallback(async () => { try { setJobs(await api.jobs({ limit: 300 })); } catch { /* shown by connected flag */ } }, []);
  const scheduleJobs = useCallback((ms = 250) => { if (jobsTimer.current) clearTimeout(jobsTimer.current); jobsTimer.current = setTimeout(() => { jobsTimer.current = null; void loadJobs(); }, ms); }, [loadJobs]);

  const flush = useCallback(async () => {
    if (inflight.current.length > 0 || pending.current.length === 0) return;
    inflight.current = pending.current; pending.current = [];
    try {
      const r = await api.commands(me.current, inflight.current);
      failures.current = 0; setConnected(true);
      if (r.ok) {
        bumpVersion(r.version);
        inflight.current = [];
        // nothing else queued and the hashes differ: another process changed something in between, or our copy drifted
        if (pending.current.length === 0 && r.hash !== hashState(latest.current)) scheduleRefresh(0);
      } else {
        const failed = inflight.current[r.failedAt];
        inflight.current = [];
        raise(r.error.code, r.error.message);
        void failed;
        scheduleRefresh(0);
      }
    } catch (e) {
      // network trouble: keep the commands and try again with a growing delay
      pending.current = [...inflight.current, ...pending.current]; inflight.current = [];
      failures.current += 1; setConnected(false);
      if (failures.current === 1) raise(isStudioError(e) ? e.code : 'UNAVAILABLE', isStudioError(e) ? e.message : 'Changes could not be saved; retrying.');
      flushTimer.current = setTimeout(() => { flushTimer.current = null; void flush(); }, Math.min(30_000, 1000 * 2 ** failures.current));
      return;
    }
    if (pending.current.length > 0) { flushTimer.current = setTimeout(() => { flushTimer.current = null; void flush(); }, 50); }
  }, [bumpVersion, raise, scheduleRefresh]);

  const scheduleFlush = useCallback(() => { if (flushTimer.current) return; flushTimer.current = setTimeout(() => { flushTimer.current = null; void flush(); }, 120); }, [flush]);

  const act = useCallback(<K extends CommandName>(name: K, ...args: CommandArgs<K>): CommandResult<K> => {
    const cmd: Command<K> = { name, args, seed: newSeed(), at: new Date().toISOString() };
    const r = runCommand(latest.current, cmd); // throws StudioError when refused; nothing is queued then
    if (r.state !== latest.current) { applyLocal(r.state); pending.current.push(cmd as Command); scheduleFlush(); }
    return r.result;
  }, [applyLocal, scheduleFlush]);

  // first load, the event stream, and a flush before the tab goes away
  useEffect(() => {
    me.current = clientId();
    void refresh(); void loadJobs();
    let es: EventSource | null = null; let closed = false; let backoff = 1000;
    const open = () => {
      if (closed) return;
      es = new EventSource('/api/events');
      es.addEventListener('hello', () => { setConnected(true); backoff = 1000; scheduleRefresh(0); scheduleJobs(0); });
      es.addEventListener('studio', (ev) => {
        try {
          const e = JSON.parse((ev as MessageEvent).data) as { version: number; origin: string };
          const ours = e.origin === me.current;
          const landedAfterOurSnapshot = ours && e.version > knownVersion.current && inflight.current.length === 0 && pending.current.length === 0;
          if (!ours || landedAfterOurSnapshot) scheduleRefresh(); else bumpVersion(e.version);
        } catch { /* ignore */ }
      });
      es.addEventListener('job', () => scheduleJobs());
      es.addEventListener('activity', () => setActivityTick((t) => t + 1));
      es.onerror = () => { setConnected(false); es?.close(); es = null; if (!closed) setTimeout(open, backoff); backoff = Math.min(30_000, backoff * 2); };
    };
    open();
    const flushNow = () => { if (pending.current.length && navigator.sendBeacon) { const body = new Blob([JSON.stringify({ clientId: me.current, commands: pending.current })], { type: 'application/json' }); if (navigator.sendBeacon('/api/commands', body)) pending.current = []; } };
    window.addEventListener('pagehide', flushNow);
    return () => { closed = true; es?.close(); window.removeEventListener('pagehide', flushNow); };
  }, [refresh, loadJobs, scheduleRefresh, scheduleJobs, bumpVersion]);

  const addFile = useCallback(async (file: File, meta: { label?: string; tags?: string[]; expect?: Asset['kind'] }): Promise<AddFileResult> => {
    try {
      const asset = await api.upload(file, meta);
      // the server already recorded it; put it in our copy without sending a command
      if (!latest.current.assets.some((a) => a.id === asset.id)) applyLocal({ ...latest.current, assets: [...latest.current.assets, asset] });
      return { ok: true, asset };
    } catch (e) { return { ok: false, error: isStudioError(e) ? e.message : 'The file could not be uploaded.' }; }
  }, [applyLocal]);

  const removeAsset = useCallback(async (id: string): Promise<{ ok: true } | { ok: false; protectedBy: string; error: string }> => {
    try {
      // run the rule locally first so the refusal is instant and nothing is sent
      const cmd: Command<'deleteAsset'> = { name: 'deleteAsset', args: [id], seed: newSeed(), at: new Date().toISOString() };
      const r = runCommand(latest.current, cmd);
      await api.deleteAsset(id);
      applyLocal(r.state);
      return { ok: true };
    } catch (e) {
      if (e instanceof StudioError && e.code === 'ASSET_PROTECTED') return { ok: false, protectedBy: String(e.details?.characterName ?? ''), error: e.message };
      return { ok: false, protectedBy: '', error: isStudioError(e) ? e.message : 'The file could not be removed.' };
    }
  }, [applyLocal]);

  const reset = useCallback(async () => { pending.current = []; await api.reset('sample'); await refresh(); await loadJobs(); }, [refresh, loadJobs]);
  const startEmpty = useCallback(async () => { pending.current = []; await api.reset('empty'); await refresh(); await loadJobs(); }, [refresh, loadJobs]);

  const startJob = useCallback(async <T extends JobType>(type: T, payload: JobPayload<T>, opts: { idempotencyKey?: string; priority?: number } = {}) => {
    const r = await api.startJob(type, payload, opts);
    setJobs((js) => (js.some((j) => j.id === r.job.id) ? js.map((j) => (j.id === r.job.id ? r.job : j)) : [r.job, ...js]));
    return r.job;
  }, []);
  const cancelJob = useCallback(async (id: string) => { const j = await api.cancelJob(id); setJobs((js) => js.map((x) => (x.id === id ? j : x))); return j; }, []);
  // a refused retry (a non-transient failure needs a stated change) is shown, not swallowed by a `void` caller
  const retryJob = useCallback(async (id: string, changeMade?: string) => { try { const j = await api.retryJob(id, changeMade); setJobs((js) => js.map((x) => (x.id === id ? j : x))); return j; } catch (e) { raise((e as { code?: string }).code ?? 'UNAVAILABLE', (e as Error).message); throw e; } }, [raise]);

  const clearError = useCallback(() => setLastError(null), []);
  const modified = ready && version !== seedVersion;

  const value = useMemo<Api>(() => ({ state, ready, modified, connected, version, capabilities, lastError, clearError, act, addFile, removeAsset, reset, startEmpty, refresh, jobs, activityTick, startJob, cancelJob, retryJob }), [state, ready, modified, connected, version, capabilities, lastError, clearError, act, addFile, removeAsset, reset, startEmpty, refresh, jobs, activityTick, startJob, cancelJob, retryJob]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStudio(): Api {
  const api = useContext(Ctx);
  if (!api) throw new Error('useStudio outside StudioProvider');
  return api;
}

/** The jobs touching one production, shot, character or location — active ones first. */
export function useJobsFor(where: { productionId?: string; shotId?: string; characterId?: string; locationId?: string; type?: JobType }): Job[] {
  const { jobs } = useStudio();
  return useMemo(() => jobs.filter((j) => (!where.productionId || j.productionId === where.productionId) && (!where.shotId || j.shotId === where.shotId) && (!where.characterId || j.characterId === where.characterId) && (!where.locationId || j.locationId === where.locationId) && (!where.type || j.type === where.type)).sort((a, b) => Number(isActiveStatus(b.status)) - Number(isActiveStatus(a.status)) || b.createdAt.localeCompare(a.createdAt)), [jobs, where.productionId, where.shotId, where.characterId, where.locationId, where.type]);
}

export const activeJob = (jobs: Job[]): Job | undefined => jobs.find((j) => isActiveStatus(j.status));
