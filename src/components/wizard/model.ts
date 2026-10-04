import type { AutoIdeaRequest, Production } from '@/domain/types';
import type { Job } from '@/domain/jobs';
import { isActiveStatus } from '@/domain/jobs';
import { DEVELOPMENT_STAGES, stagePhase, type DevelopmentStage, type DevelopmentStep } from '@/domain/development';
import { ASPECTS, DIALECT_LABELS, DURATIONS, type Aspect, type Dialect, type Language, type Style } from '@/domain/vocabulary';

/** THE CREATION FLOWS' READING OF THE STUDIO — pure, so every word the flows say can be tested: what each kind is
 *  called and drawn as, the validation messages, the ideas the studio already wrote, the development stages as rows
 *  of a stepper, and the engines' readiness in plain words. Nothing here invents content: an idea is a real AUTO_IDEA
 *  job with a written proposal; a stage's state comes from the real child jobs and the orchestrator's progress. */

export type CreateKind = 'show' | 'season' | 'episode' | 'short' | 'music-video';
export const CREATE_KINDS: CreateKind[] = ['show', 'season', 'episode', 'short', 'music-video'];
export type CreateMode = 'auto' | 'manual';
export type ContentRatio = '16/9' | '2/3' | '1/1';
export type Shape = 'show' | 'short' | 'music';

export interface KindInfo {
  kind: CreateKind;
  request: AutoIdeaRequest['kind'];
  /** "New short" */
  title: string;
  /** the one line under the title */
  line: string;
  /** the thing in the content's own shape (key art 16:9, poster 2:3, sleeve 1:1) */
  ratio: ContentRatio;
  shape: Shape;
  /** the noun in sentences and on the primary button: "Create short" */
  noun: string;
  /** suggested lengths; null for a show or a season (their episodes carry the length) */
  durations: number[] | null;
  /** where Cancel goes */
  back: { href: string; label: string };
}

export const KIND_INFO: Record<CreateKind, KindInfo> = {
  show: { kind: 'show', request: 'SHOW', title: 'New show', line: 'Seasons and episodes that share one cast and one world.', ratio: '16/9', shape: 'show', noun: 'show', durations: null, back: { href: '/shows', label: 'Shows' } },
  season: { kind: 'season', request: 'SEASON', title: 'New season', line: 'The next chapter of the show, with its cast and its world.', ratio: '16/9', shape: 'show', noun: 'season', durations: null, back: { href: '/shows', label: 'Shows' } },
  episode: { kind: 'episode', request: 'EPISODE', title: 'New episode', line: 'One more episode, continuing from where the show left off.', ratio: '16/9', shape: 'show', noun: 'episode', durations: DURATIONS.EPISODE, back: { href: '/shows', label: 'Shows' } },
  short: { kind: 'short', request: 'SHORT', title: 'New short', line: 'One film from one line.', ratio: '2/3', shape: 'short', noun: 'short', durations: DURATIONS.SHORT, back: { href: '/shorts', label: 'Shorts' } },
  'music-video': { kind: 'music-video', request: 'MUSIC_VIDEO', title: 'New music video', line: 'It starts with its song, then its performers.', ratio: '1/1', shape: 'music', noun: 'music video', durations: DURATIONS.MUSIC_VIDEO, back: { href: '/music-videos', label: 'Music videos' } },
};

export const isCreateKind = (k: string): k is CreateKind => (CREATE_KINDS as string[]).includes(k);
/** `?mode=auto|manual` (Home and the catalogues), `?method=` (the command palette); Auto when absent. */
export const modeOf = (sp: { get: (k: string) => string | null }): CreateMode => ((sp.get('mode') ?? sp.get('method')) === 'manual' ? 'manual' : 'auto');

// ------------------------------------------------------------------------------------------------- words

