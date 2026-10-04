import type { JobStatus } from './jobs';

/** RUN PHASES (docs/CONTRACTS-REDESIGN-BACKEND.md B9; docs/DESIGN-SYSTEM-V5.md §8.11 "Queued — Preparing references —
 *  Filming — Checking"). Every job already reports its progress as a status and a free phase word; this is the one
 *  mapping of those onto the five phases a status row shows, recorded as timed events on the agent run so a page can
 *  say how long each one took. Pure: the worker calls `runPhaseOf` on every progress report and records a change. */

export const RUN_PHASES = ['QUEUED', 'PREPARING', 'GENERATING', 'CHECKING', 'FINISHING'] as const;
export type RunPhase = (typeof RUN_PHASES)[number];

export interface RunPhaseEvent { phase: RunPhase; at: string; /** the handler's own words at the change ("Recording 2 lines…") */ message?: string }

/** How the status row names a phase for a job type (English; the pages translate): a take is filmed, a line is
 *  recorded, everything else is generated. */
export const RUN_PHASE_LABELS: Record<RunPhase, string> = { QUEUED: 'Queued', PREPARING: 'Preparing references', GENERATING: 'Generating', CHECKING: 'Checking', FINISHING: 'Finishing' };
export const GENERATING_LABEL: Partial<Record<string, string>> = { GENERATE_TAKE: 'Filming', DIALOGUE_AUDIO: 'Recording', VOICE_BUILD: 'Recording', VOICE_PREVIEW: 'Recording', VOICE_DESIGN: 'Recording', GENERATE_SONG: 'Composing', CHARACTER_APPEARANCE: 'Drawing', CHARACTER_REFS: 'Drawing', LOCATION_PLATES: 'Drawing', SHOT_FRAMES: 'Drawing', ASSEMBLE: 'Rendering', EXPORT: 'Rendering' };
export const runPhaseLabel = (jobType: string, phase: RunPhase): string => (phase === 'GENERATING' ? GENERATING_LABEL[jobType] ?? RUN_PHASE_LABELS.GENERATING : RUN_PHASE_LABELS[phase]);

/** The phase a progress report means. `recording` while PREPARING is still preparation (a take records its lines
 *  before it films); GENERATING and DOWNLOADING are one phase (the engine's wait, its work and the fetch of its
 *  output); VALIDATING is checking; POSTPROCESSING is finishing. A terminal or review status has no phase. */
export function runPhaseOf(status: JobStatus, progressPhase?: string): RunPhase | null {
  switch (status) {
    case 'QUEUED': return 'QUEUED';
    case 'PREPARING': return 'PREPARING';
    case 'GENERATING': case 'DOWNLOADING': return progressPhase === 'preparing' ? 'PREPARING' : 'GENERATING';
    case 'VALIDATING': return 'CHECKING';
    case 'POSTPROCESSING': return 'FINISHING';
    default: return null;
  }
}

/** Studio event kinds that are bookkeeping, not activity: kept for the status row and the run's record, never shown in
 *  an activity list (Production activity, Studio Company recent work, a department's, an agent's or a character's
 *  recent work) and never a reason for an open page to refetch. `listStudioEvents` leaves them out by default. */
export const ACTIVITY_HIDDEN_KINDS = ['RUN_PHASE', 'TOOL_CALL'] as const;
export const isActivityNoise = (kind: string | null | undefined): boolean => Boolean(kind) && (ACTIVITY_HIDDEN_KINDS as readonly string[]).includes(kind!);

/** Each phase's duration from the events (the last one runs to `endAt`, the run's end or now). Pure. */
export function phaseDurations(events: RunPhaseEvent[], endAt: string): Array<{ phase: RunPhase; from: string; to: string; ms: number }> {
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  return sorted.map((e, i) => { const to = sorted[i + 1]?.at ?? endAt; return { phase: e.phase, from: e.at, to, ms: Math.max(0, Date.parse(to) - Date.parse(e.at)) }; });
}
