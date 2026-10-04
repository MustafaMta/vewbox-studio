'use client';

import { useState } from 'react';
import type { EngineHealth, EngineStatus } from '@/studio/api';
import { useLive, useReliability } from '@/studio/org';
import { Button, ErrorState, PanelCard, Skeleton, StateWord, TabBar, TabPanel } from '@/components/ui/kit';
import { EmptyLine, Row, Rows, RowsSkeleton, Section, SectionHeadSkeleton } from '@/components/studio/parts';
import { duration, failureWords, jobWords, percent, plural, shortWhen, spanWords } from '@/components/studio/model';
import type { Health } from '@/components/studio/Company';

/** THE ENGINE ROOM (docs/DESIGN-SYSTEM-V5.md §7.2, §8.13; the shell's "Engine offline" links here) — what the studio
 *  runs on and how it ran: each engine as /api/status reports it right now (offline is said plainly, with the engine's
 *  own words), the intake state from /api/health, then the record behind tabs: reliability and failure classes
 *  (/api/studio/org/reliability), the model files (/api/registry, read only) and job timings (/api/metrics). */

interface RegistryModel { name: string; kind: string; license: string; local: boolean; status: string; bytes?: number | null; metadata?: { group?: string; purpose?: string } | null }
interface Registry { models: RegistryModel[]; workflows: Array<{ name: string; version: string }> }
interface Metrics { hours: number; jobs: Array<{ type: string; completed: number; failed: number; cancelled: number; running: number; meanAttempts: number; p50Ms: number | null }> }

const ENGINES: Array<{ key: keyof Omit<EngineStatus, 'gpu' | 'minimaxConfigured'>; name: string; does: string }> = [
  { key: 'video', name: 'Video', does: 'Films each take' },
  { key: 'images', name: 'Pictures', does: 'Draws characters, plates and frames' },
  { key: 'story', name: 'Story', does: 'Writes ideas, stories and scripts' },
  { key: 'voice', name: 'Voices', does: 'Speaks the dialogue' },
  { key: 'transcription', name: 'Transcription', does: 'Hears lines back and times subtitles' },
  { key: 'music', name: 'Music', does: 'Makes songs' },
];
const STATUS_WORDS: Record<string, string> = { PRESENT: 'present', MISSING: 'not downloaded', CONFIGURED: 'key set', NO_KEY: 'needs a key', SERVICE: 'a service', UNKNOWN: 'not checked' };

