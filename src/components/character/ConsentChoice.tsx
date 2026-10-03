'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Character, VoiceSample } from '@/domain/types';
import type { Job } from '@/domain/jobs';
import { isConsentedUpload } from '@/domain/voice-identity';
import { useStudio } from '@/studio/store';
import { T } from '@/lib/copy';
import { useToast } from '@/components/ui/toast';
import { Button, Segmented } from '@/components/ui/kit';
import { IconCheck } from '@/components/ui/icons';
import type { ConsentStatement } from './contract';

/** The recording a CONSENT_REQUIRED refusal is about: the one it names, else the first upload without a statement (the
 *  one the server's AUTOMATIC plan picks, src/domain/voice-identity.ts). */
export function recordingNeedingConsent(c: Pick<Character, 'voice'>, sampleId?: unknown): VoiceSample | undefined {
  const named = typeof sampleId === 'string' ? c.voice.samples.find((s) => s.id === sampleId) : undefined;
  if (named && !isConsentedUpload(named)) return named;
  return c.voice.samples.find((s) => s.source === 'UPLOADED' && Boolean(s.assetId) && !isConsentedUpload(s));
}

/** THE RECOVERY FOR CONSENT_REQUIRED (audit D6) — never a blind retry: the producer says whose voice the recording is
 *  (confirmVoiceConsent), and only once that statement is saved on the server is the work asked for again — the failed
 *  job retried with the change named, or the caller's own restart (`onConfirmed`). */
export function ConsentChoice({ characterId, sampleId, job, onConfirmed }: { characterId: string; sampleId?: unknown; job?: Job; onConfirmed?: () => void | Promise<void> }) {
  const toast = useToast();
  const { state, act, saving, retryJob } = useStudio();
  const c = state.characters.find((x) => x.id === characterId);
  const sample = c ? recordingNeedingConsent(c, sampleId) : undefined;
  const [statement, setStatement] = useState<ConsentStatement | ''>('');
  const [waiting, setWaiting] = useState<{ sampleId: string; statement: ConsentStatement } | null>(null);
  const [busy, setBusy] = useState(false);

  // the statement must reach the server before the job runs again, or the worker reads the old recording and refuses
  useEffect(() => {
    if (!waiting || saving !== 'saved') return;
    const now = c?.voice.samples.find((s) => s.id === waiting.sampleId);
    setWaiting(null);
    if (!now || !isConsentedUpload(now)) { setBusy(false); return; } // refused on the server: the error is shown by the store
    const label = now.label;
    const again = job ? retryJob(job.id, `consent confirmed for “${label}”: ${waiting.statement}`).then(() => undefined) : Promise.resolve(onConfirmed?.());
    again.catch((e: unknown) => toast.bad((e as Error).message)).finally(() => setBusy(false));
  }, [waiting, saving, c, job, retryJob, onConfirmed, toast]);

  if (!c) return null;
  // nothing left to confirm here (removed, or confirmed elsewhere): the voice section is where recordings live
  if (!sample) return <Link href={`/characters/${characterId}#voice`} className="btn btn-secondary btn-sm">{T('err.CONSENT_REQUIRED.fix')}</Link>;
  const confirm = () => {
    if (!statement) return;
    try { act('confirmVoiceConsent', characterId, sample.id, statement); setBusy(true); setWaiting({ sampleId: sample.id, statement }); }
    catch (e) { toast.bad((e as Error).message); }
  };
  return (
    <div className="flex w-full max-w-[34rem] flex-col gap-2 text-start" role="group" aria-label={T('cast.voice.consent')}>
      <p className="text-[13px] text-body" dir="auto">{T.f('cast.voice.consentFor', { label: sample.label })}</p>
      <Segmented label={T('cast.voice.consent')} value={statement || 'NONE'} onChange={(v) => setStatement(v === 'NONE' ? '' : (v as ConsentStatement))} options={[{ value: 'MY_VOICE', label: T('cast.voice.consent.mine') }, { value: 'SPEAKER_PERMISSION', label: T('cast.voice.consent.permission') }]} />
      <span><Button size="sm" variant="secondary" icon={<IconCheck />} disabled={!statement} loading={busy} onClick={confirm}>{T('cast.voice.consentAndRetry')}</Button></span>
    </div>
  );
}
