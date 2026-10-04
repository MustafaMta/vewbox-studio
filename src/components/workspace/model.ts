import type { Asset, Production, Shot, Take } from '@/domain/types';
import type { Job } from '@/domain/jobs';
import { isActiveStatus } from '@/domain/jobs';
import type { Stage } from '@/domain/vocabulary';
import type { Decision } from '@/studio/selectors/decisions';
import { productionHref, shotLabel, stageIndex } from '@/studio/selectors';
import { cutVersionsOf, type CutVersion } from '@/studio/selectors/cuts';
import { takeExpectations } from '@/studio/selectors/expectations';

/** THE PRODUCTION WORKSPACE'S MODEL (docs/DESIGN-SYSTEM-V5.md §5.19, §8.10–§8.11) — everything the map, the outline and
 *  the shot workspace say, computed from the production, the job list and the shared decisions. Pure: no React, no
 *  fetching, nothing invented (a state the data does not have is never shown). Tested in tests/unit/workspace-model. */

// ------------------------------------------------------------------------------------------------------ routes

/** The workspace's tabs. A film: Map · Story · Cast & World · Storyboard · Produce · Final cut. A music video: Map ·
 *  Song & Lyrics · Performers · Visual story · Storyboard · Produce · Final cut. */
export type WorkspaceTab = 'map' | 'story' | 'cast' | 'song' | 'performers' | 'visual' | 'storyboard' | 'produce' | 'final';
export const FILM_TABS: readonly WorkspaceTab[] = ['map', 'story', 'cast', 'storyboard', 'produce', 'final'];
export const MUSIC_TABS: readonly WorkspaceTab[] = ['map', 'song', 'performers', 'visual', 'storyboard', 'produce', 'final'];

export const tabsOf = (p: Pick<Production, 'kind'>): readonly WorkspaceTab[] => (p.kind === 'MUSIC_VIDEO' ? MUSIC_TABS : FILM_TABS);

/** Old tab names (the tabbed pages before the move) land on the tab that holds the same work. */
export function tabFrom(p: Pick<Production, 'kind'>, raw: string | null | undefined): WorkspaceTab {
  const music = p.kind === 'MUSIC_VIDEO';
  const t = (raw ?? '').toLowerCase();
  const alias: Record<string, WorkspaceTab> = music
    ? { overview: 'map', story: 'visual', cast: 'performers', characters: 'performers', locations: 'visual' }
    : { overview: 'map', characters: 'cast', locations: 'cast', song: 'story', performers: 'cast', visual: 'story' };
  const tab = (alias[t] ?? t) as WorkspaceTab;
  return tabsOf(p).includes(tab) ? tab : 'map';
}

/** `/shorts/x/production`, `/shorts/x/production?tab=story` (the map has no tab parameter). */
export const workspaceHref = (p: Production, tab: WorkspaceTab = 'map', hash?: string): string =>
  `${productionHref(p)}/production${tab === 'map' ? '' : `?tab=${tab}`}${hash ? `#${hash}` : ''}`;

/** The tab the production's next step happens in. */
export function nextTab(p: Production): WorkspaceTab {
  const music = p.kind === 'MUSIC_VIDEO';
  switch (p.stage) {
    case 'STORY': return music ? 'song' : 'story';
    case 'CAST_AND_WORLD': return music ? 'performers' : 'cast';
    case 'STORYBOARD': return 'storyboard';
    case 'PRODUCE': return 'produce';
    case 'FINAL_CUT': return 'final';
    default: return 'map';
  }
}

export const TAB_LABEL: Record<WorkspaceTab, string> = {
  map: 'Map', story: 'Story', cast: 'Cast & World', song: 'Song & Lyrics', performers: 'Performers', visual: 'Visual story', storyboard: 'Storyboard', produce: 'Produce', final: 'Final cut',
};

const TAB_STAGE: Record<Exclude<WorkspaceTab, 'map'>, Stage> = { story: 'STORY', song: 'STORY', visual: 'STORY', cast: 'CAST_AND_WORLD', performers: 'CAST_AND_WORLD', storyboard: 'STORYBOARD', produce: 'PRODUCE', final: 'FINAL_CUT' };
/** The pipeline gate (src/server/org) each tab's approval belongs to. */
const TAB_GATE: Partial<Record<WorkspaceTab, string>> = { story: 'STORY', song: 'STORY', visual: 'STORY', final: 'EDIT' };