export function EngineRoom({ health }: { health: Health | null }) {
  const { data: engines, error, reload } = useLive<EngineStatus>('/api/status');
  const { data: rel } = useReliability(24 * 7);
  const { data: reg } = useLive<Registry>('/api/registry');
  const { data: met } = useLive<Metrics>('/api/metrics?hours=168');
  const [tab, setTab] = useState('reliability');
  const offline = engines ? ENGINES.filter((e) => engines[e.key] && !engines[e.key].ok).length : 0;
  const since = shortWhen(health?.intake?.since);
  return (
    <Section id="engine-room" title="Engine room" description="What the studio runs on right now, and how it ran. An engine that is offline is said plainly; work that needs it waits or fails with the reason."
      action={<Button size="sm" onClick={reload}>Check again</Button>}>
      {health?.intake?.paused && (
        <div className="card ctl-intake" role="status">
          <StateWord tone="idle">Intake paused</StateWord>
          <span className="t-meta">{since ? `Since ${since}` : 'Paused'}{health.intake.reason ? <> · <span dir="auto">{health.intake.reason}</span></> : null}</span>
        </div>
      )}
      {error && !engines ? <ErrorState title="The engines could not be asked" action={<Button size="sm" onClick={reload}>Try again</Button>} details={error}>The status check did not answer; the engines may still be fine.</ErrorState> : (
        <ul className="ctl-engines" role="list" aria-busy={!engines || undefined} aria-label={engines ? `${ENGINES.length - offline} of ${ENGINES.length} engines ready` : 'Engines'}>
          {ENGINES.map((e) => <li key={e.key}><EngineCard name={e.name} does={e.does} row={engines ? engines[e.key] : undefined} loading={!engines} /></li>)}
        </ul>
      )}
      {!engines ? <p className="t-meta ctl-gpu"><Skeleton.Line width="16rem" /></p> : engines.gpu?.device && <p className="t-meta ctl-gpu">Graphics card: <span dir="ltr">{engines.gpu.device.split(':').slice(0, 2).join(':').trim()}</span>{engines.gpu.vramFree && engines.gpu.vramTotal ? ` · ${Math.round(engines.gpu.vramFree / 1073741824)} of ${Math.round(engines.gpu.vramTotal / 1073741824)} GB free` : ''}</p>}

      <TabBar ariaLabel="The engine record" idBase="er" current={tab} onSelect={setTab} className="ctl-er-tabs"
        tabs={[{ id: 'reliability', label: 'Reliability' }, { id: 'failures', label: 'Failure classes', count: rel?.failureClasses.length }, { id: 'models', label: 'Models', count: reg ? groupsOf(reg.models).length : undefined }, { id: 'timings', label: 'Job timings', count: met?.jobs.length }]} />
      <TabPanel idBase="er" id="reliability" current={tab} className="cp-tabpanel">
        {!rel ? <div className="pcard"><Skeleton.Text lines={3} /></div> : (
          <PanelCard columns={3} className="ctl-rel" facts={[
            { label: 'First attempt succeeded', value: percent(rel.firstAttemptTechnical.ok, rel.firstAttemptTechnical.total) ?? '—', sub: `${rel.firstAttemptTechnical.ok} of ${rel.firstAttemptTechnical.total} runs` },
            { label: 'Takes accepted the first time', value: percent(rel.firstAttemptCreative.accepted, rel.firstAttemptCreative.total) ?? '—', sub: `${rel.firstAttemptCreative.accepted} of ${rel.firstAttemptCreative.total} takes` },
            { label: 'Jobs retried', value: percent(rel.retryRate.retried, rel.retryRate.jobs) ?? '—', sub: `${rel.retryRate.retried} of ${rel.retryRate.jobs} jobs` },
            { label: 'Rejected by quality checks', value: percent(rel.qa.rejected, rel.qa.reports) ?? '—', sub: `${rel.qa.rejected} of ${rel.qa.reports} reports${rel.qa.review ? ` · ${rel.qa.review} for review` : ''}` },
            { label: 'Exports that passed', value: percent(rel.exports.ok, rel.exports.total) ?? '—', sub: `${rel.exports.ok} of ${rel.exports.total} exports` },
            { label: 'Time per accepted take', value: duration(rel.perAcceptedShot.meanMsPerAccepted) ?? '—', sub: rel.perAcceptedShot.meanAttemptsPerAccepted ? `${rel.perAcceptedShot.meanAttemptsPerAccepted.toFixed(2)} attempts each` : `${rel.perAcceptedShot.acceptedTakes} accepted takes` },
          ]} />
        )}
        {rel && <p className="t-meta ctl-span">Counted over {spanWords(rel.hours)}.</p>}
      </TabPanel>
      <TabPanel idBase="er" id="failures" current={tab} className="cp-tabpanel">
        {!rel ? <RowsSkeleton n={3} /> : rel.failureClasses.length === 0 ? <EmptyLine>Nothing failed in {spanWords(rel.hours)}.</EmptyLine> : (
          <>
            <Rows label="Failure classes">
              {rel.failureClasses.map((c) => <Row key={c.failureClass} start={<StateWord tone={c.resolved >= c.count ? 'done' : 'failed'}>{c.resolved >= c.count ? 'Resolved' : 'Open'}</StateWord>} title={<span title={c.failureClass}>{failureWords(c.failureClass)}</span>} meta={`${c.count} ${plural(c.count, 'failure')} · ${c.resolved} resolved`} />)}
            </Rows>
            {rel.openEvents.length > 0 && (
              <>
                <p className="t-label ctl-sub">Latest failures</p>
                <Rows label="Latest failures">
                  {rel.openEvents.slice(0, 6).map((e) => (
                    <Row key={e.id} start={<StateWord tone={e.resolved ? 'done' : 'failed'}>{failureWords(e.failureClass)}</StateWord>} title={jobWords(e.jobType)}
                      meta={<span className="t-facts"><span>attempt {e.attempt}</span>{e.changeMade && <span dir="auto">{e.changeMade}</span>}</span>} end={<span className="t-ro cp-time">{shortWhen(e.createdAt)}</span>}>
                      {e.failureMessage && <span className="t-meta cp-row-err" dir="auto">{e.failureMessage.slice(0, 240)}</span>}
                    </Row>
                  ))}
                </Rows>
              </>
            )}
          </>
        )}
      </TabPanel>
      <TabPanel idBase="er" id="models" current={tab} className="cp-tabpanel">
        {!reg ? <RowsSkeleton n={4} /> : <Models reg={reg} />}
      </TabPanel>
      <TabPanel idBase="er" id="timings" current={tab} className="cp-tabpanel">
        {!met ? <RowsSkeleton n={4} /> : met.jobs.length === 0 ? <EmptyLine>No job ran in {spanWords(met.hours)}.</EmptyLine> : (
          <Rows label="Job timings">
            {met.jobs.map((j) => <Row key={j.type} title={jobWords(j.type)} meta={<span className="t-facts"><span>{j.completed} finished</span>{j.failed > 0 && <span className="co-bad">{j.failed} failed</span>}{j.cancelled > 0 && <span>{j.cancelled} cancelled</span>}<span>{j.meanAttempts.toFixed(2)} attempts each</span></span>} end={<span className="t-ro cp-time">{duration(j.p50Ms) ? `median ${duration(j.p50Ms)}` : '—'}</span>} />)}
          </Rows>
        )}
      </TabPanel>
    </Section>
  );
}


