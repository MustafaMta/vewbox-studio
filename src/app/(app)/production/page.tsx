'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useStudio } from '@/studio/store';
import { approveStage, useLive, useOrg } from '@/studio/org';
import { productionHref, showById } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { PageHeader, Section } from '@/components/ui/page';
import { Button, Notice, type Tone } from '@/components/ui/kit';
import { Empty } from '@/components/ui/cinema';
import { PhaseStrip } from '@/components/ui/progress';
import { StageStatus } from '@/components/library/ProductionTile';
import { IconProduce } from '@/components/ui/icons';
import JobsPage from '../jobs/page';
import { fmtAgo } from '@/lib/format';

interface PipelineRow { productionId: string; stages: Array<{ id: string; department: string; status: string; at: string | null; failed: string[] }> }

const TONE: Record<string, Tone> = { DONE: 'ok', AWAITING_APPROVAL: 'gold', REJECTED: 'bad', INVALID: 'bad', READY: 'info', BLOCKED: 'neutral' };

/** PRODUCTION — what waits for a human decision first (one gold notice per approval, Approve and Request changes
 *  inside it), then every production's position in the pipeline as a phase strip, then everything the studio is
 *  running or has run. */
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
  const decisions = active.flatMap((p) => { const row = pipe?.productions.find((x) => x.productionId === p.id); const waiting = row?.stages.find((s) => s.status === 'AWAITING_APPROVAL'); return waiting ? [{ p, stage: waiting }] : []; });
  return (
    <>
      <PageHeader title={T('production.title')} subtitle={T('production.lead')} />
      <Section title={T('production.decisions')} count={decisions.length} className="mb-12" description={T('production.decisions.hint')}>
        {decisions.length === 0 ? <p className="text-[13px] text-faint">{T('production.decisions.none')}</p> : (
          <ol className="space-y-3">
            {decisions.map(({ p, stage }) => (
              <li key={p.id}>
                <Notice tone="gold" title={<span dir="auto"><Link href={productionHref(p)} className="hover:underline">{p.title}</Link> · {T.dyn(`pipeline.${stage.id}`, stage.id)}</span>}
                  action={<span className="flex flex-wrap items-center gap-2"><Button size="xs" variant="primary" loading={busy === `${p.id}:${stage.id}`} onClick={() => void decide(p.id, stage.id, 'APPROVED')}>{T('studio.approve')}</Button><Button size="xs" variant="ghost" disabled={busy !== null} onClick={() => void decide(p.id, stage.id, 'CHANGES')}>{T('studio.requestChanges')}</Button><Link href={productionHref(p)} className="btn btn-quiet btn-xs">{T('btn.open')}</Link></span>}>
                  {T('studio.awaitingApproval')}{stage.at ? ` · ${fmtAgo(stage.at, T.locale)}` : ''}
                </Notice>
              </li>
            ))}
          </ol>
        )}
      </Section>
      <Section title={T('studio.pipeline')} count={active.length} className="mb-12">
        {active.length === 0 ? <Empty icon={<IconProduce />} title={T('production.empty')} hint={T('production.empty.hint')} action={<Link href="/new" className="btn btn-primary">{T('nav.new')}</Link>} /> : (
          <ol className="space-y-3">
            {active.map((p) => {
              const row = pipe?.productions.find((x) => x.productionId === p.id);
              const show = showById(state, p.showId);
              const stages = row?.stages ?? org?.pipeline.map((s) => ({ id: s.id, department: s.department, status: 'BLOCKED', at: null, failed: [] as string[] })) ?? [];
              return (
                <li key={p.id} className="card p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11.5px] text-faint" dir="auto">{p.kind === 'EPISODE' && show ? `${show.title} · ${T('misc.episodeOf')} ${p.episodeNumber}` : T.dyn(`kind.${p.kind}`)} · {fmtAgo(p.updatedAt, T.locale)}</p>
                      <Link href={productionHref(p)} className="bi text-[16px] font-semibold text-fg hover:underline" dir="auto"><span>{p.title}</span>{p.titleAr && <span className="bi-ar" dir="rtl">{p.titleAr}</span>}</Link>
                    </div>
                    <StageStatus p={p} />
                  </div>
                  <PhaseStrip className="mt-3" label={T('studio.pipeline')} phases={stages.map((s) => ({ id: s.id, name: T.dyn(`pipeline.${s.id}`, s.id), status: T.dyn(`studio.stage.${s.status}`), tone: TONE[s.status] ?? 'neutral', time: s.at ? fmtAgo(s.at, T.locale) : undefined, title: s.failed.length ? s.failed.join(', ') : undefined }))} />
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
