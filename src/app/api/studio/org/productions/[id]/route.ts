import { json, params, readJson, route } from '@/server/http';
import { bootstrap } from '@/server/bootstrap';
import { listAgentRuns, listApprovals, listHandoffs, listQaReports, listStudioEvents, recordApproval } from '@/server/org/runs';
import { PIPELINE, type PipelineStage } from '@/server/org/model';
import { StudioError } from '@/domain/errors';
import { approvalSubjectHash, isGatedStage } from '@/domain/approvals';
import { readState } from '@/server/studio/engine';

export const dynamic = 'force-dynamic';

/** One production's passage through the pipeline: handoffs per stage, QA reports, approvals, agent runs, events.
 *  BOUND APPROVALS (docs/BACKEND-AUDIT-2026-10.md H9, step 9): `subjects` carries the current hash of each gated
 *  stage's subject (the story, the cut — src/domain/approvals.ts); a stage whose latest approval was given to another
 *  version of its subject is AWAITING_APPROVAL again, and its approval says `current: false`. */
export const GET = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  await bootstrap();
  const { id } = await params(ctx);
  const [handoffs, qa, approvals, runs, events, snap] = await Promise.all([listHandoffs(id), listQaReports({ productionId: id }), listApprovals(id), listAgentRuns({ productionId: id, limit: 200 }), listStudioEvents({ productionId: id, limit: 100 }), readState()]);
  const p = snap.state.productions.find((x) => x.id === id);
  const subjects = p ? { STORY: approvalSubjectHash(p, 'STORY'), EDIT: approvalSubjectHash(p, 'EDIT') } : {};
  const current = (a: (typeof approvals)[number]) => !a.subjectHash || !isGatedStage(a.stage) || subjects[a.stage as 'STORY' | 'EDIT'] === a.subjectHash;
  const stages = PIPELINE.map((s) => {
    const h = handoffs.find((x) => x.stage === s.id);
    const a = approvals.find((x) => x.stage === s.id);
    const deps = s.dependsOn.map((d) => ({ stage: d, done: Boolean(handoffs.find((x) => x.stage === d && x.qualityStatus === 'VALIDATED')) }));
    // a human approval settles a gated stage even when the work was done by hand (no recorded handoff) — while the
    // subject it approved is still the one there
    const status = a?.decision === 'APPROVED' ? (current(a) ? 'DONE' : 'AWAITING_APPROVAL') : a && a.decision !== 'APPROVED' ? 'REJECTED' : h ? (h.qualityStatus === 'VALIDATED' ? (s.approval ? 'AWAITING_APPROVAL' : 'DONE') : 'INVALID') : deps.every((d) => d.done) ? 'READY' : 'BLOCKED';
    return { ...s, status, handoff: h ?? null, approval: a ? { ...a, current: current(a) } : null, dependencies: deps };
  });
  return json({ productionId: id, stages, handoffs, qa, approvals: approvals.map((a) => ({ ...a, current: current(a) })), runs, events, subjects }, { headers: { 'Cache-Control': 'no-store' } });
});

/** A human decision on a stage: `{ stage, decision: APPROVED|REJECTED|CHANGES, note?, by?, subjectHash? }`.
 *  The approval records the hash of the stage's subject as it is now; `subjectHash` (optional) is the hash of what
 *  the page showed the producer (src/domain/approvals.ts `approvalSubjectHash`, from the page's copy of the studio):
 *  when it differs from the current one, the decision is refused (409 CONFLICT) — the producer approves exactly what
 *  they saw, never a version that changed under them. */
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  await bootstrap();
  const { id } = await params(ctx);
  const body = await readJson<{ stage: PipelineStage; decision: 'APPROVED' | 'REJECTED' | 'CHANGES'; note?: string; by?: string; subjectKind?: string; subjectId?: string; subjectHash?: string }>(req);
  if (!PIPELINE.some((s) => s.id === body.stage)) throw new StudioError('INVALID', `Unknown stage ${String(body.stage)}`);
  if (!['APPROVED', 'REJECTED', 'CHANGES'].includes(body.decision)) throw new StudioError('INVALID', 'decision must be APPROVED, REJECTED or CHANGES');
  if (body.subjectHash !== undefined && (typeof body.subjectHash !== 'string' || body.subjectHash.length > 80)) throw new StudioError('INVALID', 'subjectHash must be the hash the page computed (a short string).');
  const snap = await readState();
  const p = snap.state.productions.find((x) => x.id === id);
  if (!p) throw new StudioError('NOT_FOUND', 'Production not found');
  const subjectHash = isGatedStage(body.stage) ? approvalSubjectHash(p, body.stage) : undefined;
  if (subjectHash && body.subjectHash && body.subjectHash !== subjectHash) throw new StudioError('CONFLICT', `The ${body.stage === 'STORY' ? 'story' : 'cut'} changed while you were looking at it; review it again before deciding.`, { stage: body.stage, seen: body.subjectHash, current: subjectHash });
  const approvalId = await recordApproval({ productionId: id, stage: body.stage, subjectKind: body.subjectKind ?? 'STAGE', subjectId: body.subjectId ?? body.stage, decision: body.decision, by: (body.by ?? 'producer').slice(0, 80), note: body.note?.slice(0, 1000), subjectHash, subjectVersion: snap.version });
  return json({ approvalId, subjectHash }, { status: 201 });
});
