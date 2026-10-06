'use client';

import { useState } from 'react';
import type { EngineHealth, EngineStatus } from '@/studio/api';
import { useLive, useReliability } from '@/studio/org';
import { Button, ErrorState, PanelCard, Skeleton, StateWord, TabBar, TabPanel } from '@/components/ui/kit';
import { EmptyLine, Row, Rows, RowsSkeleton, Section } from '@/components/studio/parts';
import { duration, failureWords, jobWords, percent, plural, shortWhen, spanWords } from '@/components/studio/model';
import type { Health } from '@/components/studio/Company';

/** THE ENGINE ROOM (docs/DESIGN-SYSTEM-V5.md §7.2, §8.13; the shell's "Engine offline" links here) — what the studio
 *  runs on and how it ran: each engine as /api/status reports it right now (offline is said plainly, with the engine's
 *  own words), the intake state from /api/health, then the record behind tabs: reliability and failure classes
 *  (/api/studio/org/reliability), the model files (/api/registry, read only) and job timings (/api/metrics). The GPU\n *  queue (who holds the card, who waits, what is loaded, the last unloads: /api/studio/gpu) and the recent commands\n *  (the command journal, no payloads: /api/studio/commands) are read only, as recorded. */

interface RegistryModel { name: string; kind: string; license: string; local: boolean; status: string; bytes?: number | null; metadata?: { group?: string; purpose?: string } | null }
interface Registry { models: RegistryModel[]; workflows: Array<{ name: string; version: string }> }
interface GpuStatus { resource: string; mode: 'db' | 'memory'; loaded: { family: string | null; since: string | null }; holders: Array<{ holder: string; family: string; jobId: string | null; process: string; requestedAt: string; grantedAt: string | null }>; waiting: Array<{ holder: string; family: string; jobId: string | null; process: string; requestedAt: string; position: number }>; unloads: Array<{ at: string; engine: string; from: string; to: string; ms: number; ok: boolean; jobId: string | null }>; at: string }
interface CommandEntry { id: number; at: string; sender: string; jobId: string | null; ok: boolean; studioVersion: number; commands: Array<{ name: string; touches: string[] }>; refused?: { failedAt: number; code: string; message: string }; replayed?: boolean }
interface Metrics { hours: number; jobs: Array<{ type: string; completed: number; failed: number; cancelled: number; running: number; meanAttempts: number; p50Ms: number | null }> }

