'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Job, JobEvent } from '@/domain/jobs';
import { api } from '@/studio/api';
import { approveStage, useLive } from '@/studio/org';
import { approvalSubjectHash, isGatedStage } from '@/domain/approvals';
import { useStudio } from '@/studio/store';
import { artVars } from '@/studio/presentation';
import { useShell } from '@/components/shell/context';
import type { Decision } from '@/components/shell/decisions';
import { decisionCard, type DecisionCard as CardModel } from '@/components/home/model';
import { Frame } from '@/components/media/Frame';
import { ContentName, DecisionCard } from '@/components/media/Cards';
import { Button, Drawer, FilterChips, PanelCard, Skeleton, StateWord } from '@/components/ui/kit';
import { RetryControl } from '@/components/ui/jobs';
import { useToast } from '@/components/ui/toast';
import { EmptyLine, PageHead, Row, Rows, Section, useNow } from '@/components/studio/parts';
import { shortWhen } from '@/components/studio/model';
import type { Health } from '@/components/studio/Company';
import { RunningNow } from './Running';
import { EngineRoom } from './EngineRoom';
import { ControlRoomSkeleton } from './skeletons';
import { HISTORY_FILTERS, clock, elapsedMs, history, historyCounts, jobOutcome, jobTitle, subjectOf, type HistoryFilter } from './model';

/** THE PRODUCTION CONTROL ROOM (docs/DESIGN-SYSTEM-V5.md §8.13, §6.7; VISUAL-STANDARD-V5.1 §5.7, §5.21) — in the order
 *  the producer needs it: the decisions that wait, each with the media to decide on (the shared `decisions`, so the
 *  count is the sidebar's); then what runs now, with real progress and Cancel; then the record behind a filter, each
 *  job opening into its log; then the engine room (engines, models, reliability, failure classes). `?job=` opens a
 *  job's log (the old /jobs?job= lands here). */
