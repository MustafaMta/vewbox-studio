'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Job } from '@/domain/jobs';
import { isActiveStatus } from '@/domain/jobs';
import { useStudio } from '@/studio/store';
import { assetById } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { Button, cls } from '@/components/ui/kit';
import { Art } from '@/components/ui/cinema';
import { JobProgress, RecoveryAction, useErrorCopy, type ProgressRow } from '@/components/ui/progress';
import { IconEdit, IconOpen, IconRetry, IconVoice } from '@/components/ui/icons';
import type { CreateStepName } from '../contract';
import type { StepView } from './preflight';
import type { Key } from '@/lib/i18n';

const STEP_KEY: Record<CreateStepName, Key> = { design: 'char.create.step.design', appearance: 'char.create.step.appearance', sheet: 'char.create.step.sheet', voice: 'char.create.step.voice' };

/** THE FOUR-STEP STEPPER — one row per real job of the CREATE_CHARACTER chain (design → appearance → reference sheet
 *  → voice), each with the worker's phase and words, and on failure the plain reason and the single recovery
 *  action for that step. The portrait replaces the 4:5 skeleton in place as soon as it exists. */
export function CreationProgress({ parent, steps, characterId, referenceSrc, onCancel, onRetryStep, onWriteMyself, cancelling, children }: {
  parent?: Job; steps: StepView[]; characterId?: string; /** the reference picture, when the start was From a picture */ referenceSrc?: string;
  onCancel: () => void; onRetryStep: (step: CreateStepName) => void; onWriteMyself: () => void; cancelling?: boolean; children?: ReactNode;
}) {
  const T = useT();
  const { state } = useStudio();
  const copyOf = useErrorCopy();
  const c = characterId ? state.characters.find((x) => x.id === characterId) : undefined;
  const portrait = assetById(state, c?.portraitAssetId);
  const active = !parent || isActiveStatus(parent.status) || steps.some((s) => s.state === 'current');

  const rows: ProgressRow[] = steps.map((s) => {
    const label = T(STEP_KEY[s.step]);
    const stepText = s.progress?.step && s.progress.total ? ` · ${s.progress.step}/${s.progress.total}` : '';
    let detail: ReactNode = s.state === 'current' ? `${s.message ?? T('jobs.inProgress')}${stepText}` : s.state === 'skipped' ? (s.step === 'voice' ? T('char.create.noVoiceYet') : s.reason || T('jp.skipped')) : undefined;
    let action: ReactNode;
    if (s.state === 'failed') {
      const copy = copyOf(s.error);
      detail = <>{copy.title}{copy.hint ? ` — ${copy.hint}` : ''}</>;
      const retry = <Button size="sm" variant="secondary" icon={<IconRetry />} onClick={() => onRetryStep(s.step)}>{s.step === 'design' ? T('jobs.retry') : s.step === 'appearance' ? T('char.create.drawAgain') : s.step === 'sheet' ? T('gen.refs') : T('jobs.retry')}</Button>;
      const custom = {
        reference: s.step === 'voice' && characterId ? <Link href={`/characters/${characterId}?tab=voice`} className="btn btn-secondary btn-sm"><IconVoice aria-hidden />{T('char.create.addRecording')}</Link> : s.step === 'appearance' && characterId ? <Link href={`/characters/${characterId}?tab=appearance`} className="btn btn-secondary btn-sm"><IconOpen aria-hidden />{T('char.create.addReference')}</Link> : retry,
        fields: s.step === 'design' ? <Button size="sm" variant="secondary" icon={<IconEdit />} onClick={onWriteMyself}>{T('char.create.writeMyself')}</Button> : retry,
        usage: characterId ? <Link href={`/characters/${characterId}?tab=used`} className="btn btn-secondary btn-sm">{copy.fix.label}</Link> : null,
      };
      action = (
        <span className="flex flex-wrap items-center gap-2">
          <RecoveryAction copy={copy} onRetry={() => onRetryStep(s.step)} jobId={s.job?.id} custom={custom} />
          {s.step === 'design' && copy.fix.kind !== 'fields' && <Button size="sm" variant="ghost" icon={<IconEdit />} onClick={onWriteMyself}>{T('char.create.writeMyself')}</Button>}
          {s.job && copy.fix.kind !== 'job' && <Link href={`/production?job=${s.job.id}`} className="btn btn-quiet btn-sm">{T('err.openJob')}</Link>}
        </span>
      );
    }
    return { id: s.step, label, state: s.state, detail, action };
  });

  const preview = portrait && !portrait.unavailable
    ? <Art src={portrait.src} ratio="portrait" title={c?.name} className="fade-in" />
    : referenceSrc ? <div><Art src={referenceSrc} ratio="portrait" className="opacity-80" /><p className="mt-1.5 text-[11.5px] text-faint">{T('char.ref.yours')} · {T('char.create.notTheLook')}</p></div>
    : undefined;

  return (
    <JobProgress job={parent} rows={rows} preview={preview} shape="portrait" title={c ? <span dir="auto">{c.name}</span> : T('char.create.making')} onCancel={active ? onCancel : undefined} cancelling={cancelling} className={cls(!active && 'border-line-strong')}>
      {c && (
        <div className="mt-4 border-t border-line-soft pt-3">
          <p className="text-[13px] text-body" dir="auto"><span className="font-semibold text-fg">{c.name}</span>{c.role ? ` — ${c.role}` : ''}</p>
          {c.distinguishing.length > 0 && <ul className="mt-1.5 flex flex-wrap gap-1.5">{c.distinguishing.slice(0, 3).map((x) => <li key={x} className="badge" dir="auto">{x}</li>)}</ul>}
        </div>
      )}
      {children}
    </JobProgress>
  );
}
