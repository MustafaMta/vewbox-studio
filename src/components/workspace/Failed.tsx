'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Production } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { shotHref, shotLabel } from '@/studio/selectors';
import { useToast } from '@/components/ui/toast';
import { useErrorCopy } from '@/components/ui/progress';
import { Button, SectionHead } from '@/components/ui/kit';
import { IconRetry } from '@/components/ui/icons';
import type { StudioGate } from './gate';
import { activeShotJob, failedShotsOf, type FailedShot } from './model';

/** FAILED SHOTS (a production pass's `failedShots`): a shot that failed fails alone — the rest of the film is kept.
 *  Each says its real error class in plain words and offers one recovery: a new take of that shot only
 *  (POST /api/productions/:id/regenerate { shotId }). While intake is paused or the video engine is offline the button
 *  stays disabled with the reason beside it. */

export function RegenerateShot({ p, shotId, gate, compact }: { p: Production; shotId: string; gate: StudioGate; compact?: boolean }) {
  const { jobs } = useStudio();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const running = activeShotJob(p, shotId, jobs);
  const checking = gate.paused === null;
  const why = checking ? null : gate.blocked('video') ?? (running ? 'This shot is being made now.' : null);
  const go = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/productions/${encodeURIComponent(p.id)}/regenerate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shotId, idempotencyKey: `regen-${shotId}-${Date.now()}` }) });
      const b = await r.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!r.ok) throw new Error(b?.error?.message ?? `The shot could not be queued (${r.status}).`);
      toast.ok('A new take of this shot is queued.');
    } catch (e) { toast.bad((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <span className="ws-gen">
      <Button size="sm" icon={<IconRetry aria-hidden />} loading={busy} disabled={checking || Boolean(why)} title={why ?? undefined} onClick={() => void go()}>Regenerate this shot</Button>
      {!compact && <span className="ws-gen-why" aria-hidden={why ? undefined : true}>{why}</span>}
      {compact && why && <span className="sr-only">{why}</span>}
    </span>
  );
}

/** What went wrong, in words: the failed child job's error class, else the pass's own reason. */
export function useFailureWords() {
  const copyOf = useErrorCopy();
  return (f: FailedShot) => (f.job?.error ? copyOf(f.job.error).title : f.job?.status === 'CANCELLED' || f.reason === 'cancelled' ? 'Cancelled before it finished' : f.reason || 'The take could not be made');
}

/** The map's list of failed shots (absent when none failed). */
export function FailedShots({ p, gate }: { p: Production; gate: StudioGate }) {
  const { jobs } = useStudio();
  const words = useFailureWords();
  const failed = failedShotsOf(p, jobs);
  if (failed.length === 0) return null;
  return (
    <section className="ws-sec" aria-labelledby="ws-failed-h" id="failed">
      <SectionHead id="ws-failed-h" title="Failed shots" count={failed.length} description="Each failed on its own; every other shot is kept. Your settings and references are kept too." />
      <ol className="ws-versions" role="list">
        {failed.map((f) => {
          const sh = p.shots.find((s) => s.id === f.shotId)!;
          return (
            <li key={f.shotId} className="ws-failed-row" data-failed="">
              <Link className="ws-versions-n" href={shotHref(p, sh.id)}>Shot {shotLabel(p, sh)}</Link>
              <span className="ws-versions-d"><span className="state-dot" data-tone="failed" aria-hidden /> {words(f)}</span>
              <span className="ws-versions-t name" dir="auto"><bdi>{sh.purpose || sh.action}</bdi></span>
              <RegenerateShot p={p} shotId={sh.id} gate={gate} compact />
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The shot workspace's failure notice: shown when the production pass failed this shot. */
export function ShotFailure({ p, shotId, gate }: { p: Production; shotId: string; gate: StudioGate }) {
  const { jobs } = useStudio();
  const words = useFailureWords();
  const f = failedShotsOf(p, jobs).find((x) => x.shotId === shotId);
  if (!f) return null;
  return (
    <div className="ws-gate ws-failure" data-state="failed" role="status">
      <span className="ws-gate-words">
        <span className="t-title">{words(f)}</span>
        <span className="t-body">This shot failed in the production pass; the rest of the film is kept, and so are your settings and references.</span>
      </span>
      <RegenerateShot p={p} shotId={shotId} gate={gate} />
    </div>
  );
}
