'use client';

import { useState } from 'react';
import type { Job } from '@/domain/jobs';
import type { Production } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { useToast } from '@/components/ui/toast';
import { useElapsed } from '@/components/ui/progress';
import { JobRunning, Progress } from '@/components/ui/kit';
import { fractionOf, jobWords, phaseWords, waitingCounts, waitingWords } from './model';

/** A JOB ON THE FLOOR (VISUAL-STANDARD-V5.1 §5.21): the kit's JobRunning (the running dot, the work and its real phase
 *  in words, the elapsed time, Cancel from the first second) over the kit's Progress — determinate only with a real
 *  fraction, indeterminate otherwise — and what to expect from this production's own history. An orchestrator that
 *  waits for the jobs it queued says so, with its real child counts ("Waiting for its shots (3 of 8 done)"). */
export function RunningRow({ job, p, expect }: { job: Job; p?: Production; expect?: string | null }) {
  const { cancelJob, jobs } = useStudio();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const elapsed = useElapsed(job);
  const counts = job.waiting ? waitingCounts(job, jobs) : null;
  const f = counts ? { value: counts.total ? counts.done / counts.total : 0, words: `${counts.done} of ${counts.total}` } : job.waiting ? null : fractionOf(job);
  const what = job.waiting ? `${jobWords(job, p)} · ${waitingWords(job, jobs)}` : `${jobWords(job, p)} · ${phaseWords(job)}`;
  const cancel = async () => {
    setBusy(true);
    try { await cancelJob(job.id); toast.ok('Cancel requested: it stops at the next safe point.'); } catch (e) { toast.bad(`Could not cancel: ${(e as Error).message}`); } finally { setBusy(false); }
  };
  return (
    <div className="ws-run" data-waiting={job.waiting || undefined}>
      <JobRunning phase={what} elapsed={elapsed} onCancel={() => void cancel()} cancelling={busy || job.cancelRequested} />
      <Progress value={f?.value ?? null} label={what} count={f?.words} size="sm" />
      {expect && <p className="t-meta">For reference, {expect}.</p>}
    </div>
  );
}
