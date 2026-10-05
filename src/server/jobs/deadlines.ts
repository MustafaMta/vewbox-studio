import type { JobType } from '@/domain/jobs';

/** JOB DEADLINES (docs/BACKEND-AUDIT-2026-10.md H5, step 4) — how long one attempt of a job may run before the worker
 *  aborts it (its signal kills ffmpeg children, aborts provider calls, cancels its ComfyUI prompt) and records it
 *  FAILED (INFRASTRUCTURE, reason DEADLINE; retried while attempts remain). Generous on purpose: about twice the
 *  agent's own limit (src/server/org/model.ts) or the longest measured run — a local MiniMax H3 render takes up to
 *  90 min, so GENERATE_TAKE gets 3 h. Orchestrators wait on children that have their own deadlines, so theirs only
 *  catches a stuck parent.
 *
 *  Environment: JOB_DEADLINES=enforce (default) | log (record when one passes, do not stop) | off;
 *  JOB_DEADLINE_SCALE multiplies every value (e.g. 2 on a slow machine). */

const MIN = 60_000;
const HOUR = 60 * MIN;

export const JOB_DEADLINE_MS: Record<JobType, number> = {
  AUTO_IDEA: 2 * HOUR, DEVELOP_STORY: 40 * MIN, WRITE_SCRIPT: 40 * MIN, PLAN_SHOTS: 60 * MIN,
  CHARACTER_APPEARANCE: 60 * MIN, CHARACTER_REFS: 60 * MIN, LOCATION_PLATES: 60 * MIN, SHOT_FRAMES: 40 * MIN,
  GENERATE_TAKE: 3 * HOUR, CORRECT_LIPSYNC: 60 * MIN,
  VOICE_BUILD: 60 * MIN, VOICE_PREVIEW: 20 * MIN, DIALOGUE_AUDIO: 2 * HOUR, VOICE_DESIGN: 60 * MIN,
  GENERATE_SONG: 60 * MIN,
  ASSEMBLE: 2 * HOUR, EXPORT: 2 * HOUR, MEDIA_PROBE: 20 * MIN,
  PRODUCE: 48 * HOUR, CREATE_CHARACTER: 6 * HOUR,
  EPISODE_CONTINUITY: 20 * MIN, DESIGN_CHARACTER: 20 * MIN,
  IDEA_RESEARCH: 40 * MIN, IDEA_AUDIENCE: 40 * MIN, IDEA_CONCEPTS: 40 * MIN, IDEA_WRITE: 40 * MIN, IDEA_REVIEW: 40 * MIN,
};

export type DeadlineMode = 'enforce' | 'log' | 'off';

/** The deadline of one attempt of `type` under this environment. */
export function jobDeadline(type: JobType, env: Record<string, string | undefined> = process.env): { ms: number; mode: DeadlineMode } {
  const mode: DeadlineMode = env.JOB_DEADLINES === 'off' || env.JOB_DEADLINES === 'log' ? env.JOB_DEADLINES : 'enforce';
  const scale = Number(env.JOB_DEADLINE_SCALE);
  const ms = Math.round(JOB_DEADLINE_MS[type] * (Number.isFinite(scale) && scale > 0 ? scale : 1));
  return { ms, mode };
}
