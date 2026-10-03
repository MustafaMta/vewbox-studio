'use client';

import type { AgentStat, ReliabilitySummary } from '@/studio/org';
import { T, type TFn } from '@/lib/copy';
import { Status, cls, type Tone } from '@/components/ui/kit';
import { fmtAgo } from '@/lib/format';

/** THE COMPANY'S PEOPLE AND FIGURES — a person's monogram and run state, a failure class in words, and the
 *  reliability table. Every figure is read from persisted runs, reports and events; a figure with nothing behind it
 *  reads "—" beside its count, never a zero in a tile. */

export const fmtMs = (ms: number | null | undefined) => (ms === null || ms === undefined || !Number.isFinite(ms) ? '—' : ms < 1000 ? `${Math.round(ms)} ms` : ms < 120_000 ? `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s` : `${(ms / 60_000).toFixed(1)} min`);
export const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)} %` : '—');

/** Initials from a name, skipping joining words: "Casting Director" → CD, "Casting & Character Design" → CC. */
export const initials = (name: string) => name.split(/[\s&·-]+/).filter((w) => w && /\p{Lu}|\p{Lo}/u.test(w[0])).map((w) => w[0]).slice(0, 2).join('') || name.slice(0, 1);

/** A person's mark: initials in a circle on the field tone. The director's carries a 1.5 px ivory ring — rank by
 *  weight, not colour. */
export function Monogram({ name, size = 32, director, className = '' }: { name: string; size?: 28 | 32 | 40 | 56; director?: boolean; className?: string }) {
  return <span aria-hidden className={cls('monogram', director && 'monogram-director', className)} style={{ width: size, height: size, fontSize: size >= 56 ? 18 : size >= 40 ? 14 : 12 }}>{initials(name)}</span>;
}

/** An agent's state from its run record: running now, when it last ran, or never. */
export function agentState(T: TFn, stat?: AgentStat | null): { tone: Tone; live: boolean; text: string } {
  if (stat?.running) return { tone: 'info', live: true, text: T('co.running') };
  if (stat && stat.runs > 0) return { tone: stat.failed && stat.failed >= stat.completed ? 'bad' : 'neutral', live: false, text: T.f('co.lastRun', { ago: fmtAgo(stat.lastRunAt ?? '') }) };
  return { tone: 'neutral', live: false, text: T('co.neverRun') };
}
export function AgentStatus({ stat, className }: { stat?: AgentStat | null; className?: string }) {
  const s = agentState(T, stat);
  return <Status tone={s.tone} live={s.live} className={className}>{s.text}</Status>;
}

/** A failure class in words (the constant stays in the title, for the record). */
export const failureWords = (T: TFn, c: string) => T.dyn(`fail.${c}`, c.toLowerCase().replace(/_/g, ' '));

/** The reliability figures as a table: each measure, its value and the count that produced it — no tile, so no
 *  word is broken to fit (A5). */
export function ReliabilityTable({ r }: { r: ReliabilitySummary }) {
  const rows: Array<[string, string, string]> = [
    [T('studio.firstAttempt'), pct(r.firstAttemptTechnical.ok, r.firstAttemptTechnical.total), T.f('rel.ofRuns', { a: r.firstAttemptTechnical.ok, b: r.firstAttemptTechnical.total })],
    [T('studio.firstAcceptance'), pct(r.firstAttemptCreative.accepted, r.firstAttemptCreative.total), T.f('rel.ofTakes', { a: r.firstAttemptCreative.accepted, b: r.firstAttemptCreative.total })],
    [T('studio.retryRate'), pct(r.retryRate.retried, r.retryRate.jobs), T.f('rel.ofJobs', { a: r.retryRate.retried, b: r.retryRate.jobs })],
    [T('studio.qaRejections'), pct(r.qa.rejected, r.qa.reports), `${T.f('rel.ofReports', { a: r.qa.rejected, b: r.qa.reports })}${r.qa.review ? ` · ${T.p('rel.inReview', r.qa.review)}` : ''}`],
    [T('studio.exportSuccess'), pct(r.exports.ok, r.exports.total), T.f('rel.ofExports', { a: r.exports.ok, b: r.exports.total })],
    [T('studio.perAccepted'), fmtMs(r.perAcceptedShot.meanMsPerAccepted), `${T.p('rel.acceptedTakes', r.perAcceptedShot.acceptedTakes)}${r.perAcceptedShot.meanAttemptsPerAccepted ? ` · ${T.f('rel.attemptsEach', { x: r.perAcceptedShot.meanAttemptsPerAccepted.toFixed(2) })}` : ''}${r.perAcceptedShot.costUsdPerAccepted ? ` · $${r.perAcceptedShot.costUsdPerAccepted.toFixed(3)}` : ''}`],
  ];
  return (
    <div className="space-y-8">
      <div className="overflow-x-auto">
        <table className="table min-w-[30rem]">
          <thead><tr><th scope="col">{T('rel.measure')}</th><th scope="col" className="text-end">{T('rel.value')}</th><th scope="col">{T('rel.from')}</th></tr></thead>
          <tbody>{rows.map(([k, v, n]) => <tr key={k}><td className="font-medium text-body">{k}</td><td className="num text-end text-fg">{v}</td><td className="text-muted">{n}</td></tr>)}</tbody>
        </table>
      </div>
      <div>
        <h3 className="h3 mb-2">{T('studio.failureClasses')}</h3>
        {r.failureClasses.length === 0 ? <p className="text-[14px] text-muted">{T('studio.noFailures')}</p> : (
          <ul className="rows text-sm">{r.failureClasses.map((c) => <li key={c.failureClass} className="flex flex-wrap items-center gap-x-3 py-2.5"><span className="font-medium text-fg" title={c.failureClass}>{failureWords(T, c.failureClass)}</span><span className="num text-muted">{c.count}</span>{c.resolved ? <span className="text-faint">{T.p('rel.resolved', c.resolved)}</span> : null}</li>)}</ul>
        )}
        {r.openEvents.length > 0 && (
          <ol className="rows mt-3 text-sm">
            {r.openEvents.slice(0, 8).map((e) => <li key={e.id} className="flex flex-wrap gap-x-3 py-2"><span className="num text-faint">{fmtAgo(e.createdAt)}</span><Status tone={e.resolved ? 'ok' : 'bad'}>{failureWords(T, e.failureClass)}</Status><span className="min-w-0 flex-1 text-muted" dir="auto">{e.failureMessage}</span>{e.changeMade && <span className="text-faint" dir="auto">→ {e.changeMade}</span>}</li>)}
          </ol>
        )}
      </div>
    </div>
  );
}