const ENGINES: Array<{ key: keyof Omit<EngineStatus, 'gpu' | 'minimaxConfigured' | 'checks'>; name: string; does: string }> = [
  { key: 'video', name: 'Video · MiniMax H3', does: 'Films each take, picture and sound' },
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
  const { data: gpu } = useLive<GpuStatus>('/api/studio/gpu?unloads=20');
  const { data: cmds } = useLive<{ entries: CommandEntry[] }>('/api/studio/commands?limit=20');
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
      {/* the helpers the checks and the voices need: an offline one is named with its service's own reason, and the work
          that needs it says "not measured" (a check) or waits (a voice) — never a pass */}
      {engines?.checks && (
        <>
          <p className="t-label ctl-sub">Checks and voice helpers</p>
          <ul className="ctl-engines ctl-helpers" role="list" aria-label={`${Object.values(engines.checks).filter((c) => c.ok).length} of ${Object.keys(engines.checks).length} helpers ready`}>
            {Object.entries(engines.checks).map(([k, c]) => <li key={k}><EngineCard name={c.name} does={c.does} row={{ ok: c.ok, detail: c.detail, where: 'local' }} loading={false} /></li>)}
          </ul>
        </>
      )}
      <p className="t-meta ctl-span">Video by MiniMax H3, on this machine: the studio’s only video engine. <a className="link-quiet" href="/settings#licences">Licences</a></p>
      <GpuPanel engines={engines} gpu={gpu} />

      <TabBar ariaLabel="The engine record" idBase="er" current={tab} onSelect={setTab} className="ctl-er-tabs"
        tabs={[{ id: 'reliability', label: 'Reliability' }, { id: 'failures', label: 'Failure classes', count: rel?.failureClasses.length }, { id: 'commands', label: 'Recent commands', count: cmds?.entries.length }, { id: 'unloads', label: 'GPU unloads', count: gpu?.unloads.length }, { id: 'models', label: 'Models', count: reg ? groupsOf(reg.models).length : undefined }, { id: 'timings', label: 'Job timings', count: met?.jobs.length }]} />
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
      <TabPanel idBase="er" id="commands" current={tab} className="cp-tabpanel">{!cmds ? <RowsSkeleton n={4} /> : <CommandLog entries={cmds.entries} />}</TabPanel>
      <TabPanel idBase="er" id="unloads" current={tab} className="cp-tabpanel">{!gpu ? <RowsSkeleton n={3} /> : <Unloads gpu={gpu} />}</TabPanel>
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

/** "image" → "Pictures": the GPU families in the engine room's own words; an unknown family stays as recorded. */
const FAMILY: Record<string, string> = { image: 'Pictures', images: 'Pictures', video: 'Video', tts: 'Voices', voice: 'Voices', asr: 'Transcription', music: 'Music', llm: 'Story model' };
const family = (f: string | null | undefined) => (f ? FAMILY[f.toLowerCase()] ?? f : null);
const who = (h: { jobId: string | null; holder: string }) => (h.jobId ? `job ${h.jobId}` : h.holder);

/** The graphics card's queue as the lease table records it: what is loaded, who holds the card, who waits (in
 *  admission order). Idle is said as idle. */
function GpuPanel({ engines, gpu }: { engines: EngineStatus | null; gpu: GpuStatus | null }) {
  const device = engines?.gpu?.device ? engines.gpu.device.split(':').slice(0, 2).join(':').trim() : null;
  const free = engines?.gpu?.vramFree && engines.gpu.vramTotal ? `${Math.round(engines.gpu.vramFree / 1073741824)} of ${Math.round(engines.gpu.vramTotal / 1073741824)} GB free` : null;
  // while the lease table answers: the same panel with its lines held (no shift when the facts arrive)
  if (!gpu) return <div className="ctl-gpu-panel" aria-busy><PanelCard columns={3} facts={['Graphics card', 'Loaded', 'Queue'].map((label) => ({ label, value: <Skeleton.Line width="60%" />, sub: <Skeleton.Line width="40%" /> }))} /></div>;
  const idle = gpu.holders.length === 0 && gpu.waiting.length === 0;
  return (
    <div className="ctl-gpu-panel">
      <PanelCard columns={3} facts={[
        { label: 'Graphics card', value: device ? <span dir="ltr">{device}</span> : 'Not reported', sub: free ?? 'Free memory not reported' },
        { label: 'Loaded', value: family(gpu.loaded.family) ?? 'Nothing loaded', sub: gpu.loaded.since ? `since ${shortWhen(gpu.loaded.since)}` : 'No engine holds memory on the card' },
        { label: 'Queue', value: idle ? <StateWord tone="idle">Idle</StateWord> : <StateWord tone="running">{gpu.holders.length ? `In use · ${gpu.waiting.length} waiting` : `${gpu.waiting.length} waiting`}</StateWord>, sub: gpu.mode === 'memory' ? 'One queue per process (the shared queue is off)' : 'One queue for every process' },
      ]} />
      {!idle && (
        <Rows label="The graphics card's queue" className="ctl-gpu-rows">
          {gpu.holders.map((h) => <Row key={`h-${h.holder}`} start={<StateWord tone="running">Holds the card</StateWord>} title={<>{family(h.family)} · {who(h)}</>} meta={<span className="t-facts"><span>{h.process}</span>{h.grantedAt && <span>since {shortWhen(h.grantedAt)}</span>}</span>} />)}
          {gpu.waiting.map((w) => <Row key={`w-${w.holder}`} start={<StateWord tone="idle">{`Waiting · ${w.position}${w.position === 1 ? 'st' : w.position === 2 ? 'nd' : w.position === 3 ? 'rd' : 'th'}`}</StateWord>} title={<>{family(w.family)} · {who(w)}</>} meta={<span className="t-facts"><span>{w.process}</span><span>asked {shortWhen(w.requestedAt)}</span></span>} />)}
        </Rows>
      )}
    </div>
  );
}

/** The last engine unloads (one engine making room on the card for another). */
function Unloads({ gpu }: { gpu: GpuStatus }) {
  if (gpu.unloads.length === 0) return <EmptyLine>No engine has been unloaded from the card yet.</EmptyLine>;
  return (
    <Rows label="GPU unloads">
      {gpu.unloads.map((u, i) => (
        <Row key={`${u.at}-${i}`} start={<StateWord tone={u.ok ? 'done' : 'failed'}>{u.ok ? 'Unloaded' : 'Did not unload'}</StateWord>}
          title={<>{u.engine}: {family(u.from) ?? u.from} → {family(u.to) ?? u.to}</>}
          meta={<span className="t-facts"><span>{duration(u.ms) ?? `${u.ms} ms`}</span>{u.jobId && <span>for job {u.jobId}</span>}</span>}
          end={<span className="t-ro cp-time">{shortWhen(u.at)}</span>} />
      ))}
    </Rows>
  );
}

/** The command journal, newest first: who sent which commands to which records, and whether the batch was applied or
 *  refused (with the reason). No arguments are recorded here. */
function CommandLog({ entries }: { entries: CommandEntry[] }) {
  if (entries.length === 0) return <EmptyLine>No command is recorded yet.</EmptyLine>;
  const sender = (s: string) => (s.startsWith('page:') ? 'a page' : s === 'worker' ? 'the worker' : s === 'server' ? 'the server' : s);
  return (
    <Rows label="Recent commands">
      {entries.map((e) => {
        const touches = [...new Set(e.commands.flatMap((c) => c.touches.map((t) => t.split(':')[0])))];
        return (
          <Row key={e.id} start={<StateWord tone={e.ok ? 'done' : 'failed'}>{e.ok ? (e.replayed ? 'Replayed' : 'Applied') : 'Refused'}</StateWord>}
            title={<span className="t-ro t-ro-md">{e.commands.map((c) => c.name).join(', ') || '—'}</span>}
            meta={<span className="t-facts"><span>from {sender(e.sender)}</span>{touches.length > 0 && <span>{touches.join(', ')}</span>}<span>studio version {e.studioVersion}</span>{e.refused && <span className="co-bad" dir="auto">{e.refused.code}: {e.refused.message}</span>}</span>}
            end={<span className="t-ro cp-time">{shortWhen(e.at)}</span>} />
        );
      })}
    </Rows>
  );
}

/** The engine room's skeleton lives in ./skeletons (one card per engine above); re-exported for the page. */
export { EngineRoomSkeleton } from './skeletons';