export function ControlRoom() {
  const { ready } = useStudio();
  const { data: health } = useLive<Health>('/api/health');
  if (!ready) return <ControlRoomSkeleton />;
  return (
    <div className="cp control">
      <PageHead title="Production" lead="What waits for your decision, what the studio is making now, and everything it has made." />
      <NeedsYou />
      <Section id="running" title="Running now"><RunningNow paused={Boolean(health?.intake?.paused)} /></Section>
      <History />
      <EngineRoom health={health} />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------ needs you

function NeedsYou() {
  const { decisions } = useShell();
  const { state } = useStudio();
  const cards = useMemo(() => decisions.items.map((d) => ({ d, card: decisionCard(d, state) })), [decisions, state]);
  return (
    <Section id="needs-you" title="Needs you" count={decisions.count} countTone={decisions.count ? 'wait' : undefined}
      description={decisions.count ? 'Each decision with what you decide on. Nothing past these steps moves until you choose.' : undefined}>
      {cards.length === 0 ? <EmptyLine>Nothing waits for you.{decisions.complete ? '' : ' The pipeline has not answered yet, so approvals may still appear.'}</EmptyLine> : (
        <ul className="ctl-decisions" role="list" style={{ '--n': cards.length } as CSSProperties}>
          {cards.map(({ d, card }, i) => (
            <li key={d.id}>{d.kind === 'stage' ? <GateCard d={d} card={card} priority={i < 4} /> : (
              <DecisionCard href={card.href} kind={card.kindLabel} title={card.heading} titleLang={card.headingIsContent && /[؀-ۿ]/.test(card.heading) ? 'ar' : undefined}
                description={card.body} verb={card.action} chip={card.chip} figure={card.picture?.figure} asset={card.picture?.asset} src={card.picture?.src}
                art={artVars(card.picture?.asset)} priority={i < 4} className="ctl-dcard" />
            )}</li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** A pipeline gate (Story, the cut) is decided here, on its card: the production's frame, what waits, and the two
 *  answers. The card has the decision card's anatomy; the verbs are buttons, not one link. */
function GateCard({ d, card, priority }: { d: Decision; card: CardModel; priority?: boolean }) {
  const toast = useToast();
  const { refresh, state } = useStudio();
  const [busy, setBusy] = useState<null | 'APPROVED' | 'CHANGES'>(null);
  const p = d.subject.productionId; const stage = d.subject.stage;
  const decide = async (decision: 'APPROVED' | 'CHANGES') => {
    if (!p || !stage) return;
    setBusy(decision);
    // bound approval: the hash of what this page shows; the server refuses (409) when the subject changed meanwhile
    const prod = state.productions.find((x) => x.id === p);
    const body = { stage, decision, by: 'producer', ...(prod && isGatedStage(stage) ? { subjectHash: approvalSubjectHash(prod, stage) } : {}) };
    try { await approveStage(p, body); toast.ok(decision === 'APPROVED' ? 'Approved. The studio goes on.' : 'Changes asked. The department will redo this step.'); void refresh(); }
    catch (e) { toast.bad(/409/.test((e as Error).message) ? 'It changed since this page showed it. Look at it again, then decide.' : (e as Error).message); void refresh(); }
    finally { setBusy(null); }
  };
  return (
    <article className="dcard ctl-dcard ctl-gate" aria-labelledby={`gate-${d.id}`}>
      <Frame asset={card.picture?.asset} src={card.picture?.src} ratio="16/9" fit="cover" alt={card.picture?.alt ?? ''} title={d.title} radius="none" priority={priority} art={artVars(card.picture?.asset)} className="dcard-media" />
      <span className="dcard-body">
        <span className="dcard-kind t-label"><span className="dcard-dot" aria-hidden />{card.kindLabel}</span>
        <span id={`gate-${d.id}`}><ContentName className="t-card dcard-title">{card.heading}</ContentName></span>
        <span className="dcard-desc t-body">{card.body}</span>
        <span className="ctl-gate-acts">
          <Button size="sm" loading={busy === 'APPROVED'} disabled={busy !== null} onClick={() => void decide('APPROVED')}>Approve</Button>
          <Button size="sm" variant="quiet" loading={busy === 'CHANGES'} disabled={busy !== null} onClick={() => void decide('CHANGES')}>Ask for changes</Button>
        </span>
      </span>
    </article>
  );
}

// -------------------------------------------------------------------------------------------------------- history

function History() {
  const { jobs, state } = useStudio();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const openId = sp.get('job');
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [limit, setLimit] = useState(12);
  const counts = useMemo(() => historyCounts(jobs), [jobs]);
  const list = useMemo(() => history(jobs, filter), [jobs, filter]);
  const open = openId ? jobs.find((j) => j.id === openId) ?? null : null;
  const setOpen = (id: string | null) => router.replace(id ? `${pathname}?job=${encodeURIComponent(id)}` : pathname, { scroll: false });
  // a link to one job (from an agent's runs, or the old /jobs?job=) lands on the history with the job open
  useEffect(() => { if (openId) document.getElementById('history')?.scrollIntoView({ block: 'start' }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Section id="history" title="History" count={counts.all} description="Every job the studio finished, stopped or parked for review, newest first.">
      {/* the old /jobs address lands on #activity (src/components/shell/redirects.ts) */}
      <span id="activity" className="ctl-anchor" aria-hidden />
      <div className="ctl-filter">
        <FilterChips label="Show" value={filter === 'all' ? [] : [filter]} onChange={(v) => { setFilter((v[0] as HistoryFilter | undefined) ?? 'all'); setLimit(12); }}
          options={HISTORY_FILTERS.filter((f) => f.value !== 'all').map((f) => ({ value: f.value, label: f.label, count: counts[f.value], disabled: counts[f.value] === 0, reason: 'Nothing in the record' }))} />
      </div>
      {list.length === 0 ? <EmptyLine>{filter === 'all' ? 'The studio has not finished a job yet.' : 'No job in the record matches this filter.'}</EmptyLine> : (
        <>
          <Rows label="History">
            {list.slice(0, limit).map((j) => {
              const o = jobOutcome(j); const subject = subjectOf(j, state); const ms = elapsedMs(j, Date.now());
              return (
                <Row key={j.id} start={<StateWord tone={o.tone}>{o.words}</StateWord>}
                  title={<>{jobTitle(j)}{subject && <> · {subject.href ? <Link href={subject.href} className="cp-link"><bdi lang={subject.lang}>{subject.label}</bdi></Link> : <bdi lang={subject.lang}>{subject.label}</bdi>}</>}</>}
                  meta={<span className="t-facts">{j.attempts > 1 && <span>attempt {j.attempts} of {j.maxAttempts}</span>}{ms !== null && j.finishedAt && <span>took {clock(ms)}</span>}{j.status === 'FAILED' && j.error && <span className="co-bad" dir="auto">{j.error.message.slice(0, 120)}</span>}</span>}
                  end={<><span className="t-ro cp-time">{shortWhen(j.finishedAt ?? j.updatedAt ?? j.createdAt)}</span><Button size="sm" variant="quiet" aria-haspopup="dialog" onClick={() => setOpen(j.id)}>Details</Button></>} />
              );
            })}
          </Rows>
          {list.length > limit && <Button size="sm" variant="quiet" className="cp-more" onClick={() => setLimit((n) => n + 24)}>Show more · {list.length - limit} older</Button>}
        </>
      )}
      <Drawer open={Boolean(open)} onClose={() => setOpen(null)} title={open ? jobTitle(open) : 'Job'} description={open ? subjectOf(open, state)?.label : undefined} size="md">
        {open && <JobLog job={open} />}
      </Drawer>
    </Section>
  );
}

/** One job's record: its state and times, its error in the engine's own words, what it made, and its log. */
function JobLog({ job }: { job: Job }) {
  const [events, setEvents] = useState<JobEvent[] | null>(null);
  const now = useNow(!job.finishedAt);
  useEffect(() => { let on = true; setEvents(null); api.job(job.id).then((r) => { if (on) setEvents(r.events); }).catch(() => { if (on) setEvents([]); }); return () => { on = false; }; }, [job.id, job.status, job.progress?.phase, job.attempts]);
  const o = jobOutcome(job);
  const ms = elapsedMs(job, now);
  const made = (job.result?.assetId ?? job.result?.cutAssetId ?? job.result?.exportAssetId ?? job.result?.portraitAssetId ?? job.result?.openingFrameAssetId) as string | undefined;
  return (
    <div className="ctl-log">
      <PanelCard columns={2} facts={[
        { label: 'State', value: <StateWord tone={o.tone}>{o.words}</StateWord> },
        { label: 'Attempts', value: `${job.attempts} of ${job.maxAttempts}` },
        { label: 'Started', value: shortWhen(job.startedAt ?? job.createdAt) ?? '—' },
        { label: job.finishedAt ? 'Took' : 'Running for', value: ms !== null ? <span className="t-ro t-ro-md">{clock(ms)}</span> : '—' },
      ]} />
      {job.error && (
        <div className="ctl-error">
          <p className="t-title">{job.status === 'FAILED' ? 'Why it failed' : 'The last error'}</p>
          <p className="t-ro ctl-well" dir="auto">{job.error.code}: {job.error.message}</p>
        </div>
      )}
      <div className="ctl-log-acts">
        {made && <Link href={`/assets?asset=${encodeURIComponent(made)}`} className="btn btn-secondary btn-sm">Open what it made</Link>}
        {(job.status === 'FAILED' || job.status === 'CANCELLED') && <RetryControl job={job} size="sm" />}
      </div>
      <p className="t-label ctl-log-h">Log</p>
      {events === null ? <div aria-busy className="ctl-events"><Skeleton.Text lines={4} /></div> : events.length === 0 ? <p className="t-body">No log lines were recorded.</p> : (
        <ol className="ctl-events">
          {events.map((e) => <li key={e.id} data-level={e.level}><span className="t-ro">{new Date(e.at).toLocaleTimeString('en-GB')}</span><span className="t-body" dir="auto">{e.message}</span></li>)}
        </ol>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------- skeleton

/** Production's skeleton lives in ./skeletons (drawn synchronously by the shell); re-exported for the page. */
export { ControlRoomSkeleton };
