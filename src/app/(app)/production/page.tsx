'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useStudio } from '@/studio/store';
import { approveStage, useLive, useOrg } from '@/studio/org';
import { productionHref, showById } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { PageHeader, Section } from '@/components/ui/page';
import { Button, Status, cls, type Tone } from '@/components/ui/kit';
import { Empty } from '@/components/ui/cinema';
import { StageStatus } from '@/components/library/ProductionTile';
import { IconProduce } from '@/components/ui/icons';
import JobsPage from '../jobs/page';
import { fmtAgo } from '@/lib/format';

interface PipelineRow { productionId: string; stages: Array<{ id: string; department: string; status: string; at: string | null; failed: string[] }> }

const TONE: Record<string, Tone> = { DONE: 'ok', AWAITING_APPROVAL: 'warn', REJECTED: 'bad', INVALID: 'bad', READY: 'info', BLOCKED: 'neutral' };

/** PRODUCTION — every production's position in the pipeline (from the recorded handoffs), what waits for a human
 *  decision, and below it everything the studio is running or has run. */
export default function ProductionPage() {
  const T = useT();
  const { state } = useStudio();
  const toast = useToast();
  const { data: org } = useOrg();
  const { data: pipe, reload } = useLive<{ productions: PipelineRow[] }>('/api/studio/org/pipeline');
  const [busy, setBusy] = useState<string | null>(null);
  const active = [...state.productions].filter((p) => p.stage !== 'COMPLETE').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const decide = async (productionId: string, stage: string, decision: 'APPROVED' | 'CHANGES') => {
    setBusy(`${productionId}:${stage}`);
    try { await approveStage(productionId, { stage, decision, by: 'producer' }); toast.ok(T('toast.saved')); reload(); } catch (e) { toast.bad((e as Error).message); } finally { setBusy(null); }
  };
  return (
    <>
      <PageHeader title={T('production.title')} subtitle={T('production.lead')} />
      <Section title={T('studio.pipeline')} count={active.length} className="mb-12">
        {active.length === 0 ? <Empty icon={<IconProduce />} title={T('production.empty')} hint={T('production.empty.hint')} action={<Link href="/projects" className="btn btn-primary">{T('nav.projects')}</Link>} /> : (
          <ol className="space-y-3">
            {active.map((p) => {
              const row = pipe?.productions.find((x) => x.productionId === p.id);
              const show = showById(state, p.showId);
              const waiting = row?.stages.find((s) => s.status === 'AWAITING_APPROVAL');
              return (
                <li key={p.id} className="card p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11.5px] text-faint" dir="auto">{p.kind === 'EPISODE' && show ? `${show.title} · ${T('misc.episodeOf')} ${p.episodeNumber}` : T.dyn(`kind.${p.kind}`)} · {fmtAgo(p.updatedAt, T.locale)}</p>
                      <Link href={productionHref(p)} className="bi text-[16px] font-semibold text-fg hover:underline" dir="auto"><span>{p.title}</span>{p.titleAr && <span className="bi-ar" dir="rtl">{p.titleAr}</span>}</Link>
                    </div>
                    <StageStatus p={p} />
                    {waiting && (
                      <div className="flex items-center gap-2">
                        <Status tone="warn">{T('studio.awaitingApproval')}: {T.dyn(`pipeline.${waiting.id}`, waiting.id)}</Status>
                        <Button size="xs" variant="primary" loading={busy === `${p.id}:${waiting.id}`} onClick={() => void decide(p.id, waiting.id, 'APPROVED')}>{T('studio.approve')}</Button>
                        <Button size="xs" variant="ghost" disabled={busy !== null} onClick={() => void decide(p.id, waiting.id, 'CHANGES')}>{T('studio.requestChanges')}</Button>
                      </div>
                    )}
                  </div>
                  <ol className="mt-3 flex gap-1 overflow-x-auto pb-1" aria-label={T('studio.pipeline')}>
                    {(row?.stages ?? org?.pipeline.map((s) => ({ id: s.id, department: s.department, status: 'BLOCKED', at: null, failed: [] as string[] })) ?? []).map((s) => (
                      <li key={s.id} className={cls('flex min-w-[7.5rem] flex-1 flex-col gap-1 rounded-lg border px-2.5 py-2 text-[11.5px]', s.status === 'DONE' ? 'border-ok/40 bg-ok-soft' : s.status === 'AWAITING_APPROVAL' ? 'border-warn/50 bg-warn-soft' : s.status === 'INVALID' || s.status === 'REJECTED' ? 'border-bad/50 bg-bad-soft' : s.status === 'READY' ? 'border-info/40 bg-info-soft' : 'border-line bg-input/60')} title={s.failed.length ? s.failed.join(', ') : undefined}>
                        <span className="truncate font-medium text-fg">{T.dyn(`pipeline.${s.id}`, s.id)}</span>
                        <Status tone={TONE[s.status] ?? 'neutral'} className="!text-[11px]">{T.dyn(`studio.stage.${s.status}`)}</Status>
                        {s.at && <span className="num text-faint">{fmtAgo(s.at, T.locale)}</span>}
                      </li>
                    ))}
                  </ol>
                </li>
              );
            })}
          </ol>
        )}
      </Section>
      <JobsPage />
    </>
  );
}
