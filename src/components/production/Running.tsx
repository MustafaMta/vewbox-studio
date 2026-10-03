'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Job } from '@/domain/jobs';
import { useStudio } from '@/studio/store';
import { Button, JobDot, Progress, StateWord } from '@/components/ui/kit';
import { useToast } from '@/components/ui/toast';
import { EmptyLine, Row, Rows, useNow } from '@/components/studio/parts';
import { clock, elapsedMs, fractionOf, jobTitle, phaseWords, running, subjectOf } from './model';

/** WHAT RUNS NOW (VISUAL-STANDARD-V5.1 §5.21) — one row per job the worker holds: the running dot and what it makes,
 *  for whom (a link), the worker's phase in its own words, the elapsed time, and Cancel from the first second. A bar
 *  only with a real fraction; an indeterminate bar otherwise; queued jobs wait without one. While nothing runs, one
 *  sentence. Shared by Production and the Studio Company. */
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
        const frac = fractionOf(j);
        const ms = elapsedMs(j, now);
        const cancelling = j.cancelRequested || asked.has(j.id);
        return (
          <Row key={j.id} className="cp-run"
            start={queued ? <StateWord tone="idle">Queued</StateWord> : <JobDot>Running</JobDot>}
            title={<>{jobTitle(j)}{subject && <> · {subject.href ? <Link href={subject.href} className="cp-link"><bdi lang={subject.lang}>{subject.label}</bdi></Link> : <bdi lang={subject.lang}>{subject.label}</bdi>}</>}</>}
            meta={<span>{phaseWords(j)}</span>}
            end={<>
              {ms !== null && <span className="t-ro cp-time" aria-label={`Elapsed ${clock(ms)}`}>{clock(ms)}</span>}
              <Button size="sm" variant="quiet" disabled={cancelling} onClick={() => void cancel(j)}>{cancelling ? 'Cancelling…' : 'Cancel'}</Button>
            </>}>
            {!queued && <Progress className="cp-run-bar" size="sm" value={frac ?? undefined} label={frac !== null ? `${jobTitle(j)}: ${Math.round(frac * 100)}% done` : `${jobTitle(j)}: working`} />}
          </Row>
        );
      })}
    </Rows>
  );
}
