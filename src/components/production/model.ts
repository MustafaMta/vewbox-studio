import type { Job } from '@/domain/jobs';
import type { StudioState } from '@/domain/types';
import { isActiveStatus, isTerminalStatus } from '@/domain/jobs';
import { productionHref, shotLabel } from '@/studio/selectors';
import { jobWords } from '@/components/studio/model';

/** THE CONTROL ROOM'S READING OF THE JOBS (docs/DESIGN-SYSTEM-V5.md §8.13, VISUAL-STANDARD-V5.1 §5.21) — pure: what a
 *  job makes and for whom, its phase in the worker's own words, a fraction only when the worker reported one, and the
 *  history filters. Nothing is estimated. */

type S = Pick<StudioState, 'productions' | 'characters' | 'locations'>;

export interface JobSubject { label: string; href?: string; lang?: 'ar' }
const arabic = (s: string) => (/[؀-ۿݐ-ݿࢠ-ࣿ]/.test(s) ? 'ar' as const : undefined);

/** What the job is about: "The Static Sky · shot 2.3", "Elias Moore", "Elias's Workshop" — with the page to open. */
export function subjectOf(j: Pick<Job, 'productionId' | 'characterId' | 'locationId' | 'shotId'>, s: S): JobSubject | null {
  const p = j.productionId ? s.productions.find((x) => x.id === j.productionId) : undefined;
  if (p) {
    const sh = j.shotId ? p.shots.find((x) => x.id === j.shotId) : undefined;
    const title = p.kind === 'MUSIC_VIDEO' ? p.song?.title || p.title : p.title;
    return { label: sh ? `${title} · shot ${shotLabel(p, sh)}` : title, href: sh ? `${productionHref(p)}/shots/${encodeURIComponent(sh.id)}` : productionHref(p), lang: arabic(title) };
  }
  const c = j.characterId ? s.characters.find((x) => x.id === j.characterId) : undefined;
  if (c) return { label: c.name, href: `/characters/${encodeURIComponent(c.id)}`, lang: arabic(c.name) };
  const l = j.locationId ? s.locations.find((x) => x.id === j.locationId) : undefined;
  if (l) return { label: l.name, href: `/locations/${encodeURIComponent(l.id)}`, lang: arabic(l.name) };
  return null;
}

export const jobTitle = (j: Pick<Job, 'type'>) => jobWords(j.type);

/** The worker's phase in words, with its step count when it reported one: "Drawing frame 13 of 20". */
export function phaseWords(j: Pick<Job, 'status' | 'progress'>): string {
  if (j.status === 'QUEUED') return 'Waiting for its turn';
  const p = j.progress;
  const words = p?.message || (p?.phase ? p.phase.charAt(0).toUpperCase() + p.phase.slice(1) : '') || 'Working';
  return p?.step && p.total && !/\bof\b\s*\d/.test(words) ? `${words} · ${p.step} of ${p.total}` : words;
}

/** The real fraction done, when the worker reported one (a percent between 0 and 100, or steps); otherwise null. */
export function fractionOf(j: Pick<Job, 'progress'>): number | null {
  const p = j.progress;
  if (typeof p?.percent === 'number' && p.percent > 0 && p.percent < 100) return p.percent / 100;
  if (p?.step && p.total && p.total > 0) return Math.min(1, Math.max(0, p.step / p.total));
  return null;
}

/** 0:42 · 12:04 · 1:02:09 */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

const time = (t: string | null | undefined) => { if (!t) return null; const d = new Date(t.includes('T') ? t : t.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')); return Number.isNaN(d.getTime()) ? null : d.getTime(); };
/** How long a job has run (from its start, else its creation) — or ran, when it finished. */
export function elapsedMs(j: Pick<Job, 'startedAt' | 'createdAt' | 'finishedAt'>, now: number): number | null {
  const from = time(j.startedAt) ?? time(j.createdAt);
  if (from === null) return null;
  const to = time(j.finishedAt) ?? now;
  return Math.max(0, to - from);
}

/** A job parked while the jobs it started run (status WAITING, the orchestration graph): open, not working. */
export const isWaiting = (j: Pick<Job, 'status'>) => (j.status as string) === 'WAITING';
export const running = (jobs: Job[]) => jobs.filter((j) => isActiveStatus(j.status) || isWaiting(j)).sort((a, b) => (a.status === 'QUEUED' ? 1 : 0) - (b.status === 'QUEUED' ? 1 : 0) || a.createdAt.localeCompare(b.createdAt));

export type HistoryFilter = 'all' | 'done' | 'failed' | 'cancelled' | 'review';
export const HISTORY_FILTERS: Array<{ value: HistoryFilter; label: string }> = [
  { value: 'all', label: 'All' }, { value: 'done', label: 'Finished' }, { value: 'review', label: 'Waits for review' }, { value: 'failed', label: 'Failed' }, { value: 'cancelled', label: 'Cancelled' },
];
const inFilter = (j: Job, f: HistoryFilter) => f === 'all' || (f === 'done' ? j.status === 'COMPLETED' : f === 'failed' ? j.status === 'FAILED' : f === 'cancelled' ? j.status === 'CANCELLED' : j.status === 'AWAITING_REVIEW');
/** The record: every job that is no longer running, newest first, through the filter. */
export const history = (jobs: Job[], f: HistoryFilter) => jobs.filter((j) => (isTerminalStatus(j.status) || j.status === 'AWAITING_REVIEW') && inFilter(j, f)).sort((a, b) => (b.finishedAt ?? b.updatedAt ?? b.createdAt).localeCompare(a.finishedAt ?? a.updatedAt ?? a.createdAt));
export const historyCounts = (jobs: Job[]): Record<HistoryFilter, number> => Object.fromEntries(HISTORY_FILTERS.map((x) => [x.value, history(jobs, x.value).length])) as Record<HistoryFilter, number>;

/** A finished job's outcome in words and tone. */
export function jobOutcome(j: Pick<Job, 'status'>): { tone: 'done' | 'failed' | 'idle' | 'waiting' | 'running'; words: string } {
  switch (j.status) {
    case 'COMPLETED': return { tone: 'done', words: 'Finished' };
    case 'FAILED': return { tone: 'failed', words: 'Failed' };
    case 'CANCELLED': return { tone: 'idle', words: 'Cancelled' };
    case 'AWAITING_REVIEW': return { tone: 'waiting', words: 'Waits for review' };
    case 'QUEUED': return { tone: 'idle', words: 'Queued' };
    case 'WAITING' as Job['status']: return { tone: 'idle', words: 'Waiting for its jobs' };
    default: return { tone: 'running', words: 'Running' };
  }
}
