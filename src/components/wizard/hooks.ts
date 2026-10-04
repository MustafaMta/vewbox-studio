'use client';

import { useEffect, useState } from 'react';
import { api } from '@/studio/api';
import { isActiveStatus } from '@/domain/jobs';
import type { DevelopmentView, EngineReading, ResearchSource } from './model';

/** Is the story engine reachable, and is the studio taking new work? (GET /api/status, GET /api/health — reads only.) */
export function useEngines(): EngineReading {
  const [r, setR] = useState<EngineReading>({ storyOk: null, intakePaused: false, intakeKnown: false });
  useEffect(() => {
    let live = true;
    api.health().then((h: { intake?: { paused?: boolean; reason?: string } }) => { if (live) setR((x) => ({ ...x, intakeKnown: true, intakePaused: Boolean(h?.intake?.paused), intakeReason: h?.intake?.reason })); }).catch(() => { if (live) setR((x) => ({ ...x, intakeKnown: true })); });
    api.status().then((s) => { if (live) setR((x) => ({ ...x, storyOk: Boolean(s.story?.ok) })); }).catch(() => { if (live) setR((x) => ({ ...x, storyOk: false })); });
    return () => { live = false; };
  }, []);
  return r;
}

/** Which research sources are reachable (GET /api/research/sources). */
export function useResearchSources(): { enabled: boolean; sources: ResearchSource[] } | null {
  const [r, setR] = useState<{ enabled: boolean; sources: ResearchSource[] } | null>(null);
  useEffect(() => {
    let live = true;
    fetch('/api/research/sources', { cache: 'no-store' }).then((x) => (x.ok ? x.json() : null)).then((b) => { if (live && b) setR({ enabled: b.enabled !== false, sources: b.sources ?? [] }); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return r;
}

/** One Auto Idea's development (GET /api/development/:ideaJobId), read every two seconds while it runs and once more
 *  when the job event says it changed. */
export function useDevelopment(ideaJobId: string | null, tick: unknown): { view: DevelopmentView | null; error: string | null } {
  const [view, setView] = useState<DevelopmentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!ideaJobId) { setView(null); return; }
    let live = true; let timer: ReturnType<typeof setTimeout> | null = null;
    const read = async () => {
      try {
        const r = await fetch(`/api/development/${encodeURIComponent(ideaJobId)}`, { cache: 'no-store' });
        if (!r.ok) throw new Error(r.status === 404 ? 'This idea is not in the studio.' : `The studio answered ${r.status}.`);
        const v = (await r.json()) as DevelopmentView;
        if (!live) return;
        setView(v); setError(null);
        if (isActiveStatus(v.job.status)) timer = setTimeout(read, 2000);
      } catch (e) { if (live) setError((e as Error).message); }
    };
    void read();
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [ideaJobId, tick]);
  return { view, error };
}
