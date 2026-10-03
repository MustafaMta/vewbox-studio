import type { Production, Take } from '@/domain/types';

/** WHAT TO EXPECT OF A TAKE (docs/CONTRACTS-REDESIGN-BACKEND.md B9; docs/DESIGN-SYSTEM-V5.md §8.11 "takes here took
 *  ~3 min", "last take took 2 min 50 s") — from the production's own takes, never estimated: the median generation
 *  time of its accepted takes, per production and per model, and the newest one. Pure over `Production`. */

export interface ModelExpectation { model: string; count: number; medianGenerationMs: number }
export interface TakeExpectations {
  /** accepted takes with a recorded generation time (bundled sample clips and rejected takes never count) */
  count: number;
  medianGenerationMs: number | null;
  /** the newest accepted take's time ("last take took …") */
  lastGenerationMs: number | null;
  byModel: ModelExpectation[];
}

/** An accepted take the clock can learn from: made by an engine (not a bundled sample), not rejected by the inspectors
 *  or the producer, with a positive generation time. */
export const countsForExpectation = (t: Take): t is Take & { generationMs: number } => t.status === 'READY' && t.rating !== 'REJECTED' && t.provider !== 'SAMPLE' && typeof t.generationMs === 'number' && t.generationMs > 0;

/** The median of a list (the mean of the two middle values when even); null for an empty list. */
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function takeExpectations(p: Pick<Production, 'shots'>, opts: { shotId?: string } = {}): TakeExpectations {
  const takes = p.shots.filter((sh) => !opts.shotId || sh.id === opts.shotId).flatMap((sh) => sh.takes).filter(countsForExpectation);
  const byModelMap = new Map<string, number[]>();
  for (const t of takes) { const k = t.model ?? 'unknown'; byModelMap.set(k, [...(byModelMap.get(k) ?? []), t.generationMs]); }
  const byModel = [...byModelMap].map(([model, ms]) => ({ model, count: ms.length, medianGenerationMs: median(ms)! })).sort((a, b) => b.count - a.count || a.model.localeCompare(b.model));
  const newest = [...takes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return { count: takes.length, medianGenerationMs: median(takes.map((t) => t.generationMs)), lastGenerationMs: newest?.generationMs ?? null, byModel };
}

/** The medians across several productions, per model (the engine room's view). */
export function expectationsByModel(productions: Array<Pick<Production, 'shots'>>): ModelExpectation[] {
  const all = new Map<string, number[]>();
  for (const p of productions) for (const sh of p.shots) for (const t of sh.takes) if (countsForExpectation(t)) { const k = t.model ?? 'unknown'; all.set(k, [...(all.get(k) ?? []), t.generationMs]); }
  return [...all].map(([model, ms]) => ({ model, count: ms.length, medianGenerationMs: median(ms)! })).sort((a, b) => b.count - a.count || a.model.localeCompare(b.model));
}
