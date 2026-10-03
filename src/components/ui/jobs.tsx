'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Job, JobPayload, JobType } from '@/domain/jobs';
import { isActiveStatus } from '@/domain/jobs';
import { isStudioError } from '@/domain/errors';
import { useStudio } from '@/studio/store';
import { retryNeedsChange } from '@/studio/retry';
import { useT } from './locale';
import { useToast } from './toast';
import { Button, Spinner, Status, cls, useConfirm } from './kit';
import { useErrorCopy } from './progress';
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
      // the server's preflight warnings (e.g. an identity not approved yet) are said, never dropped
      for (const w of job.warnings ?? []) toast.push({ tone: 'info', text: w.detail });
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
  const { jobs, cancelJob } = useStudio();
  const { start, busy } = useStartJob();
  const ask = useConfirm();
  const copyOf = useErrorCopy();
  const mine = jobs.filter((j) => j.type === type && (!target.productionId || j.productionId === target.productionId) && (!target.shotId || j.shotId === target.shotId) && (!target.characterId || j.characterId === target.characterId) && (!target.locationId || j.locationId === target.locationId));
  const active = mine.find((j) => isActiveStatus(j.status));
  const last = mine.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (active) {
    return (
      <span className={cls('inline-flex max-w-full items-center gap-2', className)}>
        <Status tone="info" live className="max-w-[18rem] truncate"><Spinner className="me-1" />{(active.progress?.phase && T.dyn(`jp.${active.progress.phase}`, '')) || T('jobs.inProgress')}{active.progress?.percent != null && active.progress.percent > 0 ? ` · ${active.progress.percent}%` : ''}{active.progress?.step && active.progress.total ? ` · ${active.progress.step}/${active.progress.total}` : ''}</Status>
        <Button size="xs" variant="ghost" icon={<IconClose />} aria-label={T('jobs.cancel')} title={T('jobs.cancel')} disabled={active.cancelRequested} onClick={() => void cancelJob(active.id)} />
      </span>
    );
  }
  // replacing work that exists asks first, in the kit's ConfirmDialog (never window.confirm, §1.5)
  const onClick = async () => {
    if (confirm && !(await ask({ title: confirm, confirmLabel: children, tone: 'danger' }))) return;
    void start(type, payload, { idempotencyKey });
  };
  // the failure in plain words; the engine's own message stays out of the product voice (§1.5, V4-06)
  const failedCopy = last?.status === 'FAILED' ? copyOf(last.error) : null;
  return (
    <span className={cls('inline-flex max-w-full flex-wrap items-center gap-2', className)}>
      <Button variant={variant} size={size} icon={icon ?? <IconGenerate />} onClick={() => void onClick()} loading={busy} disabled={disabled} title={title}>{children}</Button>
      {last && failedCopy && <span className="inline-flex max-w-full flex-wrap items-center gap-1.5 text-xs text-bad"><span className="max-w-[16rem] truncate">{failedCopy.title}</span><RetryControl job={last} size="xs" /></span>}
    </span>
  );
}

/** RETRY — one press for a transient failure; for any other failure the retry first asks, in a small inline field,
 *  what was corrected (the server refuses an unchanged retry and records the change on the reliability event). */
export function RetryControl({ job, size = 'xs', label }: { job: Job; size?: 'xs' | 'sm'; label?: ReactNode }) {
  const T = useT();
  const { retryJob } = useStudio();
  const needs = retryNeedsChange(job);
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => { if (asking) field.current?.focus(); }, [asking]);
  const go = async (change?: string) => {
    setBusy(true); setError(null);
    try { await retryJob(job.id, change); setAsking(false); setText(''); } catch (e) { setError(isStudioError(e) ? e.message : (e as Error).message); } finally { setBusy(false); }
  };
  if (!needs) return <Button size={size} variant="quiet" icon={<IconRetry />} loading={busy} onClick={() => void go()}>{label ?? T('jobs.retry')}</Button>;
  if (!asking) return <Button size={size} variant="quiet" icon={<IconRetry />} onClick={() => setAsking(true)}>{T('v3.retry.withChange')}</Button>;
  const id = `retry-${job.id}`;
  return (
    <form className="flex w-full max-w-[28rem] flex-col gap-1.5 text-start" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void go(text.trim()); }} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setAsking(false); } }}>
      <label htmlFor={id} className="text-[13px] font-medium text-body">{T('v3.retry.what')}</label>
      <span className="flex flex-wrap items-center gap-2">
        <input id={id} ref={field} className="input h-8 min-w-0 flex-1 text-[13px] leading-8" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder={T('v3.retry.placeholder')} aria-describedby={`${id}-hint`} dir="auto" />
        <Button type="submit" size="sm" disabled={!text.trim()} loading={busy}>{T('jobs.retry')}</Button>
        <Button size="sm" variant="quiet" onClick={() => setAsking(false)}>{T('btn.cancel')}</Button>
      </span>
      <span id={`${id}-hint`} className="text-xs text-faint">{T('v3.retry.hint')}</span>
      {error && <span role="alert" className="text-xs text-bad" dir="auto">{error}</span>}
    </form>
  );
}

/** Surfaces the store's sync and command errors as toasts. Mounted once in the layout. */
export function SyncErrors() {
  const { lastError, clearError } = useStudio();
  const toast = useToast();
  const seen = useRef(0);
  useEffect(() => { if (lastError && lastError.id !== seen.current) { seen.current = lastError.id; toast.bad(lastError.message); clearError(); } }, [lastError, toast, clearError]);
  return null;
}
