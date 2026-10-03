'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Job } from '@/domain/jobs';
import { isActiveStatus } from '@/domain/jobs';
import { useStudio } from '@/studio/store';
import { assetById, primaryImageOf } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { Button, Status } from '@/components/ui/kit';
import { JobProgress, RecoveryAction, useErrorCopy, type ProgressRow } from '@/components/ui/progress';
import { IconEdit, IconOpen, IconRetry, IconVoice } from '@/components/ui/icons';
import type { CreateStepName } from '../contract';
import type { StepView } from './preflight';
import type { Key } from '@/lib/i18n';
import { CharacterImage } from '../CharacterImage';
import { ConsentChoice } from '../ConsentChoice';
import { imageKindOf } from '../identity';

const STEP_KEY: Record<CreateStepName, Key> = { design: 'cast.step.design', image: 'cast.step.image', voice: 'cast.step.voice' };

/** THE CREATION STEPPER — one row per real job of the CREATE_CHARACTER chain (design → image → voice), each with
 *  the worker's own phase and words; then the last word, which is the producer's: "awaiting your approval". A failed
 *  step keeps what was made and offers the one recovery for that step. The canonical image replaces the 2:3 frame in
 *  place as soon as it exists. Leaving is safe: the work continues and the profile picks it up. */
export function CreationProgress({ parent, steps, characterId, referenceSrc, onCancel, onRetryStep, onWriteMyself, cancelling, settled, children }: {
  parent?: Job; steps: StepView[]; characterId?: string; /** the reference picture, when the start was From a picture */ referenceSrc?: string;
  onCancel: () => void; onRetryStep: (step: CreateStepName) => void; onWriteMyself: () => void; cancelling?: boolean; settled: boolean; children?: ReactNode;
}) {
  const T = useT();
  const { state } = useStudio();
  const copyOf = useErrorCopy();
  const c = characterId ? state.characters.find((x) => x.id === characterId) : undefined;
  const image = c ? assetById(state, primaryImageOf(c)) : undefined;
  const active = !parent || isActiveStatus(parent.status) || steps.some((s) => s.state === 'current');

  const rows: ProgressRow[] = steps.map((s) => {
    const label = T(STEP_KEY[s.step]);
    const stepText = s.progress?.step && s.progress.total ? ` · ${s.progress.step}/${s.progress.total}` : '';
    let detail: ReactNode = s.state === 'current' ? `${s.message ?? T('jobs.inProgress')}${stepText}` : s.state === 'skipped' ? (s.step === 'voice' ? T('char.create.noVoiceYet') : s.reason || T('jp.skipped')) : undefined;
    let action: ReactNode;
    if (s.state === 'failed') {
      const copy = copyOf(s.error);
      detail = <>{copy.title}{copy.hint ? ` — ${copy.hint}` : ''}</>;
      const retry = <Button size="sm" variant="secondary" icon={<IconRetry />} onClick={() => onRetryStep(s.step)}>{s.step === 'image' ? T('char.create.drawAgain') : T('jobs.retry')}</Button>;
      const custom = {
        reference: s.step === 'voice' && characterId ? <Link href={`/characters/${characterId}#voice`} className="btn btn-secondary btn-sm"><IconVoice aria-hidden />{T('char.create.addRecording')}</Link> : s.step === 'image' && characterId ? <Link href={`/characters/${characterId}#image`} className="btn btn-secondary btn-sm"><IconOpen aria-hidden />{T('cast.new.openProfile')}</Link> : retry,
        fields: s.step === 'design' ? <Button size="sm" variant="secondary" icon={<IconEdit />} onClick={onWriteMyself}>{T('char.create.writeMyself')}</Button> : retry,
        usage: characterId ? <Link href={`/characters/${characterId}#productions`} className="btn btn-secondary btn-sm">{copy.fix.label}</Link> : null,
        // a recording without a consent statement: the producer's statement, then the voice step again (never a blind retry)
        consent: characterId ? <ConsentChoice characterId={characterId} sampleId={s.job?.error?.details?.sampleId} onConfirmed={() => onRetryStep(s.step)} /> : null,
      };
      action = (
        <span className="flex flex-wrap items-center gap-2">
          <RecoveryAction copy={copy} onRetry={() => onRetryStep(s.step)} jobId={s.job?.id} custom={custom} />
          {s.step === 'design' && copy.fix.kind !== 'fields' && <Button size="sm" variant="quiet" icon={<IconEdit />} onClick={onWriteMyself}>{T('char.create.writeMyself')}</Button>}
          {s.job && copy.fix.kind !== 'job' && <Link href={`/production?job=${s.job.id}`} className="btn btn-quiet btn-sm">{T('err.openJob')}</Link>}
        </span>
      );
    }
    return { id: s.step, label, state: s.state, detail, action };
  });

  const preview = image && !image.unavailable
    ? <CharacterImage src={image.src} kind={imageKindOf(c!)} name={c!.name} className="fade-in" />
    : referenceSrc ? <div><CharacterImage src={referenceSrc} kind="PORTRAIT" name="" ratio={4 / 5} className="opacity-80" /><p className="mt-1.5 text-xs text-faint">{T('char.ref.yours')} · {T('char.create.notTheLook')}</p></div>
    : <CharacterImage kind="NONE" name={c?.name ?? '…'} placeholder={T('cast.new.imageLands')} />;
  const awaiting = settled && c?.canonicalImage?.status === 'DRAFT';

  return (
    <JobProgress job={parent} rows={rows} preview={preview} shape="portrait" title={c ? <span dir="auto">{c.name}</span> : T('char.create.making')} onCancel={active ? onCancel : undefined} cancelling={cancelling}>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-soft pt-3 text-[13px]">
        {awaiting ? <Status tone="warn">{T('cast.step.approval')}</Status> : <span className="text-faint">{T('cast.step.thenApproval')}</span>}
      </div>
      {c && (
        <p className="mt-3 text-[13px] text-body" dir="auto"><span className="font-semibold text-fg">{c.name}</span>{c.role ? ` — ${c.role}` : ''}</p>
      )}
      {children}
    </JobProgress>
  );
}
