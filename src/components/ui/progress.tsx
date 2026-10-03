'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import type { Job, JobError, JobStatus } from '@/domain/jobs';
import type { StudioErrorCode } from '@/domain/errors';
import { isActiveStatus, isTerminalStatus } from '@/domain/jobs';
import { useT } from './locale';
import { Button, ErrorNotice, Spinner, cls, type Tone } from './kit';
import { IconBad, IconCheck, IconClose, IconOpen, IconRetry, IconSettings } from './icons';
import type { Key } from '@/lib/i18n';

/** PROGRESS, HONESTLY — a strip of production stages, and a panel for a long job that names the worker's real phase
 *  (Queued → Preparing → Generating → Validating → Saving), its message, the elapsed time, a bar only when a percent
 *  was reported, and on failure the plain reason with the one action that fixes it. Nothing here invents progress. */

/* ---- phase strip ------------------------------------------------------------------------------------------- */

export interface Phase { id: string; name: ReactNode; status: ReactNode; tone?: Tone; time?: ReactNode; title?: string }

/** Horizontal chips, min 7.5rem, a 3 px rule on the start edge in the state colour; only the chip waiting for a
 *  person gets the gold fill. */
export function PhaseStrip({ phases, label, className = '' }: { phases: Phase[]; label: string; className?: string }) {
  return (
    <ol className={cls('phase-strip', className)} aria-label={label}>
      {phases.map((p) => (
        <li key={p.id} className="phase" data-tone={p.tone ?? 'neutral'} title={p.title}>
          <span className="phase-name">{p.name}</span>
          <span className={cls('status !text-[11px]', `status-${p.tone ?? 'neutral'}`)}>{p.status}</span>
          {p.time && <span className="num text-faint">{p.time}</span>}
        </li>
      ))}
    </ol>
  );
}

/* ---- error copy -------------------------------------------------------------------------------------------- */

/** `consent`: the producer's consent statement for a recording (src/components/character/ConsentChoice.tsx) — a
 *  plain retry can never fix it, so nothing here offers one. `detail` is the engine's own message: it is shown only
 *  inside Details (docs/DESIGN-SYSTEM-V4.md §5.16, V4-06), never as the hint. */
export interface ErrorCopy { code: string; title: string; hint: string; detail?: string; fix: { label: string; kind: 'retry' | 'settings' | 'reference' | 'usage' | 'job' | 'fields' | 'consent' | 'none' } }

/** One code's plain words (title, why, the recovery's label) and its recovery kind. */
export interface ErrorEntry { title: Key; hint: Key; fix: Key; kind: ErrorCopy['fix']['kind'] }

/** Every StudioError code has its words and its one recovery (typed exhaustively: a new code that has none fails the
 *  type check instead of falling back to a generic Retry), plus CANCELLED, which jobs record. */
