import type { JobProgress } from '@/domain/jobs';

/** ORCHESTRATION AS DATA (docs/BACKEND-AUDIT-2026-10.md M1, step 14) — how a planner's pass ends without finishing:
 *  `return waitFor({ jobIds, plan, progress })`. The worker records the dependencies and the plan, frees its slot, and
 *  the job becomes WAITING (src/server/jobs/queue.ts suspend); when every job it waits for has settled it is queued
 *  again and the next pass reads `ctx.job.plan`. */

export const WAIT = '__waitFor' as const;
export interface WaitRequest { jobIds: string[]; plan: Record<string, unknown>; progress?: JobProgress }
export type WaitResult = { [WAIT]: WaitRequest };

export const waitFor = (req: WaitRequest): WaitResult => ({ [WAIT]: req });
export const waitRequestOf = (r: unknown): WaitRequest | undefined => (r && typeof r === 'object' && WAIT in r ? (r as WaitResult)[WAIT] : undefined);
