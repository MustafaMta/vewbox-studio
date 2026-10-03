import type { Character, StudioState } from '@/domain/types';
import type { Job } from '@/domain/jobs';
import { approval, identityStatus, imageJobs } from '@/components/character/identity';

/** WHAT WAITS FOR THE PRODUCER (docs/DESIGN-SYSTEM-V4.md §5.1 "needs-you count", §6.14, §7.6 Decide, §8.6 B7) — from
 *  real state only, never estimated:
 *    - a pipeline gate awaiting approval (GET /api/studio/org/pipeline, a stage with status AWAITING_APPROVAL), for a
 *      production that is not finished — the same rows the Production page lists;
 *    - a character whose canonical image is a draft the producer can approve now (identity state: drawn, not
 *      approved, not locked, nothing being redrawn) — until image approvals join the pipeline queue (B7).
 *  When the pipeline has not answered, its part is unknown and only what is known is counted (`complete: false`). */

export interface PipelineRow { productionId: string; stages: Array<{ id: string; status: string; at: string | null }> }

export type Decision =
  | { kind: 'stage'; id: string; productionId: string; stage: string; title: string; titleAr?: string; at: string | null; href: string }
  | { kind: 'image'; id: string; characterId: string; name: string; nameAr?: string; at: string | null; href: string };

export interface Decisions { items: Decision[]; count: number; /** false while the pipeline's part is not known */ complete: boolean }

const imageWaiting = (c: Character, jobs: Job[]) => approval(identityStatus(c), Boolean(imageJobs(c, jobs).running)).can;

export function waitingDecisions(state: Pick<StudioState, 'productions' | 'characters' | 'shows'>, pipeline: PipelineRow[] | null, jobs: Job[]): Decisions {
  const items: Decision[] = [];
  for (const p of state.productions) {
    if (p.stage === 'COMPLETE') continue;
    const row = pipeline?.find((r) => r.productionId === p.id);
    const stage = row?.stages.find((s) => s.status === 'AWAITING_APPROVAL');
    if (!stage) continue;
    const title = p.kind === 'MUSIC_VIDEO' ? (p.song?.title || p.title) : p.title;
    // the decision is made on its card in Production (it opens the card; it never approves from here)
    items.push({ kind: 'stage', id: `stage:${p.id}:${stage.id}`, productionId: p.id, stage: stage.id, title, titleAr: p.titleAr, at: stage.at, href: '/production#needs-you' });
  }
  for (const c of state.characters) {
    if (!imageWaiting(c, jobs)) continue;
    items.push({ kind: 'image', id: `image:${c.id}`, characterId: c.id, name: c.name, nameAr: c.nameAr, at: c.canonicalImage?.generatedAt ?? null, href: `/characters/${encodeURIComponent(c.id)}` });
  }
  return { items, count: items.length, complete: pipeline !== null };
}