export type PillState = 'done' | 'current' | 'waiting' | 'upcoming';
export interface StagePill { tab: WorkspaceTab; label: string; state: PillState; href: string }

/** The stage pipeline as pills: done (the production is past it), current (it is the production's stage), waiting (a
 *  gate of that stage waits for the producer's approval), upcoming. The map comes first and is never a stage. */
export function stagePills(p: Production, decisions: readonly Decision[] = []): StagePill[] {
  const at = stageIndex(p.stage);
  const waitingGates = new Set(decisions.filter((d) => d.kind === 'stage' && d.subject.productionId === p.id).map((d) => d.subject.stage));
  return tabsOf(p).map((tab) => {
    if (tab === 'map') return { tab, label: TAB_LABEL.map, state: 'current' as PillState, href: workspaceHref(p) };
    const i = stageIndex(TAB_STAGE[tab]);
    const gate = TAB_GATE[tab];
    const state: PillState = gate && waitingGates.has(gate) ? 'waiting' : p.stage === 'COMPLETE' || i < at ? 'done' : i === at ? 'current' : 'upcoming';
    return { tab, label: TAB_LABEL[tab], state, href: workspaceHref(p, tab) };
  });
}

// --------------------------------------------------------------------------------------------- jobs and shots

/** A job's shot, when it is about one (GENERATE_TAKE, SHOT_FRAMES), or the shots a production pass names. */
const jobShots = (j: Job): string[] => (j.shotId ? [j.shotId] : Array.isArray((j.payload as { shotIds?: unknown }).shotIds) ? ((j.payload as { shotIds: string[] }).shotIds) : []);

