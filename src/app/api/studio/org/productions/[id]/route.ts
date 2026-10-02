import { json, params, readJson, route } from '@/server/http';
import { bootstrap } from '@/server/bootstrap';
import { listAgentRuns, listApprovals, listHandoffs, listQaReports, listStudioEvents, recordApproval } from '@/server/org/runs';
import { PIPELINE, type PipelineStage } from '@/server/org/model';
import { StudioError } from '@/domain/errors';
import { readState } from '@/server/studio/engine';

export const dynamic = 'force-dynamic';

/** One production's passage through the pipeline: handoffs per stage, QA reports, approvals, agent runs, events. */
export const GET = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  await bootstrap();
  const { id } = await params(ctx);
  const [handoffs, qa, approvals, runs, events] = await Promise.all([listHandoffs(id), listQaReports({ productionId: id }), listApprovals(id), listAgentRuns({ productionId: id, limit: 200 }), listStudioEvents({ productionId: id, limit: 100 })]);
  const stages = PIPELINE.map((s) => {
    const h = handoffs.find((x) => x.stage === s.id);
    const a = approvals.find((x) => x.stage === s.id);
    const deps = s.dependsOn.map((d) => ({ stage: d, done: Boolean(handoffs.find((x) => x.stage === d && x.qualityStatus === 'VALIDATED')) }));
    // a human approval settles a gated stage even when the work was done by hand (no recorded handoff)
    const status = a?.decision === 'APPROVED' ? 'DONE' : a && a.decision !== 'APPROVED' ? 'REJECTED' : h ? (h.qualityStatus === 'VALIDATED' ? (s.approval ? 'AWAITING_APPROVAL' : 'DONE') : 'INVALID') : deps.every((d) => d.done) ? 'READY' : 'BLOCKED';
    return { ...s, status, handoff: h ?? null, approval: a ?? null, dependencies: deps };
  });
  return json({ productionId: id, stages, handoffs, qa, approvals, runs, events }, { headers: { 'Cache-Control': 'no-store' } });
});

/** A human decision on a stage: `{ stage, decision: APPROVED|REJECTED|CHANGES, note?, by? }`. */
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  await bootstrap();
  const { id } = await params(ctx);
  const body = await readJson<{ stage: PipelineStage; decision: 'APPROVED' | 'REJECTED' | 'CHANGES'; note?: string; by?: string; subjectKind?: string; subjectId?: string }>(req);
  if (!PIPELINE.some((s) => s.id === body.stage)) throw new StudioError('INVALID', `Unknown stage ${String(body.stage)}`);
  if (!['APPROVED', 'REJECTED', 'CHANGES'].includes(body.decision)) throw new StudioError('INVALID', 'decision must be APPROVED, REJECTED or CHANGES');
  const p = (await readState()).state.productions.find((x) => x.id === id);
  if (!p) throw new StudioError('NOT_FOUND', 'Production not found');
  const approvalId = await recordApproval({ productionId: id, stage: body.stage, subjectKind: body.subjectKind ?? 'STAGE', subjectId: body.subjectId ?? body.stage, decision: body.decision, by: (body.by ?? 'producer').slice(0, 80), note: body.note?.slice(0, 1000) });
  return json({ approvalId }, { status: 201 });
});