export const STYLE_WORDS: Record<Style, { label: string; hint: string }> = {
  CARTOON: { label: 'Cartoon', hint: 'Bold and warm' },
  ANIME: { label: 'Anime', hint: 'Clean lines, painted skies' },
  REALISTIC: { label: 'Realistic', hint: 'Cinematic light' },
};
export const LANGUAGE_WORDS: Record<Language, string> = { EN: 'English', AR: 'Arabic' };
export const dialectWords = (d: Dialect | undefined) => (d ? DIALECT_LABELS[d].en : '');
export const ASPECT_WORDS: Record<Aspect, { label: string; hint: string }> = {
  WIDE_16_9: { label: '16:9', hint: 'Screens and TV' },
  VERTICAL_9_16: { label: '9:16', hint: 'Phones' },
  SQUARE_1_1: { label: '1:1', hint: 'Feeds' },
  CINEMA_2_39: { label: '2.39:1', hint: 'Cinema' },
};
export { ASPECTS };

/** 30 s · 1 min · 1 min 30 s · 10 min */
export function lengthWords(seconds: number | undefined | null): string {
  if (!seconds || seconds <= 0) return '';
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60); const r = s % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}

export const languageWords = (language: Language | undefined, dialect?: Dialect) => (language === 'AR' ? `Arabic${dialect ? ` (${dialectWords(dialect)})` : ''}` : language === 'EN' ? 'English' : '');

// ------------------------------------------------------------------------------------------------- validation

export interface ManualInput {
  title: string;
  line: string;
  /** a custom length in seconds (the segmented choice writes the same field) */
  seconds?: number | null;
  /** music video: how the song begins */
  song?: { source: 'write' | 'upload'; uploaded: boolean };
}
export type ManualErrors = Partial<Record<'title' | 'seconds' | 'song', string>>;

/** The manual brief's rules: a title or one line is enough; a custom length between 5 seconds and an hour; an
 *  uploaded song needs its file. Messages say what to do, not what went wrong. */
export function validateManual(kind: CreateKind, x: ManualInput): ManualErrors {
  const e: ManualErrors = {};
  if (!x.title.trim() && !x.line.trim()) e.title = kind === 'season' ? 'Give the season a title or one line about its arc.' : `Give the ${KIND_INFO[kind].noun} a title or one line about it.`;
  if (KIND_INFO[kind].durations && x.seconds != null && (!Number.isFinite(x.seconds) || x.seconds < 5 || x.seconds > 3600)) e.seconds = 'Choose a length between 5 seconds and one hour.';
  if (kind === 'music-video' && x.song?.source === 'upload' && !x.song.uploaded) e.song = 'Choose the song file, or let the studio write it.';
  return e;
}

/** Auto needs nothing but, for a music video built on an uploaded song, the song. */
export function validateAuto(kind: CreateKind, x: { song?: { source: 'write' | 'upload'; uploaded: boolean } }): ManualErrors {
  return kind === 'music-video' && x.song?.source === 'upload' && !x.song.uploaded ? { song: 'Choose the song file, or let the studio write it.' } : {};
}

/** The title the manual brief creates: the title, else the first line of the description (60 characters). */
export const titleFrom = (title: string, line: string) => (title.trim() || line.trim().split(/\n/)[0].slice(0, 60)).trim();

export const firstError = (e: ManualErrors) => (['song', 'title', 'seconds'] as const).find((k) => e[k]);

// ------------------------------------------------------------------------------------------------- earlier ideas

export interface Idea {
  jobId: string;
  proposalId?: string;
  title: string;
  /** the producer's own line, when there was one */
  brief?: string;
  at: string;
  status: 'developing' | 'ready' | 'made' | 'failed';
  /** the production made from it, when it was accepted */
  made?: { title: string; href: string };
  message?: string;
}

/** The ideas the studio wrote (or is writing) for this kind — and, for a season or an episode, this show: real
 *  AUTO_IDEA jobs, newest first. An idea already turned into a production says so and links to it. */
