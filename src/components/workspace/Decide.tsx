'use client';

import { useState } from 'react';
import type { Production } from '@/domain/types';
import { approvalSubjectHash, type GatedStage } from '@/domain/approvals';
import { useStudio } from '@/studio/store';
import { useLive, useProductionPipeline } from '@/studio/org';
import { useToast } from '@/components/ui/toast';
import { Button, SectionHead, StateWord } from '@/components/ui/kit';
import { IconCheck } from '@/components/ui/icons';
import { shortWhen } from '@/components/home/model';
import { GenButton, type StudioGate } from './gate';
import { IconFinalCut } from '@/components/ui/icons';

/** THE PRODUCER'S DECISIONS IN THE WORKSPACE — the two human gates bound to what they approve (the story; the cut),
 *  the stale-cut notice, and what was removed and can come back. Writes go to the server's own routes; nothing here
 *  starts a job by itself. */

type Approval = { decision: string; by: string; createdAt: string; current?: boolean } | null;

/** Whether a gated stage is approved for what it is now (an approval of an earlier version is not current). */
export function useGate(p: Production, stage: GatedStage): { approved: boolean | null; approval: Approval; reload: () => void } {
  const { data, reload } = useProductionPipeline(p.id);
  const row = data?.stages.find((s) => s.id === stage);
  const approval = (row?.approval ?? null) as Approval;
  if (!data) return { approved: null, approval: null, reload };
  return { approved: approval?.decision === 'APPROVED' && approval.current !== false, approval, reload };
}

/** A human gate (the story before filming, the cut before export): approved by whom and when, or the decision,
 *  sent with the hash of exactly what the producer is looking at. When it changed meanwhile (409), the page says so and
 *  shows the current version for a fresh look; nothing is approved behind the producer's back. */
