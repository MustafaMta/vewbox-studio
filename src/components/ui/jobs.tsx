'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Job, JobPayload, JobType } from '@/domain/jobs';
import { JOB_LABELS, isActiveStatus } from '@/domain/jobs';
import { isStudioError } from '@/domain/errors';
import { useStudio } from '@/studio/store';
import { useT } from './locale';
import { useToast } from './toast';
import { Button, Spinner, Status, cls } from './kit';
import { IconGenerate, IconRetry, IconClose } from './icons';

/** WHERE GENERATION HAPPENS — a button that starts a real job. While a job for the same target is active it shows
 *  the job's phase instead of a second button; a failure shows the reason and a retry. Nothing here fakes progress:
 *  a percentage appears only when the worker reports one. */

export function useStartJob() {
  const { startJob, capabilities } = useStudio();
  const toast = useToast();
  const T = useT();
  const [busy, setBusy] = useState(false);
  const start = async <K extends JobType>(type: K, payload: JobPayload<K>, opts: { idempotencyKey?: string; quiet?: boolean } = {}): Promise<Job | null> => {
    setBusy(true);
    try {
      const job = await startJob(type, payload, { idempotencyKey: opts.idempotencyKey });
      if (!opts.quiet) toast.ok(T('gen.started'), { label: T('nav.production'), href: `/production?job=${job.id}` });
      return job;
    } catch (e) {
      toast.bad(`${T('gen.failed')}: ${isStudioError(e) ? e.message : (e as Error).message}`);
      return null;
    } finally { setBusy(false); }
  };
  return { start, busy, capabilities };
}

export function JobButton<K extends JobType>({ type, payload, children, icon, variant = 'secondary', size, className = '', target, idempotencyKey, confirm, disabled, title }: { type: K; payload: JobPayload<K>; children: ReactNode; icon?: ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'quiet'; size?: 'sm' | 'xs'; className?: string; target: { productionId?: string; shotId?: string; characterId?: string; locationId?: string }; idempotencyKey?: string; confirm?: string; disabled?: boolean; title?: string }) {
  const T = useT();
  const { jobs, cancelJob, retryJob } = useStudio();
  const { start, busy } = useStartJob();
  const mine = jobs.filter((j) => j.type === type && (!target.productionId || j.productionId === target.productionId) && (!target.shotId || j.shotId === target.shotId) && (!target.characterId || j.characterId === target.characterId) && (!target.locationId || j.locationId === target.locationId));
  const active = mine.find((j) => isActiveStatus(j.status));
  const last = mine.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (active) {
    return (
      <span className={cls('inline-flex max-w-full items-center gap-2', className)}>
        <Status tone="info" live className="max-w-[18rem] truncate" title={active.progress?.message}><Spinner className="me-1" />{active.progress?.message || T('jobs.inProgress')}{active.progress?.percent != null && active.progress.percent > 0 ? ` · ${active.progress.percent}%` : ''}{active.progress?.step && active.progress.total ? ` · ${active.progress.step}/${active.progress.total}` : ''}</Status>
        <Button size="xs" variant="ghost" icon={<IconClose />} aria-label={T('jobs.cancel')} title={T('jobs.cancel')} disabled={active.cancelRequested} onClick={() => void cancelJob(active.id)} />
      </span>
    );
  }
  const onClick = () => { if (confirm && !window.confirm(confirm)) return; void start(type, payload, { idempotencyKey }); };
  return (
    <span className={cls('inline-flex max-w-full flex-wrap items-center gap-2', className)}>
      <Button variant={variant} size={size} icon={icon ?? <IconGenerate />} onClick={onClick} loading={busy} disabled={disabled} title={title}>{children}</Button>
      {last?.status === 'FAILED' && <span className="inline-flex items-center gap-1.5 text-xs text-bad" title={last.error?.message}><span className="max-w-[16rem] truncate">{last.error?.message ?? T('jobs.failed')}</span><button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => void retryJob(last.id)}><IconRetry className="inline size-3" /> {T('jobs.retry')}</button></span>}
    </span>
  );
}

/** A compact line for a job anywhere: label, status dot, phase. */
export function JobLine({ job, link = true }: { job: Job; link?: boolean }) {
  const T = useT();
  const tone = job.status === 'COMPLETED' ? 'ok' : job.status === 'FAILED' ? 'bad' : job.status === 'CANCELLED' ? 'neutral' : job.status === 'AWAITING_REVIEW' ? 'warn' : 'info';
  const label = JOB_LABELS[job.type]?.[T.locale] ?? job.type;
  const body = <Status tone={tone} live={isActiveStatus(job.status)} title={job.progress?.message ?? job.error?.message}>{label}{job.progress?.message && isActiveStatus(job.status) ? ` · ${job.progress.message}` : ''}</Status>;
  return link ? <Link href={`/production?job=${job.id}`} className="hover:underline">{body}</Link> : body;
}

/** Surfaces the store's sync and command errors as toasts. Mounted once in the layout. */
export function SyncErrors() {
  const { lastError, clearError } = useStudio();
  const toast = useToast();
  const seen = useRef(0);
  useEffect(() => { if (lastError && lastError.id !== seen.current) { seen.current = lastError.id; toast.bad(lastError.message); clearError(); } }, [lastError, toast, clearError]);
  return null;
}