export function ideasOf(jobs: Job[], productions: Production[], kind: CreateKind, showId?: string, href: (p: Production) => string = (p) => `/${p.id}`): Idea[] {
  const req = KIND_INFO[kind].request;
  return jobs
    .filter((j) => j.type === 'AUTO_IDEA' && j.payload.kind === req && (!showId || j.payload.showId === showId))
    .filter((j) => isActiveStatus(j.status) || j.status === 'COMPLETED' || j.status === 'FAILED')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((j): Idea => {
      const used = productions.find((p) => p.brief?.proposalJobId === j.id);
      const brief = typeof j.payload.brief === 'string' && j.payload.brief.trim() ? j.payload.brief.trim() : undefined;
      const title = typeof j.result?.title === 'string' && j.result.title ? j.result.title : brief ? brief.slice(0, 60) : 'An idea from the studio';
      const proposalId = typeof j.result?.proposalId === 'string' ? j.result.proposalId : undefined;
      if (isActiveStatus(j.status)) return { jobId: j.id, title, brief, at: j.createdAt, status: 'developing', message: j.progress?.message };
      if (j.status === 'FAILED') return { jobId: j.id, title, brief, at: j.createdAt, status: 'failed', message: j.error?.message };
      return { jobId: j.id, proposalId, title, brief, at: j.finishedAt ?? j.createdAt, status: used ? 'made' : 'ready', made: used ? { title: used.title, href: href(used) } : undefined };
    })
    .filter((i) => i.status !== 'failed' && (i.status !== 'ready' || i.proposalId));
}

// ------------------------------------------------------------------------------------------------- development stages

/** What each stage does and who does it, in the producer's words (no models, no job types). */
export const STAGE_WORDS: Record<DevelopmentStage, { label: string; who: string }> = {
  RESEARCH: { label: 'Research', who: 'Trend research' },
  AUDIENCE: { label: 'Audience', who: 'Audience research' },
  CONCEPTS: { label: 'Concepts', who: 'Creative concepts' },
  WRITING: { label: 'First draft', who: 'Screenwriter' },
  EDITING: { label: 'Story edit', who: 'Story editor' },
  AUDIENCE_REVIEW: { label: 'Audience review', who: 'Audience experience' },
  REVISION: { label: 'Revision', who: 'Screenwriter' },
  PROPOSAL: { label: 'Proposal', who: 'Head of Story' },
};

export interface DevelopmentView {
  job: { id: string; status: Job['status']; progress?: Job['progress']; result?: Record<string, unknown>; error?: Job['error']; startedAt?: string; finishedAt?: string; createdAt?: string };
  stages: Array<{ stage?: DevelopmentStage; jobId: string; status: Job['status']; startedAt?: string; finishedAt?: string; error?: Job['error']; progress?: Job['progress'] }>;
  proposal: { id: string } | null;
}

export type StageState = 'waiting' | 'running' | 'done' | 'skipped' | 'failed';
export interface StageRow { stage: DevelopmentStage; label: string; who: string; state: StageState; note?: string; startedAt?: string; finishedAt?: string }

/** The eight stages as stepper rows, from the real child jobs, the orchestrator's reported steps and its progress
 *  phase. A stage nothing has touched waits; the revision that was not needed is skipped once the idea is finished. */
export function stageRows(v: DevelopmentView | null): StageRow[] {
  const steps = ((v?.job.result?.steps as DevelopmentStep[] | undefined) ?? []);
  const active = v ? isActiveStatus(v.job.status) : false;
  const finished = v?.job.status === 'COMPLETED';
  const phase = v?.job.progress?.phase;
  return DEVELOPMENT_STAGES.map((stage) => {
    const w = STAGE_WORDS[stage];
    const kids = (v?.stages ?? []).filter((s) => s.stage === stage);
    const kid = kids[kids.length - 1];
    const step = steps.find((s) => s.stage === stage);
    const base = { stage, label: w.label, who: w.who, startedAt: kid?.startedAt, finishedAt: kid?.finishedAt };
    if (step) return { ...base, state: step.status === 'done' ? 'done' : step.status, note: step.status === 'skipped' ? step.reason : step.status === 'failed' ? step.reason : undefined };
    if (kid?.status === 'FAILED' || kid?.status === 'CANCELLED') return { ...base, state: 'failed', note: kid.status === 'CANCELLED' ? 'Stopped here.' : 'It stopped here; the reason is under Details.' };
    if (kid && isActiveStatus(kid.status)) return { ...base, state: 'running', note: kid.progress?.message ?? (phase === stagePhase(stage) ? v?.job.progress?.message : undefined) };
    if (kid?.status === 'COMPLETED') return { ...base, state: 'done' };
    if (active && phase === stagePhase(stage)) return { ...base, state: 'running', note: v?.job.progress?.message };
    if (stage === 'PROPOSAL' && v?.proposal) return { ...base, state: 'done' };
    if (finished) return { ...base, state: stage === 'REVISION' ? 'skipped' : 'done', note: stage === 'REVISION' ? 'No revision was needed.' : undefined };
    if (v?.job.status === 'FAILED' && phase === stagePhase(stage)) return { ...base, state: 'failed', note: 'It stopped here; the reason is under Details.' };
    return { ...base, state: 'waiting' };
  });
}

