'use client';

import { useState } from 'react';
import type { Job } from '@/domain/jobs';
import type { Production } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { useToast } from '@/components/ui/toast';
import { fmtElapsed, useElapsed } from '@/components/ui/progress';
import { Button, Progress } from '@/components/ui/kit';
import { fractionOf, jobWords, phaseWords } from './model';

/** A JOB ON THE FLOOR (VISUAL-STANDARD-V5.1 §5.21 "Job running"): the running dot, the work and its real phase in words,
 *  a bar only with a real fraction (else indeterminate), the elapsed time in mono and Cancel from the first second.
 *  TEMPORARY page-local composition of the kit's Progress: the Design System Engineer is lifting a shared job-running
 *  Progress with Cancel; this wrapper is deleted when it lands. */
export function RunningRow({ job, p, expect }: { job: Job; p?: Production; expect?: string | null }) {
  const { cancelJob } = useStudio();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const elapsed = useElapsed(job);
  const f = fractionOf(job);
  const what = jobWords(job, p);
  const cancel = async () => {
    setBusy(true);
    try { await cancelJob(job.id); toast.ok('Cancel requested: it stops at the next safe point.'); } catch (e) { toast.bad(`Could not cancel: ${(e as Error).message}`); } finally { setBusy(false); }
  };
  return (
    <div className="ws-run" aria-live="polite">
      <div className="ws-run-head">
        <span className="ws-run-what"><span className="state-dot" data-tone={job.status === 'QUEUED' ? 'idle' : 'running'} aria-hidden />{what}<span className="ws-run-phase"> · {phaseWords(job)}</span></span>
        <span className="ws-run-end">
          {f && <span className="ws-ro">{f.words}</span>}
          <span className="ws-ro" aria-label={`Elapsed ${fmtElapsed(elapsed)}`}>{fmtElapsed(elapsed)}</span>
          <Button size="sm" variant="quiet" onClick={() => void cancel()} loading={busy} disabled={job.cancelRequested}>{job.cancelRequested ? 'Cancelling…' : 'Cancel'}</Button>
        </span>
      </div>
      <Progress value={f?.value ?? null} label={`${what}: ${phaseWords(job)}`} size="sm" />
      {expect && <p className="ws-run-expect">For reference, {expect}.</p>}
    </div>
  );
}
