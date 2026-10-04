import { z } from 'zod';
import { StudioError } from '@/domain/errors';
import type { Job } from '@/domain/jobs';
import { readState } from '../studio/engine';
import { enqueue } from './queue';

/** TARGETED REGENERATION (docs/BACKEND-AUDIT-2026-10.md step 14): "a failed shot must never require restarting the
 *  entire film". One shot gets a new take (GENERATE_TAKE for that shot alone), or one dialogue line is recorded again
 *  (DIALOGUE_AUDIO for that line alone, even when its recording is current) — nothing else of the production is
 *  queued, re-planned or touched. A new take is added beside the shot's others; it replaces the chosen take only when
 *  `select` is asked for and it passes its checks. A request carrying an `idempotencyKey` is one job however often it
 *  is sent. */

export const RegenerateInput = z.object({
  shotId: z.string().min(1).max(80),
  lineId: z.string().min(1).max(80).optional(),
  /** a new take becomes the shot's choice when it passes its checks */
  select: z.boolean().optional(),
  prompt: z.string().max(4000).optional(),
  seed: z.number().int().optional(),
  idempotencyKey: z.string().min(4).max(200).optional(),
}).strict();
export type RegenerateInput = z.infer<typeof RegenerateInput>;

export async function regenerate(productionId: string, input: RegenerateInput): Promise<{ job: Job; created: boolean; scope: 'shot' | 'line' }> {
  const { state } = await readState({ shared: true });
  const p = state.productions.find((x) => x.id === productionId);
  if (!p) throw new StudioError('NOT_FOUND', `Production ${productionId} was not found.`, { productionId });
  const sh = p.shots.find((x) => x.id === input.shotId);
  if (!sh) throw new StudioError('NOT_FOUND', `Shot ${input.shotId} was not found in “${p.title}”.`, { productionId, shotId: input.shotId });
  const key = input.idempotencyKey ? `regenerate:${productionId}:${input.shotId}:${input.lineId ?? 'take'}:${input.idempotencyKey}` : undefined;
  if (input.lineId) {
    const line = sh.dialogue.find((d) => d.id === input.lineId);
    if (!line) throw new StudioError('NOT_FOUND', `Line ${input.lineId} was not found in shot ${sh.number}.`, { shotId: sh.id, lineId: input.lineId });
    const r = await enqueue({ type: 'DIALOGUE_AUDIO', payload: { productionId, shotIds: [sh.id], lineIds: [line.id], force: true }, idempotencyKey: key });
    return { ...r, scope: 'line' };
  }
  const r = await enqueue({ type: 'GENERATE_TAKE', payload: { productionId, shotId: sh.id, ...(input.select ? { select: true } : {}), ...(input.prompt ? { prompt: input.prompt } : {}), ...(input.seed !== undefined ? { seed: input.seed } : {}) }, idempotencyKey: key });
  return { ...r, scope: 'shot' };
}