export const ERROR_COPY: Record<StudioErrorCode | 'CANCELLED', ErrorEntry> = {
  UNAVAILABLE: { title: 'err.UNAVAILABLE', hint: 'err.UNAVAILABLE.hint', fix: 'err.UNAVAILABLE.fix', kind: 'settings' },
  NOT_CONFIGURED: { title: 'err.NOT_CONFIGURED', hint: 'err.NOT_CONFIGURED.hint', fix: 'err.NOT_CONFIGURED.fix', kind: 'settings' },
  PROVIDER: { title: 'err.PROVIDER', hint: 'err.PROVIDER.hint', fix: 'err.PROVIDER.fix', kind: 'retry' },
  INVALID: { title: 'err.INVALID', hint: 'err.INVALID.hint', fix: 'err.INVALID.fix', kind: 'fields' },
  MISSING_REFERENCE: { title: 'err.MISSING_REFERENCE', hint: 'err.MISSING_REFERENCE.hint', fix: 'err.MISSING_REFERENCE.fix', kind: 'reference' },
  CONSENT_REQUIRED: { title: 'err.CONSENT_REQUIRED', hint: 'err.CONSENT_REQUIRED.hint', fix: 'err.CONSENT_REQUIRED.fix', kind: 'consent' },
  APPEARANCE_LOCKED: { title: 'err.LOCKED', hint: 'err.LOCKED.hint', fix: 'err.LOCKED.fix', kind: 'usage' },
  VOICE_LOCKED: { title: 'err.LOCKED', hint: 'err.LOCKED.hint', fix: 'err.LOCKED.fix', kind: 'usage' },
  ASSET_PROTECTED: { title: 'err.ASSET_PROTECTED', hint: 'err.ASSET_PROTECTED.hint', fix: 'err.LOCKED.fix', kind: 'usage' },
  CONFLICT: { title: 'err.CONFLICT', hint: 'err.CONFLICT.hint', fix: 'err.CONFLICT.fix', kind: 'job' },
  NOT_FOUND: { title: 'err.NOT_FOUND', hint: 'err.NOT_FOUND.hint', fix: 'err.NOT_FOUND.fix', kind: 'none' },
  CANCELLED: { title: 'err.CANCELLED', hint: 'err.CANCELLED.hint', fix: 'err.PROVIDER.fix', kind: 'retry' },
};

/** AUDIT D6 (docs/AUDIT-CODEBASE.md; DESIGN-SYSTEM-V4 §8.7): the table of known codes, typed by the StudioError
 *  union, so a code without words — CONSENT_REQUIRED and ASSET_PROTECTED were the two — fails `tsc` instead of
 *  falling back to a generic Retry. Same entries as ERROR_COPY (which adds CANCELLED). */
export const KNOWN: Record<StudioErrorCode, ErrorEntry> = ERROR_COPY;

const entryOf = (code: string): ErrorEntry | undefined => (ERROR_COPY as Record<string, ErrorEntry | undefined>)[code];

/** The StudioError code → plain words in the interface language and the one recovery action. An unknown code is
 *  "The step failed." with Retry. The engine's own message never becomes the words: it is `detail`, for Details. */
export function useErrorCopy() {
  const T = useT();
  return (err?: JobError | { code: string; message?: string } | null): ErrorCopy => {
    const code = err?.code ?? 'UNKNOWN';
    const k = entryOf(code);
    const detail = err?.message?.trim() || undefined;
    if (!k) return { code, title: T('err.unknown'), hint: T('kit.err.unknownHint'), detail, fix: { label: T('err.PROVIDER.fix'), kind: 'retry' } };
    return { code, title: T(k.title), hint: T(k.hint), detail, fix: { label: T(k.fix), kind: k.kind } };
  };
}

/** The one recovery control for a failure: Retry (your handler), Settings → Engines (a link), the job's page, or
 *  whatever the caller supplies for the reference / usage / fields / consent kinds. A consent failure without the
 *  caller's consent choice offers only the job, never a retry. */
export function RecoveryAction({ copy, onRetry, jobId, custom, size = 'sm' }: { copy: ErrorCopy; onRetry?: () => void; jobId?: string; custom?: Partial<Record<ErrorCopy['fix']['kind'], ReactNode>>; size?: 'sm' | 'xs' }) {
  const T = useT();
  const k = copy.fix.kind;
  if (custom?.[k]) return <>{custom[k]}</>;
  if (k === 'settings') return <span className="flex flex-wrap items-center gap-2"><Link href="/settings#engines" className={cls('btn btn-secondary', `btn-${size}`)}><IconSettings aria-hidden />{copy.fix.label}</Link>{onRetry && <Button size={size} variant="ghost" icon={<IconRetry />} onClick={onRetry}>{T('jobs.retry')}</Button>}</span>;
  if ((k === 'job' || k === 'consent') && jobId) return <Link href={`/production?job=${jobId}`} className={cls('btn btn-secondary', `btn-${size}`)}><IconOpen aria-hidden />{T('err.openJob')}</Link>;
  if (k === 'none' || k === 'consent') return null;
  return onRetry ? <Button size={size} variant="secondary" icon={<IconRetry />} onClick={onRetry}>{copy.fix.label}</Button> : null;
}