/** The jobs that belong to this production, newest first. */
export const jobsOf = (p: Pick<Production, 'id'>, jobs: readonly Job[]): Job[] =>
  jobs.filter((j) => j.productionId === p.id || (j.payload as { productionId?: string })?.productionId === p.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/** What is running right now for this production (queued or working), oldest first: the "on the floor" list. */
export const runningOf = (p: Pick<Production, 'id'>, jobs: readonly Job[]): Job[] => jobsOf(p, jobs).filter((j) => isActiveStatus(j.status)).reverse();

export const activeShotJob = (p: Pick<Production, 'id'>, shotId: string, jobs: readonly Job[]): Job | undefined =>
  runningOf(p, jobs).find((j) => (j.type === 'GENERATE_TAKE' || j.type === 'SHOT_FRAMES') && jobShots(j).includes(shotId));

/** A shot's state, in the outline's marks (§5.19): a selected take ● · running ◐ · takes but none chosen · a drawn
 *  opening frame · planned ○ · failed (the newest attempt failed after the newest take). `sample`: the chosen take is
 *  only a bundled sample clip. */
export type ShotStateKind = 'selected' | 'sample' | 'running' | 'choose' | 'framed' | 'planned' | 'failed';
export interface ShotState { kind: ShotStateKind; words: string; tone: 'done' | 'running' | 'waiting' | 'idle' | 'failed' }

export function shotState(p: Pick<Production, 'id'>, sh: Shot, jobs: readonly Job[]): ShotState {
  const running = activeShotJob(p, sh.id, jobs);
  if (running) return { kind: 'running', words: running.type === 'SHOT_FRAMES' ? 'Drawing frames' : running.status === 'QUEUED' ? 'Waiting in the queue' : 'Filming', tone: 'running' };
  const newestTake = [...sh.takes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const lastAttempt = jobsOf(p, jobs).find((j) => j.type === 'GENERATE_TAKE' && j.shotId === sh.id);
  if (lastAttempt?.status === 'FAILED' && (!newestTake || lastAttempt.createdAt > newestTake.createdAt)) return { kind: 'failed', words: 'The last take failed', tone: 'failed' };
  if ('shots' in p && failedShotsOf(p as Production, jobs).some((f) => f.shotId === sh.id)) return { kind: 'failed', words: 'Failed in the production pass', tone: 'failed' };
  const chosen = sh.takes.find((t) => t.id === sh.selectedTakeId);
  if (chosen) {
    const n = sh.takes.indexOf(chosen) + 1;
    if (chosen.provider === 'SAMPLE') return { kind: 'sample', words: 'Sample clip · needs a real take', tone: 'waiting' };
    return { kind: 'selected', words: sh.takes.length === 1 ? '1 take · selected' : `${sh.takes.length} takes · take ${n} selected`, tone: 'done' };
  }
  const usable = sh.takes.filter((t) => t.status !== 'REJECTED' && t.rating !== 'REJECTED');
  if (usable.length) return { kind: 'choose', words: `${usable.length} ${usable.length === 1 ? 'take' : 'takes'} · choose one`, tone: 'waiting' };
  if (sh.openingFrameAssetId) return { kind: 'framed', words: 'Opening frame drawn', tone: 'idle' };
  return { kind: 'planned', words: 'Planned', tone: 'idle' };
}

/** A take's place in the cut and the producer's judgement, in words. */
export function takeVerdict(sh: Shot, t: Take): { words: string; tone: 'done' | 'waiting' | 'idle' | 'failed' } {
  if (sh.selectedTakeId === t.id) return { words: 'Selected', tone: 'done' };
  if (t.rating === 'REJECTED') return { words: t.ratingReason ? `Rejected · ${t.ratingReason}` : 'Rejected', tone: 'failed' };
  if (t.status === 'REJECTED') return { words: t.rejectionReason ? `Failed its checks · ${t.rejectionReason}` : 'Failed its checks', tone: 'failed' };
  if (t.rating === 'GOOD') return { words: 'Good take', tone: 'idle' };
  return { words: 'Not judged', tone: 'idle' };
}

export const canUseTake = (t: Take) => t.status !== 'REJECTED' && t.rating !== 'REJECTED';

// --------------------------------------------------------------------------------------------------- the map

export interface Flow { scenes: number; shots: number; takes: number; selected: number; cutVersion: number | null; scriptLines: number; scriptApproved: boolean }

export function flowOf(p: Production, assets: readonly Asset[]): Flow {
  const cuts = cutVersionsOf(p, assets as Asset[]);
  const current = cuts.find((c) => c.current);
  return {
    scenes: p.scenes.length,
    shots: p.shots.length,
    takes: p.shots.reduce((a, sh) => a + sh.takes.length, 0),
    selected: p.shots.filter((sh) => sh.selectedTakeId).length,
    cutVersion: current?.version ?? null,
    scriptLines: p.scenes.reduce((a, sc) => a + sc.beats.reduce((b, bt) => b + bt.lines.length, 0), 0),
    scriptApproved: stageIndex(p.stage) > stageIndex('STORY'),
  };
}

/** One row of the breakdown review (the gate before every shot is filmed, LTX): a scene's shots, their planned length,
 *  their opening frames and whether the scene is ready. */
export interface BreakdownRow { sceneId: string; label: string; shots: number; seconds: number; framed: number; ready: boolean }

export function breakdownOf(p: Production): { rows: BreakdownRow[]; total: { shots: number; seconds: number; framed: number; ready: boolean } } {
  const rows = p.scenes.map((sc) => {
    const shots = p.shots.filter((sh) => sh.sceneId === sc.id);
    const framed = shots.filter((sh) => sh.openingFrameAssetId).length;
    return { sceneId: sc.id, label: `${sc.number} · ${sc.title}`, shots: shots.length, seconds: shots.reduce((a, sh) => a + sh.durationSeconds, 0), framed, ready: shots.length > 0 && framed === shots.length };
  });
  const total = rows.reduce((a, r) => ({ shots: a.shots + r.shots, seconds: a.seconds + r.seconds, framed: a.framed + r.framed, ready: a.ready && r.ready }), { shots: 0, seconds: 0, framed: 0, ready: rows.length > 0 });
  return { rows, total };
}

/** The one sentence at the top of the map: where the production is, from its records. */
export function leadOf(p: Production, flow: Flow, cuts: readonly CutVersion[], lastExportAt?: string): { words: string; tone: 'done' | 'waiting' | 'idle' } {
  if (p.shots.length === 0) return { words: p.scenes.length ? 'The script is written; the shots are not planned yet.' : 'Nothing is written yet: start with the story.', tone: 'idle' };
  const missing = p.shots.length - flow.selected;
  const cut = cuts.find((c) => c.current);
  if (p.stage === 'COMPLETE' && cut) return { words: `Finished: every shot has a selected take, and cut ${cut.version} is the film${lastExportAt ? `, exported on ${dayTime(lastExportAt)}` : ''}.`, tone: 'done' };
  if (missing === 0 && cut) return { words: `Every shot has a selected take; cut ${cut.version} is assembled.`, tone: 'done' };
  if (missing === 0) return { words: 'Every shot has a selected take: the cut can be assembled.', tone: 'waiting' };
  return { words: `${p.shots.length - missing} of ${p.shots.length} shots have a selected take.`, tone: 'idle' };
}

/** "3 Oct at 09:33", in the studio's local time. */
export function dayTime(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'));
  if (Number.isNaN(d.getTime())) return '';
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  return `${d.getDate()} ${month} at ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "2 min 50 s", "48 s": a duration in words (never a percentage, never a guess). */
export function spokenDuration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60); const r = s % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}

/** What to expect of a new take here: from this production's own accepted takes (B9), never estimated. */
export function expectationWords(p: Production, shotId?: string): string | null {
  const e = takeExpectations(p, shotId ? { shotId } : {});
  const shot = shotId ? takeExpectations(p, { shotId }) : null;
  if (shot?.lastGenerationMs) return `the last take here took ${spokenDuration(shot.lastGenerationMs)}`;
  if (e.medianGenerationMs) return `takes in this film took about ${spokenDuration(e.medianGenerationMs)}`;
  return null;
}

/** The decisions that belong to this production (the shell's one source of truth), with a shot-level filter. */
export const decisionsOf = (p: Pick<Production, 'id'>, items: readonly Decision[], shotId?: string): Decision[] =>
  items.filter((d) => d.subject.productionId === p.id && (!shotId || d.subject.shotId === shotId || d.lines?.some((l) => l.shotId === shotId)));

/** Lines of this shot that wait to be heard again (a `lines` decision), by line id. */
export function linesToHear(p: Pick<Production, 'id'>, items: readonly Decision[], shotId: string): Map<string, 'NOT_HEARD' | 'DRIFTED'> {
  const out = new Map<string, 'NOT_HEARD' | 'DRIFTED'>();
  for (const d of items) if (d.kind === 'lines' && d.subject.productionId === p.id) for (const l of d.lines ?? []) if (l.shotId === shotId) out.set(l.lineId, l.reason);
  return out;
}

/** Previous and next shot in film order (for `[` and `]`). */
export function neighbours(p: Production, shotId: string): { prev?: Shot; next?: Shot } {
  const order = orderedShots(p);
  const i = order.findIndex((s) => s.id === shotId);
  return { prev: i > 0 ? order[i - 1] : undefined, next: i >= 0 ? order[i + 1] : undefined };
}

/** The shots in film order: scene by scene, then by number. */
export function orderedShots(p: Production): Shot[] {
  const sceneNo = new Map(p.scenes.map((sc) => [sc.id, sc.number]));
  return [...p.shots].sort((a, b) => (sceneNo.get(a.sceneId) ?? 0) - (sceneNo.get(b.sceneId) ?? 0) || a.number - b.number);
}

export const shotName = (p: Production, sh: Shot) => `Shot ${shotLabel(p, sh)}`;

/** Readable words for a closed vocabulary value: MEDIUM_CLOSE_UP → "Medium close-up". */
export function vocab(v: string | undefined | null): string {
  if (!v) return '';
  const special: Record<string, string> = { MEDIUM_CLOSE_UP: 'Medium close-up', EXTREME_CLOSE_UP: 'Extreme close-up', CLOSE_UP: 'Close-up', TWO_SHOT: 'Two-shot', OVER_THE_SHOULDER: 'Over the shoulder', PUSH_IN: 'Push in', PULL_BACK: 'Pull back', RACK_FOCUS: 'Rack focus', GOLDEN_HOUR: 'Golden hour' };
  if (special[v]) return special[v];
  const w = v.toLowerCase().replace(/_/g, ' ');
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** What a job is doing, in the production's words: "Filming shot 2.3", "Recording the dialogue". */
export function jobWords(j: Pick<Job, 'type' | 'shotId' | 'payload'>, p?: Production): string {
  const sh = j.shotId && p ? p.shots.find((s) => s.id === j.shotId) : undefined;
  const label = sh && p ? ` shot ${shotLabel(p, sh)}` : '';
  switch (j.type) {
    case 'GENERATE_TAKE': return `Filming${label || ' a shot'}`;
    case 'SHOT_FRAMES': return `Drawing the frames of${label || ' a shot'}`;
    case 'DIALOGUE_AUDIO': return 'Recording the dialogue';
    case 'PRODUCE': return (j.payload as { respeak?: boolean }).respeak ? 'Re-recording the speaking shots' : 'Producing every shot';
    case 'ASSEMBLE': return 'Assembling the cut';
    case 'EXPORT': return 'Exporting the film';
    case 'PLAN_SHOTS': return 'Planning the shots';
    case 'WRITE_SCRIPT': return 'Writing the script';
    case 'DEVELOP_STORY': return 'Developing the story';
    case 'GENERATE_SONG': return 'Making the song';
    default: return 'Working';
  }
}

/** The job's real phase in words (the worker's own phase wins; never a guess). */
export function phaseWords(j: Pick<Job, 'status' | 'progress'>): string {
  const ph = j.progress?.phase ?? j.status;
  const W: Record<string, string> = { QUEUED: 'waiting in the queue', PREPARING: 'preparing the references', GENERATING: 'making', DOWNLOADING: 'collecting the result', VALIDATING: 'checking', POSTPROCESSING: 'saving', AWAITING_REVIEW: 'waiting for your review' };
  return W[ph] ?? 'working';
}

const SETTLED = ['COMPLETED', 'FAILED', 'CANCELLED', 'AWAITING_REVIEW'];

/** An orchestrator waiting for the jobs it queued (status GENERATING, `waiting: true`): its real child counts — from
 *  the children in the job list, else the step/total the worker reported — never "Generating". */
export function waitingCounts(j: Pick<Job, 'id' | 'progress'>, jobs: readonly Job[]): { done: number; total: number } | null {
  const children = jobs.filter((c) => c.parentId === j.id);
  if (children.length) return { done: children.filter((c) => SETTLED.includes(c.status)).length, total: children.length };
  if (j.progress?.total) return { done: j.progress.step ?? 0, total: j.progress.total };
  return null;
}

export function waitingWords(j: Pick<Job, 'id' | 'type' | 'progress'>, jobs: readonly Job[]): string {
  const c = waitingCounts(j, jobs);
  const what = j.type === 'PRODUCE' ? 'its shots' : 'the work it started';
  return c ? `Waiting for ${what} (${c.done} of ${c.total} done)` : `Waiting for ${what}`;
}

/** The shots a production pass reported as failed (`failedShots` of the newest PRODUCE result), each failing alone,
 *  with the failed child job (its error carries the real class) — minus shots that have a newer take or a running job. */
export interface FailedShot { shotId: string; jobId: string; reason: string; job?: Job }
export function failedShotsOf(p: Production, jobs: readonly Job[]): FailedShot[] {
  const pass = jobsOf(p, jobs).find((j) => j.type === 'PRODUCE' && Array.isArray((j.result as { failedShots?: unknown } | undefined)?.failedShots));
  const listed = ((pass?.result as { failedShots?: FailedShot[] } | undefined)?.failedShots ?? []).filter((f) => p.shots.some((s) => s.id === f.shotId));
  const byId = new Map(jobs.map((j) => [j.id, j]));
  return listed.map((f) => ({ ...f, job: byId.get(f.jobId) })).filter((f) => {
    if (activeShotJob(p, f.shotId, jobs)) return false;
    const sh = p.shots.find((s) => s.id === f.shotId)!;
    const at = f.job?.finishedAt ?? f.job?.updatedAt ?? pass?.finishedAt ?? '';
    return !sh.takes.some((t) => t.createdAt > at);
  });
}

/** A real fraction when the worker reports one (a percent, or step of total); otherwise null (indeterminate). */
export function fractionOf(j: Pick<Job, 'progress'>): { value: number; words: string } | null {
  const pr = j.progress;
  if (pr?.step && pr.total) return { value: Math.min(1, pr.step / pr.total), words: `${pr.step} of ${pr.total}` };
  if (typeof pr?.percent === 'number' && pr.percent > 0) return { value: Math.min(1, pr.percent / 100), words: `${Math.round(pr.percent)}%` };
  return null;
}

/** The production's frame ratio for the media kit. */
export const frameRatioOf = (p: Pick<Production, 'aspect'>): '16/9' | '9/16' | '1/1' | '2.39/1' =>
  p.aspect === 'VERTICAL_9_16' ? '9/16' : p.aspect === 'SQUARE_1_1' ? '1/1' : p.aspect === 'CINEMA_2_39' ? '2.39/1' : '16/9';