/** "0:42", "12:04" — elapsed time of a stage or the whole idea. */
export function elapsed(from?: string, to?: string, now = Date.now()): string {
  if (!from) return '';
  const a = Date.parse(from.includes('T') ? from : from.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'));
  const b = to ? Date.parse(to.includes('T') ? to : to.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')) : now;
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return '';
  const s = Math.round((b - a) / 1000); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
}

// ------------------------------------------------------------------------------------------------- engines

export interface EngineReading {
  /** null while the first answer is on its way */
  storyOk: boolean | null;
  intakePaused: boolean;
  intakeReason?: string;
  /** false until /api/health answered (a reading without it is still checking) */
  intakeKnown?: boolean;
}

/** Whether Auto can start, and if not, the honest sentence. */
export function autoAvailability(e: EngineReading): { state: 'checking' | 'ready' | 'unavailable'; title?: string; why?: string } {
  if (e.intakePaused) return { state: 'unavailable', title: 'The studio is not taking new work right now', why: `${e.intakeReason ? `${e.intakeReason.replace(/\.$/, '')}. ` : ''}Auto ideas will be back when the studio resumes. You can write the brief yourself now.` };
  if (e.storyOk === null || e.intakeKnown === false) return { state: 'checking' };
  if (!e.storyOk) return { state: 'unavailable', title: 'The story engine is offline', why: 'The studio cannot write ideas until it is back. You can write the brief yourself now.' };
  return { state: 'ready' };
}

export interface ResearchSource { platform: string; status: string }
const PLATFORM_WORDS: Record<string, string> = { TIKTOK: 'TikTok', INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook', YOUTUBE: 'YouTube', NEWS: 'news', WIKIPEDIA: 'Wikipedia' };
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** One sentence about which research sources the studio can reach (GET /api/research/sources). */
export function researchLine(r: { enabled: boolean; sources: ResearchSource[] } | null): string {
  if (!r) return '';
  if (!r.enabled) return 'Trend research is switched off in Settings; the idea will be original.';
  const ready = r.sources.filter((s) => s.status === 'READY').map((s) => PLATFORM_WORDS[s.platform] ?? s.platform);
  if (!ready.length) return 'No research source is reachable; the idea will be original.';
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return `${cap(list(ready))} ${ready.length === 1 ? 'is' : 'are'} reachable. The others need access the studio does not have.`;
}

/** The facts line of the preview: "Short · Cartoon · English · 1 min · 9:16". */
export function slateOf(kind: CreateKind, x: { style?: Style; language?: Language; dialect?: Dialect; seconds?: number; aspect?: Aspect }): string[] {
  const k = { show: 'Show', season: 'Season', episode: 'Episode', short: 'Short', 'music-video': 'Music video' }[kind];
  return [k, x.style ? STYLE_WORDS[x.style].label : null, x.language ? languageWords(x.language, x.language === 'AR' ? x.dialect : undefined) : null, x.seconds ? lengthWords(x.seconds) : null, x.aspect ? ASPECT_WORDS[x.aspect].label : null].filter((s): s is string => Boolean(s));
}