/* ---- job progress ------------------------------------------------------------------------------------------- */

export type RowState = 'pending' | 'current' | 'done' | 'failed' | 'skipped';
export interface ProgressRow { id: string; label: ReactNode; state: RowState; /** the engine's phrase, or the reason it was skipped / failed */ detail?: ReactNode; /** the one recovery control of a failed row */ action?: ReactNode }

const PHASES: Array<{ id: string; key: Key; statuses: JobStatus[] }> = [
  { id: 'QUEUED', key: 'jp.QUEUED', statuses: ['QUEUED'] },
  { id: 'PREPARING', key: 'jp.PREPARING', statuses: ['PREPARING'] },
  { id: 'GENERATING', key: 'jp.GENERATING', statuses: ['GENERATING', 'DOWNLOADING'] },
  { id: 'VALIDATING', key: 'jp.VALIDATING', statuses: ['VALIDATING', 'AWAITING_REVIEW'] },
  { id: 'POSTPROCESSING', key: 'jp.POSTPROCESSING', statuses: ['POSTPROCESSING'] },
];

/** The phases of one job as rows, from its real status (the worker's `progress.phase` wins when it names one). A
 *  failed row says what happened in plain words; the worker's and the engine's own messages stay out of the rows
 *  (they belong to Details, §5.16) — the step count is in the footer. */
export function phaseRows(job: Job | undefined, T: ReturnType<typeof useT>): ProgressRow[] {
  const phase = job ? (job.progress?.phase && PHASES.some((p) => p.id === job.progress!.phase) ? job.progress.phase : PHASES.find((p) => p.statuses.includes(job.status))?.id) : 'QUEUED';
  const idx = Math.max(0, PHASES.findIndex((p) => p.id === phase));
  const done = job?.status === 'COMPLETED';
  const failed = job?.status === 'FAILED' || job?.status === 'CANCELLED';
  return PHASES.map((p, i) => ({
    id: p.id, label: T(p.key),
    state: done ? 'done' : i < idx ? 'done' : i === idx ? (failed ? 'failed' : 'current') : 'pending',
    detail: i === idx && !done && failed ? T(entryOf(job?.status === 'CANCELLED' ? 'CANCELLED' : job?.error?.code ?? '')?.title ?? 'err.unknown') : undefined,
  }));
}

