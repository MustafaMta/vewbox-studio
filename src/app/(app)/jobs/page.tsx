'use client';

import Link from 'next/link';
import { redirect, usePathname, useSearchParams } from 'next/navigation';
import { jobsTarget } from '@/components/shell/redirects';
import { useEffect, useMemo, useState } from 'react';
import type { Job, JobEvent } from '@/domain/jobs';
import { JOB_LABELS, isActiveStatus, isTerminalStatus } from '@/domain/jobs';
import { useStudio } from '@/studio/store';
import { api } from '@/studio/api';
import { productionHref } from '@/studio/selectors';
import { T } from '@/lib/copy';
import { PageHeader } from '@/components/ui/page';
import { Button, Details, KV, Segmented, Status, cls } from '@/components/ui/kit';
import { Empty } from '@/components/ui/cinema';
import { IconClose } from '@/components/ui/icons';
import { RetryControl } from '@/components/ui/jobs';
import { fmtAgo, fmtSeconds } from '@/lib/format';

/** /jobs → /production#activity (docs/DESIGN-SYSTEM-V4.md §7.2; F4's one-time change to this P3 file). The activity
 *  list below still lives here because the Production page renders this module's default export inside itself; at
 *  /jobs the same export redirects. P3 moves the list into components/production/Activity.tsx and makes this file a
 *  plain server redirect (src/components/shell/redirects.ts `jobsTarget`). */
export default function JobsPage() {
  const pathname = usePathname();
  const sp = useSearchParams();
  if (pathname === '/jobs') redirect(jobsTarget(sp.get('job')));
  return <section id="activity"><Activity /></section>;
}

/** ACTIVITY — every job the studio runs, newest first; one opens into its log. Progress is what the worker reports,
 *  no more: a phase, a step count where there is one, a percentage only when it is real. */
