import { readState } from './engine';
import { listJobs } from '../jobs/queue';
import { pipelinePositions } from '../org/runs';
import { waitingDecisions, type Decisions } from '@/studio/selectors/decisions';

/** THE DECISIONS, SERVER SIDE (docs/CONTRACTS-REDESIGN-BACKEND.md B8): the shared pure selector run on the
 *  authoritative state, every production's pipeline position and the jobs that are active or parked for review —
 *  the same inputs the shell holds (its snapshot, the pipeline route, its job list), so the two counts agree. */
export async function decisionsNow(): Promise<Decisions & { at: string }> {
  const { state } = await readState();
  const [pipeline, jobs] = await Promise.all([pipelinePositions(state.productions.map((p) => p.id)), listJobs({ activeOnly: true, limit: 500 })]);
  return { ...waitingDecisions(state, pipeline, jobs), at: new Date().toISOString() };
}
