import type { Asset, Production, Shot, StudioState, Take } from '@/domain/types';
import type { NewTakeInput } from '@/domain/actions';
import { commands, type CommandSpec } from '@/server/studio/engine';
import { announceQaReport, insertQaReport, type NewQaReport } from '@/server/org/runs';
import { insertWorldRead, type WorldReadRecord } from '@/server/world/store';
import { outputId } from '@/server/jobs/outputs';

/** A TAKE'S RESULT, COMMITTED ONCE (docs/BACKEND-AUDIT-2026-10.md C2, step 6). Everything a GENERATE_TAKE attempt
 *  records — the poster and video assets (and the joined soundtrack when it is new), the take with its provenance, its
 *  selection, the inspectors' QA reports and the World Bible read — goes into ONE command batch and ONE transaction,
 *  under ids derived from the job (src/server/jobs/outputs.ts). A crash before the commit leaves only files, which the
 *  next attempt's GC removes; a crash after it leaves a complete take, which the next attempt finds and returns instead
 *  of generating again. Never two takes for one request. */

/** The take a GENERATE_TAKE job records: its id is the job's. */
export const takeIdOf = (jobId: string): string => outputId(jobId, 'take', 'take');

/** The take this job already committed (an earlier attempt that crashed after its commit), with its shot. */
export function committedTake(state: StudioState, jobId: string): { production: Production; shot: Shot; take: Take } | undefined {
  const id = takeIdOf(jobId);
  for (const production of state.productions) for (const shot of production.shots) { const take = shot.takes.find((t) => t.id === id); if (take) return { production, shot, take }; }
  return undefined;
}

export interface TakeCommit {
  jobId: string;
  productionId: string;
  shotId: string;
  /** the new assets of the take, in order (poster before the video that names it) */
  assets: Array<Omit<Asset, 'createdAt'>>;
  take: Omit<NewTakeInput, 'id'>;
  qa: Array<NewQaReport & { name: string }>;
  worldRead?: Omit<WorldReadRecord, 'takeId'>;
}

/** Commit a take's result as one unit. Returns the take as recorded. */
export async function commitTake(c: TakeCommit): Promise<Take> {
  const id = takeIdOf(c.jobId);
  const batch: CommandSpec[] = [...c.assets.map((a) => ({ name: 'addAsset' as const, args: [a] as [typeof a] })), { name: 'addTake', args: [c.productionId, c.shotId, { ...c.take, id }] }];
  const reports = c.qa.map(({ name, ...r }) => ({ ...r, id: outputId(c.jobId, `qa:${name}`, 'qa'), subjectId: id }));
  const results = await commands(batch, 'worker', {
    seed: `${c.jobId}:take-commit`,
    also: async (tx) => {
      for (const r of reports) await insertQaReport(tx, r);
      if (c.worldRead) await insertWorldRead(tx, { ...c.worldRead, takeId: id });
    },
  });
  for (const r of reports) await announceQaReport(r.id, r).catch(() => undefined);
  return (results.at(-1) as { take: Take }).take;
}