function EngineCard({ name, does, row, loading }: { name: string; does: string; row?: EngineHealth; loading: boolean }) {
  return (
    <article className="card ctl-engine" data-ok={row ? String(row.ok) : undefined} aria-busy={loading || undefined}>
      <span className="ctl-engine-top"><span className="t-card">{name}</span>{loading ? <Skeleton.Line width="4rem" /> : row ? <StateWord tone={row.ok ? 'done' : 'failed'}>{row.ok ? 'Ready' : 'Offline'}</StateWord> : <StateWord tone="idle">Not reported</StateWord>}</span>
      <span className="t-body ctl-engine-does">{does}</span>
      <span className="t-meta ctl-engine-detail" dir="auto" title={row?.detail}>{loading ? <Skeleton.Line width="80%" /> : row ? [row.where === 'hosted' ? 'Hosted' : row.where === 'local' ? 'On this machine' : null, row.model, row.detail].filter(Boolean).join(' · ') : 'The status check did not mention it.'}</span>
    </article>
  );
}

/** The model files grouped as the registry groups them (one row per group: what it is for, its licence, whether its
 *  files are present). */
function groupsOf(models: RegistryModel[]) {
  const m = new Map<string, RegistryModel[]>();
  for (const x of models) { const g = x.metadata?.group ?? x.name; m.set(g, [...(m.get(g) ?? []), x]); }
  return Array.from(m, ([group, xs]) => ({ group, xs }));
}
function Models({ reg }: { reg: Registry }) {
  const groups = groupsOf(reg.models);
  const [all, setAll] = useState(false);
  const shown = all ? groups : groups.slice(0, 8);
  return (
    <>
      <Rows label="Models">
        {shown.map(({ group, xs }) => {
          const statuses = Array.from(new Set(xs.map((x) => x.status)));
          const ok = statuses.every((s) => s === 'PRESENT' || s === 'SERVICE' || s === 'CONFIGURED');
          const bytes = xs.reduce((n, x) => n + (x.bytes ?? 0), 0);
          return (
            <Row key={group} start={<StateWord tone={ok ? 'done' : statuses.includes('MISSING') ? 'failed' : 'idle'}>{statuses.map((s) => STATUS_WORDS[s] ?? s.toLowerCase()).join(', ').replace(/^./, (c) => c.toUpperCase())}</StateWord>}
              title={<span className="t-ro t-ro-md">{group}</span>}
              meta={<span className="t-facts"><span>{xs[0].kind.charAt(0) + xs[0].kind.slice(1).toLowerCase().replace(/_/g, ' ')}</span><span>{xs.length} {plural(xs.length, 'file')}</span>{bytes > 0 && <span>{(bytes / 1073741824).toFixed(1)} GB</span>}<span>{xs[0].license}</span>{xs[0].metadata?.purpose && <span>{xs[0].metadata.purpose}</span>}</span>} />
          );
        })}
      </Rows>
      {groups.length > 8 && <Button size="sm" variant="quiet" className="cp-more" onClick={() => setAll((v) => !v)}>{all ? 'Show fewer' : `Show all ${groups.length}`}</Button>}
      <p className="t-meta ctl-span">{reg.models.length} model files and {reg.workflows.length} workflows on record.</p>
    </>
  );
}

export function EngineRoomSkeleton() {
  return (
    <div className="cp-section">
      <SectionHeadSkeleton width="9rem" />
      <div className="ctl-engines">{ENGINES.map((e) => <div key={e.key} className="card ctl-engine"><Skeleton.Line width="40%" /><Skeleton.Line width="70%" /><Skeleton.Line width="85%" /></div>)}</div>
    </div>
  );
}
