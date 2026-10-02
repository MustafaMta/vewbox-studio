import { json, route } from '@/server/http';
import { bootstrap } from '@/server/bootstrap';
import { db, schema } from '@/server/db/client';
import { PIPELINE } from '@/server/org/model';
import { desc, inArray } from 'drizzle-orm';
import { readState } from '@/server/studio/engine';

export const dynamic = 'force-dynamic';

/** Every production's position in the pipeline in one call (for the Production area): per stage, DONE / AWAITING_APPROVAL /
 *  REJECTED / INVALID / READY / BLOCKED, derived from the recorded handoffs and approvals. */
export const GET = route(async () => {
  await bootstrap();
  const { state } = await readState();
  const ids = state.productions.map((p) => p.id);
  if (!ids.length) return json({ productions: [] }, { headers: { 'Cache-Control': 'no-store' } });
  const [handoffs, approvals] = await Promise.all([
    db().select().from(schema.handoffs).where(inArray(schema.handoffs.productionId, ids)).orderBy(desc(schema.handoffs.createdAt)),
    db().select().from(schema.approvals).where(inArray(schema.approvals.productionId, ids)).orderBy(desc(schema.approvals.createdAt)),
  ]);
  const productions = ids.map((id) => {
    const hs = handoffs.filter((h) => h.productionId === id);
    const as = approvals.filter((a) => a.productionId === id);
    const stages = PIPELINE.map((s) => {
      const h = hs.find((x) => x.stage === s.id);
      const a = as.find((x) => x.stage === s.id);
      const depsDone = s.dependsOn.every((d) => hs.some((x) => x.stage === d && x.qualityStatus === 'VALIDATED'));
      const status = a?.decision === 'APPROVED' ? 'DONE' : a && a.decision !== 'APPROVED' ? 'REJECTED' : h ? (h.qualityStatus === 'VALIDATED' ? (s.approval ? 'AWAITING_APPROVAL' : 'DONE') : 'INVALID') : depsDone ? 'READY' : 'BLOCKED';
      return { id: s.id, department: s.department, status, at: h?.createdAt ?? null, failed: h && !h.validation.ok ? h.validation.checks.filter((c) => !c.ok).map((c) => c.name) : [] };
    });
    return { productionId: id, stages };
  });
  return json({ productions }, { headers: { 'Cache-Control': 'no-store' } });
});
