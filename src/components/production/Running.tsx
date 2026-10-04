'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Job } from '@/domain/jobs';
import { useStudio } from '@/studio/store';
import { JobRunning, Progress, StateWord } from '@/components/ui/kit';
import { useToast } from '@/components/ui/toast';
import { EmptyLine, Row, Rows, useNow } from '@/components/studio/parts';
import { elapsedMs, fractionOf, isWaiting, jobTitle, phaseWords, running, subjectOf } from './model';

/** WHAT RUNS NOW (VISUAL-STANDARD-V5.1 §5.21) — one row per job the worker holds: what it makes and for whom (a link),
 *  then the kit's JobRunning line (the running dot, the worker's phase in its own words, the elapsed time, Cancel from
 *  the first second); a bar only with a real fraction. Queued jobs say so and can be cancelled too. While nothing
 *  runs, one sentence. Shared by Production and the Studio Company. */
export function RunningNow({ paused }: { paused?: boolean }) {
  const { jobs, state, cancelJob } = useStudio();
  const toast = useToast();
  const list = running(jobs);
  const now = useNow(list.length > 0);
  const [asked, setAsked] = useState<Set<string>>(new Set());
  if (list.length === 0) return <EmptyLine>{paused ? 'Nothing is running: the studio is paused.' : 'Nothing is running.'}</EmptyLine>;
  const cancel = async (j: Job) => {
    setAsked((s) => new Set(s).add(j.id));
    try { await cancelJob(j.id); toast.ok(`Cancelling “${jobTitle(j)}”.`); } catch (e) { toast.bad((e as Error).message); setAsked((s) => { const n = new Set(s); n.delete(j.id); return n; }); }
  };
  return (
    <Rows label="Running now" className="cp-running">
      {list.map((j) => {
        const subject = subjectOf(j, state);
        const queued = j.status === 'QUEUED';
        const waits = isWaiting(j);
        const frac = fractionOf(j);
        const ms = elapsedMs(j, now);
        const cancelling = Boolean(j.cancelRequested) || asked.has(j.id);
        return (
          <Row key={j.id} className="cp-run" start={queued ? <StateWord tone="idle">Queued</StateWord> : waits ? <StateWord tone="idle">Waiting for its jobs</StateWord> : undefined}
            title={<>{jobTitle(j)}{subject && <> · {subject.href ? <Link href={subject.href} className="cp-link"><bdi lang={subject.lang}>{subject.label}</bdi></Link> : <bdi lang={subject.lang}>{subject.label}</bdi>}</>}</>}>
            {waits ? <span className="t-meta">The jobs it started run first; it goes on when they finish. <button type="button" className="btn btn-quiet btn-sm" disabled={cancelling} onClick={() => void cancel(j)}>{cancelling ? 'Cancelling…' : 'Cancel'}</button></span>
              : <JobRunning className="cp-run-line" phase={phaseWords(j)} elapsed={!queued && ms !== null ? ms / 1000 : null} onCancel={() => void cancel(j)} cancelling={cancelling} />}
            {!waits && frac !== null && <Progress className="cp-run-bar" size="sm" value={frac} label={`${jobTitle(j)}: ${Math.round(frac * 100)}% done`} />}
          </Row>
        );
      })}
    </Rows>
  );
}