/** Seconds since the job started (or was created), ticking while it runs. */
export function useElapsed(job: Job | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  const active = Boolean(job && !isTerminalStatus(job.status));
  useEffect(() => { if (!active) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [active]);
  if (!job) return 0;
  const from = new Date(job.startedAt ?? job.createdAt).getTime();
  const to = job.finishedAt ? new Date(job.finishedAt).getTime() : now;
  return Math.max(0, Math.round((to - from) / 1000));
}

export const fmtElapsed = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`);

/** A panel for a long job: the result's shape as a skeleton on the start side (or the caller's preview), the phases
 *  as rows on the end side, the engine's message, the elapsed time, a bar only when a percent is known, Cancel. */
export function JobProgress({ job, rows, preview, shape = 'portrait', title, onCancel, cancelling, failure, className = '', children }: {
  job?: Job; /** rows of your own (a parent job's children); otherwise the job's phases */ rows?: ProgressRow[]; preview?: ReactNode; shape?: 'portrait' | 'wide' | 'square' | 'poster' | 'none'; title?: ReactNode;
  onCancel?: () => void; cancelling?: boolean; /** the failure block (copy + one action); rendered under the rows */ failure?: ReactNode; className?: string; children?: ReactNode;
}) {
  const T = useT();
  const elapsed = useElapsed(job);
  const list = rows ?? phaseRows(job, T);
  const active = !job || isActiveStatus(job.status);
  const pct = job?.progress?.percent;
  const stepText = job?.progress?.step && job.progress.total ? `${T('jp.step')} ${job.progress.step} ${T('misc.of')} ${job.progress.total}` : null;
  return (
    <section className={cls('card p-4 sm:p-5', className)} aria-busy={active || undefined} aria-live="polite">
      {title && <h2 className="section-title mb-4">{title}</h2>}
      <div className={cls('grid gap-5', shape !== 'none' && 'sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]')}>
        {shape !== 'none' && <div className="min-w-0">{preview ?? <div className={cls('skeleton', `skeleton-${shape}`)} aria-hidden />}</div>}
        <div className="min-w-0">
          <ol className="jp-rows" aria-label={T('jp.phases')}>
            {list.map((r) => (
              <li key={r.id} aria-current={r.state === 'current' ? 'step' : undefined} data-failed={r.state === 'failed' ? '' : undefined} data-skipped={r.state === 'skipped' ? '' : undefined}>
                <span aria-hidden className={cls('mt-0.5 grid size-6 place-items-center rounded-full border text-[11px] font-semibold', r.state === 'done' ? 'border-transparent bg-ok-soft text-ok' : r.state === 'failed' ? 'border-transparent bg-bad-soft text-bad' : r.state === 'current' ? 'border-transparent bg-primary text-on-primary' : r.state === 'skipped' ? 'border-dashed border-line-strong text-faint' : 'border-line-strong text-faint')}>
                  {r.state === 'done' ? <IconCheck className="size-3.5" /> : r.state === 'failed' ? <IconBad className="size-3.5" /> : r.state === 'current' ? <Spinner className="size-3" /> : r.state === 'skipped' ? '–' : ''}
                </span>
                <span className="min-w-0">
                  <span className={cls('block', r.state === 'current' && 'font-semibold')}>{r.label}<span className="sr-only">: {T(r.state === 'done' ? 'jp.done' : r.state === 'failed' ? 'jp.failed' : r.state === 'skipped' ? 'jp.skipped' : r.state === 'current' ? 'jobs.inProgress' : 'jobs.queued')}</span></span>
                  {r.detail && <span className={cls('mt-0.5 block text-[12.5px]', r.state === 'failed' ? 'text-bad' : 'text-muted')} dir="auto">{r.detail}</span>}
                  {r.action && <span className="mt-2 block">{r.action}</span>}
                </span>
              </li>
            ))}
          </ol>
          {typeof pct === 'number' && pct > 0 && pct < 100 && active && <div className="progress mt-4" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${pct}%` }} /></div>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-3 text-[12px] text-faint">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="num">{T('jp.elapsed')} {fmtElapsed(elapsed)}</span>{stepText && <span className="num">{stepText}</span>}</span>
            {onCancel && active && <Button size="xs" variant="ghost" icon={<IconClose />} onClick={onCancel} disabled={cancelling || job?.cancelRequested}>{job?.cancelRequested ? T('jobs.cancelRequested') : T('jobs.cancel')}</Button>}
          </div>
          {failure && <div className="mt-4">{failure}</div>}
          {children}
        </div>
      </div>
    </section>
  );
}

/** The failure block (the error notice anatomy, §5.16): what happened, why in plain words, the one recovery action
 *  (then the job), and the engine's own message only inside Details. */
export function FailureNotice({ copy, action, jobId, kept }: { copy: ErrorCopy; action?: ReactNode; jobId?: string; /** what is kept, said plainly */ kept?: ReactNode }) {
  const T = useT();
  return (
    <ErrorNotice title={copy.title} why={copy.hint} kept={kept} details={copy.detail}
      action={action} alternatives={jobId ? <Link href={`/production?job=${jobId}`} className="btn btn-quiet btn-sm">{T('err.openJob')}</Link> : undefined} />
  );
}
