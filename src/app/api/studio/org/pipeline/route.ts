import { json, route } from '@/server/http';
import { bootstrap } from '@/server/bootstrap';
import { pipelinePositions } from '@/server/org/runs';
import { readState } from '@/server/studio/engine';

export const dynamic = 'force-dynamic';

/** Every production's position in the pipeline in one call (for the Production area and the company diagram). */
export const GET = route(async () => {
  await bootstrap();
  const { state } = await readState();
  const productions = await pipelinePositions(state.productions.map((p) => p.id));
  return json({ productions }, { headers: { 'Cache-Control': 'no-store' } });
});
