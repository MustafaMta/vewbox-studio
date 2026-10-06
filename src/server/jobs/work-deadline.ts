import type { Job } from '@/domain/jobs';
import type { Production } from '@/domain/types';
import { env } from '../env';
import { log } from '../log';
import { llmSpeed, resolveProvider } from '../providers/llm';
import { planOutputTokens, sceneBudget } from '../story/engine';
import { planShotsWorkMs } from './deadlines';

/** A shot-plan prompt as the planner sends it, at most (the measured prompts were 3.4–4.1K tokens, MODEL-EVAL §6/§9). */
const PLAN_PROMPT_TOKENS = 4500;

/** The work of planning these scenes: per scene the answer tokens of the most shots it may take and the number of
 *  parts the context needs for them (pure; the planner's own budget and split rule, src/server/story/engine.ts). */
export function planShotsWork(p: Pick<Production, 'targetSeconds' | 'scenes'>, sceneIds: string[] | undefined, contextTokens: number): Array<{ answerTokens: number; parts: number }> {
  const targets = sceneIds?.length ? p.scenes.filter((sc) => sceneIds.includes(sc.id)) : p.scenes;
  const room = Math.max(2048, contextTokens - PLAN_PROMPT_TOKENS);
  return targets.map((sc) => { const answerTokens = planOutputTokens(sceneBudget(p, sc.beats.length)); return { answerTokens, parts: Math.ceil(answerTokens / room) }; });
}

/** The deadline a job's own work asks for, when it is longer than its flat value (src/server/jobs/deadlines.ts):
 *  PLAN_SHOTS scales with its scenes and the story model's measured speed. Undefined for every other job, and when the
 *  production cannot be read (the flat deadline applies). */
export async function workDeadlineMs(job: Pick<Job, 'type' | 'payload'>): Promise<number | undefined> {
  if (job.type !== 'PLAN_SHOTS') return undefined;
  try {
    const { productionId, sceneIds, performanceOnly } = job.payload as { productionId?: string; sceneIds?: string[]; performanceOnly?: boolean };
    if (performanceOnly || !productionId) return undefined;
    const { readState } = await import('../studio/engine');
    const p = (await readState()).state.productions.find((x) => x.id === productionId);
    if (!p) return undefined;
    const cfg = resolveProvider();
    return planShotsWorkMs(planShotsWork(p, sceneIds, env().OLLAMA_CONTEXT_LENGTH), llmSpeed(cfg.model, cfg.provider, cfg.baseUrl));
  } catch (e) {
    log.warn({ err: (e as Error).message, type: job.type }, 'work deadline: could not size the job; the flat deadline applies');
    return undefined;
  }
}