function Activity() {
  const { jobs, state, cancelJob } = useStudio();
  const sp = useSearchParams();
  const pathname = usePathname();
  const selectedId = sp.get('job');
  const [filter, setFilter] = useState<'all' | 'active' | 'failed'>('all');
  const list = useMemo(() => jobs.filter((j) => filter === 'all' || (filter === 'active' ? !isTerminalStatus(j.status) : j.status === 'FAILED')), [jobs, filter]);
  const counts = { active: jobs.filter((j) => isActiveStatus(j.status)).length, queued: jobs.filter((j) => j.status === 'QUEUED').length, failed: jobs.filter((j) => j.status === 'FAILED').length };
  const nameOf = (j: Job) => {
    const p = j.productionId ? state.productions.find((x) => x.id === j.productionId) : undefined;
    const c = j.characterId ? state.characters.find((x) => x.id === j.characterId) : undefined;
    const l = j.locationId ? state.locations.find((x) => x.id === j.locationId) : undefined;
    const sh = p && j.shotId ? p.shots.find((x) => x.id === j.shotId) : undefined;
    const sc = sh ? p!.scenes.find((x) => x.id === sh.sceneId) : undefined;
    const label = p ? `${p.title}${sh ? ` · ${T('label.shot')} ${sc?.number ?? '?'}.${sh.number}` : ''}` : c ? c.name : l ? l.name : '';
    const href = p ? (sh ? `${productionHref(p)}/shots/${sh.id}` : productionHref(p)) : c ? `/characters/${c.id}` : l ? `/locations/${l.id}` : undefined;
    return { label, href };
  };
  return (
    <div className="space-y-8">
      <PageHeader title={T('jobs.title')} subtitle={T('jobs.lead')} className={pathname === '/jobs' ? undefined : 'mb-4'} action={<Segmented label={T('label.status')} value={filter} onChange={setFilter} options={[{ value: 'all', label: T('jobs.filter.all') }, { value: 'active', label: `${T('jobs.filter.active')}${counts.active + counts.queued ? ` ${counts.active + counts.queued}` : ''}` }, { value: 'failed', label: `${T('jobs.filter.failed')}${counts.failed ? ` ${counts.failed}` : ''}` }]} />} />
      <p className="text-sm text-muted">{T('jobs.queue')}: <span className="num font-medium text-fg">{counts.active}</span> {T('jobs.running')} · <span className="num font-medium text-fg">{counts.queued}</span> {T('jobs.waiting')}</p>
      {list.length === 0 ? <Empty title={T('jobs.empty')} hint={T('jobs.empty.hint')} /> : (
        <ol className="space-y-2">
          {list.map((j) => { const n = nameOf(j); const open = selectedId === j.id; return (
            <li key={j.id} className={cls('panel p-4', open && 'border-accent')}>
              <div className="flex flex-wrap items-center gap-3">
                <StatusOf job={j} />
                <span className="font-medium">{JOB_LABELS[j.type] ?? j.type}</span>
                {n.label && (n.href ? <Link href={n.href} className="truncate text-sm text-muted hover:text-fg" dir="auto">{n.label}</Link> : <span className="truncate text-sm text-muted" dir="auto">{n.label}</span>)}
                <span className="ms-auto text-xs text-faint">{fmtAgo(j.createdAt)}{j.attempts > 1 ? ` · ${T('jobs.attempt')} ${j.attempts}/${j.maxAttempts}` : ''}</span>
                {!isTerminalStatus(j.status) && <Button size="xs" variant="ghost" icon={<IconClose />} disabled={j.cancelRequested} onClick={() => void cancelJob(j.id)}>{j.cancelRequested ? T('jobs.cancelRequested') : T('jobs.cancel')}</Button>}
                {(j.status === 'FAILED' || j.status === 'CANCELLED') && <RetryControl job={j} />}
                <Link href={open ? pathname : `${pathname}?job=${j.id}`} scroll={false} className="text-xs font-medium text-accent-text hover:underline">{T('jobs.details')}</Link>
              </div>
              {(j.progress?.message || j.error) && <p className={cls('mt-2 text-sm', j.error && j.status === 'FAILED' ? 'text-bad' : 'text-muted')} dir="auto">{j.status === 'FAILED' && j.error ? j.error.message : j.progress?.message}{j.progress?.step && j.progress.total ? ` (${j.progress.step}/${j.progress.total})` : ''}</p>}
              {j.progress?.percent != null && j.progress.percent > 0 && j.progress.percent < 100 && !isTerminalStatus(j.status) && <div className="progress mt-2" role="progressbar" aria-valuenow={j.progress.percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${j.progress.percent}%` }} /></div>}
              {open && <JobDetail job={j} />}
            </li>
          ); })}
        </ol>
      )}
    </div>
  );
}

export function StatusOf({ job }: { job: Job }) {
  const map: Record<string, { tone: 'ok' | 'warn' | 'bad' | 'info' | 'neutral'; key: 'jobs.active' | 'jobs.queued' | 'jobs.done' | 'jobs.failed' | 'jobs.cancelled' | 'jobs.awaitingReview' }> = { QUEUED: { tone: 'neutral', key: 'jobs.queued' }, COMPLETED: { tone: 'ok', key: 'jobs.done' }, FAILED: { tone: 'bad', key: 'jobs.failed' }, CANCELLED: { tone: 'neutral', key: 'jobs.cancelled' }, AWAITING_REVIEW: { tone: 'warn', key: 'jobs.awaitingReview' } };
  const m = map[job.status] ?? { tone: 'info' as const, key: 'jobs.active' as const };
  return <Status tone={m.tone} live={isActiveStatus(job.status) && job.status !== 'QUEUED'}>{T(m.key)}</Status>;
}

function JobDetail({ job }: { job: Job }) {
  const [events, setEvents] = useState<JobEvent[]>([]);
  // the log is read when the panel opens and again when the job moves to another status or phase (the event stream
  // carries those with the row); its lines are written at those steps, so no timer is needed
  useEffect(() => { let on = true; api.job(job.id).then((r) => { if (on) setEvents(r.events); }).catch(() => {}); return () => { on = false; }; }, [job.id, job.status, job.progress?.phase, job.attempts]);
  const resultAsset = (job.result?.assetId ?? job.result?.cutAssetId ?? job.result?.exportAssetId ?? job.result?.portraitAssetId ?? job.result?.openingFrameAssetId) as string | undefined;
  return (
    <div className="mt-4 grid gap-4 border-t border-line pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <KV rows={[[T('label.status'), job.status], [T('jobs.started'), job.startedAt ? fmtAgo(job.startedAt) : '—'], [T('jobs.finished'), job.finishedAt ? fmtAgo(job.finishedAt) : '—'], [T('jobs.provider'), job.providerTaskId ?? '—'], ['Job', job.id], ...(typeof job.result?.ms === 'number' ? [[T('gen.time'), fmtSeconds(Math.round((job.result.ms as number) / 1000))] as [string, string]] : [])]} />
        {job.error && <div className="notice notice-bad mt-3 text-sm"><div><p className="font-medium">{T('jobs.error')}: {job.error.code}</p><p className="mt-0.5" dir="auto">{job.error.message}</p></div></div>}
        {resultAsset && <p className="mt-3 text-sm"><Link href={`/assets?asset=${resultAsset}`} className="font-medium text-accent-text hover:underline">{T('jobs.open')} →</Link></p>}
        {job.result && <Details summary={T('jobs.result')} className="mt-3"><pre className="max-h-64 overflow-auto rounded-lg bg-input p-3 text-[11px] leading-relaxed">{JSON.stringify(job.result, null, 2)}</pre></Details>}
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-muted">{T('jobs.events')}</p>
        {events.length === 0 ? <p className="text-sm text-faint">—</p> : (
          <ol className="max-h-80 space-y-1 overflow-auto text-[12px]">
            {events.map((e) => <li key={e.id} className={cls('flex gap-2', e.level === 'error' ? 'text-bad' : e.level === 'warn' ? 'text-warn' : 'text-body')}><span className="num flex-none text-faint">{new Date(e.at).toLocaleTimeString('en-GB')}</span><span className="min-w-0 break-words" dir="auto">{e.message}{e.data && Object.keys(e.data).length ? <span className="text-faint"> · {JSON.stringify(e.data).slice(0, 240)}</span> : null}</span></li>)}
          </ol>
        )}
      </div>
    </div>
  );
}