export function ApprovalGate({ p, stage, what }: { p: Production; stage: GatedStage; what: string }) {
  const toast = useToast();
  const { approved, approval, reload } = useGate(p, stage);
  const [busy, setBusy] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const decide = async (decision: 'APPROVED' | 'CHANGES') => {
    setBusy(decision); setChanged(false);
    try {
      const r = await fetch(`/api/studio/org/productions/${encodeURIComponent(p.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage, decision, by: 'producer', subjectHash: approvalSubjectHash(p, stage) }) });
      if (r.status === 409) { setChanged(true); reload(); return; }
      if (!r.ok) { const b = await r.json().catch(() => null) as { error?: { message?: string } } | null; throw new Error(b?.error?.message ?? `The decision could not be saved (${r.status}).`); }
      toast.ok(decision === 'APPROVED' ? `You approved the ${what}.` : 'Changes requested.');
      reload();
    } catch (e) { toast.bad((e as Error).message); } finally { setBusy(null); }
  };
  if (approved === null) return null;
  if (approved && approval) return (
    <div className="ws-gate" data-state="done">
      <StateWord tone="done">You approved the {what}</StateWord>
      <span className="t-meta">{approval.by} · {shortWhen(approval.createdAt)}</span>
      <Button size="sm" variant="quiet" loading={busy === 'CHANGES'} onClick={() => void decide('CHANGES')}>Request changes</Button>
    </div>
  );
  return (
    <div className="ws-gate" data-state="waiting" role="group" aria-label={`Approve the ${what}`}>
      <span className="ws-gate-words">
        <span className="t-title">{changed ? `The ${what} changed while you were looking at it` : approval?.decision === 'APPROVED' ? `The ${what} changed since you approved it` : `Approve the ${what}`}</span>
        <span className="t-body">{changed ? 'This is the current version: look at it again, then decide.' : stage === 'STORY' ? 'Filming waits for your approval of this story.' : 'The export waits for your approval of this cut.'}</span>
      </span>
      <span className="ws-actions">
        <Button size="sm" variant="quiet" loading={busy === 'CHANGES'} disabled={busy !== null} onClick={() => void decide('CHANGES')}>Request changes</Button>
        <Button size="sm" variant="primary" icon={<IconCheck aria-hidden />} loading={busy === 'APPROVED'} disabled={busy !== null} onClick={() => void decide('APPROVED')}>Approve</Button>
      </span>
    </div>
  );
}

/** The cut is out of date (a take was selected, rated or removed, or a shot changed since it was assembled): said where
 *  the cut is shown, with the real action that makes it current. */
export function StaleCut({ p, gate }: { p: Production; gate: StudioGate }) {
  if (!p.cutStale || !p.cutAssetId) return null;
  return (
    <div className="ws-gate" data-state="waiting" role="status">
      <span className="ws-gate-words">
        <span className="t-title">The cut is out of date</span>
        <span className="t-body">A take or a shot changed since it was assembled. Assemble it again to see the film as it is now.</span>
      </span>
      <GenButton gate={gate} type="ASSEMBLE" payload={{ productionId: p.id }} target={{ productionId: p.id }} icon={<IconFinalCut aria-hidden />}>Assemble the cut again</GenButton>
    </div>
  );
}

interface Removed { kind: 'production' | 'scene' | 'shot' | 'take'; id: string; productionId: string; label: string; deletedAt: string; deletedBy: string | null; takes: number }
const KIND: Record<Removed['kind'], string> = { production: 'Production', scene: 'Scene', shot: 'Shot', take: 'Take' };

/** RECENTLY REMOVED — the scenes, shots and takes this production lost (by hand, or when a story step was run again),
 *  newest first, each with the takes it holds and Restore. Quiet: one list at the end of the map, absent when empty. */
export function RecentlyRemoved({ p }: { p: Production }) {
  const { refresh } = useStudio();
  const toast = useToast();
  const { data, reload } = useLive<{ items: Removed[] }>(`/api/studio/deleted?productionId=${encodeURIComponent(p.id)}`, [p.updatedAt]);
  const [busy, setBusy] = useState<string | null>(null);
  const items = (data?.items ?? []).filter((x) => x.kind !== 'production');
  if (items.length === 0) return null;
  const restore = async (x: Removed) => {
    setBusy(x.id);
    try {
      const r = await fetch('/api/studio/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: x.kind, id: x.id }) });
      const b = await r.json().catch(() => null) as { skipped?: Array<{ takeId: string; reason: string }>; error?: { message?: string } } | null;
      if (!r.ok) throw new Error(b?.error?.message ?? `It could not be restored (${r.status}).`);
      toast.ok(b?.skipped?.length ? `${KIND[x.kind]} restored; ${b.skipped.length} ${b.skipped.length === 1 ? 'take' : 'takes'} could not come back (the file is gone).` : `${KIND[x.kind]} restored.`);
      await refresh(); reload();
    } catch (e) { toast.bad((e as Error).message); } finally { setBusy(null); }
  };
  return (
    <section className="ws-sec" aria-labelledby="ws-removed-h" id="removed">
      <SectionHead id="ws-removed-h" title="Recently removed" count={items.length} description="Nothing is lost when a scene, shot or take is removed, or when a story step is run again: bring it back here." />
      <ol className="ws-versions" role="list">
        {items.map((x) => (
          <li key={`${x.kind}:${x.id}`}>
            <span className="ws-versions-n">{KIND[x.kind]}</span>
            <span className="ws-ro ws-versions-t">{shortWhen(x.deletedAt)}</span>
            <span className="ws-versions-d name"><bdi>{x.label}</bdi>{x.takes ? ` · ${x.takes} ${x.takes === 1 ? 'take' : 'takes'}` : ''}{x.deletedBy ? ` · removed by ${x.deletedBy}` : ''}</span>
            <Button size="sm" variant="quiet" loading={busy === x.id} disabled={busy !== null} onClick={() => void restore(x)}>Restore</Button>
          </li>
        ))}
      </ol>
    </section>
  );
}
