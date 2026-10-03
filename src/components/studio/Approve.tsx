'use client';

import { useState } from 'react';
import { approveStage, useProductionPipeline } from '@/studio/org';
import { T } from '@/lib/copy';
import { useToast } from '@/components/ui/toast';
import { Button, Notice, Status } from '@/components/ui/kit';
import { IconCheck } from '@/components/ui/icons';
import { fmtAgo } from '@/lib/format';

/** A HUMAN GATE in the workspace: the story before production, the cut before export. Shows whether the stage is
 *  approved (by whom, when) or offers the decision; the worker refuses the gated job until it is given. */
export function StageGate({ productionId, stage, title, hint, disabled }: { productionId: string; stage: 'STORY' | 'EDIT'; title: string; hint: string; disabled?: boolean }) {
  const toast = useToast();
  const { data, reload } = useProductionPipeline(productionId);
  const [busy, setBusy] = useState<string | null>(null);
  const row = data?.stages.find((s) => s.id === stage);
  const approval = row?.approval ?? null;
  const decide = async (decision: 'APPROVED' | 'CHANGES') => {
    setBusy(decision);
    try { await approveStage(productionId, { stage, decision, by: 'producer' }); toast.ok(T('toast.saved')); reload(); } catch (e) { toast.bad((e as Error).message); } finally { setBusy(null); }
  };
  if (!data) return null;
  if (approval?.decision === 'APPROVED') return <p className="flex flex-wrap items-center gap-2 text-xs text-muted"><Status tone="ok">{T('gate.approved')}</Status><span>{T('gate.by')} {approval.by} · {fmtAgo(approval.createdAt)}</span><button type="button" className="underline-offset-2 hover:underline" onClick={() => void decide('CHANGES')}>{T('studio.requestChanges')}</button></p>;
  return (
    <Notice tone="warn" title={title} action={<><Button size="sm" variant="primary" icon={<IconCheck />} loading={busy === 'APPROVED'} disabled={disabled || busy !== null} onClick={() => void decide('APPROVED')}>{T('studio.approve')}</Button></>}>
      {hint}{approval ? ` ${T('gate.changesRequested')} (${fmtAgo(approval.createdAt)}).` : ''}
    </Notice>
  );
}

export function useStageApproved(productionId: string, stage: 'STORY' | 'EDIT'): boolean | null {
  const { data } = useProductionPipeline(productionId);
  if (!data) return null;
  return data.stages.find((s) => s.id === stage)?.approval?.decision === 'APPROVED';
}
