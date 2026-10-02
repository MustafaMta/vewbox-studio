'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import type { Character, VoiceSample } from '@/domain/types';
import { isActiveStatus } from '@/domain/jobs';
import { isStudioError } from '@/domain/errors';
import { useJobsFor, useStudio } from '@/studio/store';
import { api } from '@/studio/api';
import { assetById } from '@/studio/selectors';
import { voiceLock } from '@/domain/rules';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { Badge, Button, Details, Dropzone, Field, KV, Modal, Spinner, Status, Textarea } from '@/components/ui/kit';
import { Block, Empty } from '@/components/ui/cinema';
import { FailureNotice, RecoveryAction, useErrorCopy } from '@/components/ui/progress';
import { useStartJob } from '@/components/ui/jobs';
import { VoicePreview } from '@/components/players/Controls';
import { IconCheck, IconGenerate, IconShield, IconUpload, IconVoice } from '@/components/ui/icons';
import { dialectLabel, fmtSeconds } from '@/lib/format';
import { startVoiceBuild, type VoiceIdentityV2, type VoiceReferenceRefusal } from './contract';
import { AUDIO_RULES, checkAudioDuration, checkAudioFile, measureAudio, type AudioVerdict } from './create/preflight';

/** The engine, in words a producer can read. */
export function engineName(identity: VoiceIdentityV2 | undefined, T: ReturnType<typeof useT>): string {
  if (!identity) return '—';
  if (identity.provider === 'MINIMAX') return T('voice.engine.minimax');
  const m = identity.model.toLowerCase();
  return m.includes('habibi') ? T('voice.engine.habibi') : m.includes('index') ? T('voice.engine.indextts') : identity.model;
}

/** VOICE — the identity card first: the built voice (engine in words, how it was made, the reference recording,
 *  the proof line to hear, the measured check and its verified / needs-a-listen badge), or the empty state with the
 *  two ways to get one. Then the validated upload (duration measured in the browser before the file leaves it, the
 *  server's verdict after), the recordings you can build from and, apart from them, the generated lines you can
 *  only listen to. The lock shows only once a voice exists and the character has spoken in a video. */
export function VoiceTab({ c }: { c: Character }) {
  const T = useT();
  const { state, act, refresh } = useStudio();
  const toast = useToast();
  const portrait = assetById(state, c.portraitAssetId)?.src;
  const lang = `${c.language === 'EN' ? T('label.english') : T('label.arabic')}${c.dialect ? ` · ${dialectLabel(c.dialect, T.locale)}` : ''}`;
  const identity = c.voice.identity as VoiceIdentityV2 | undefined;
  const vlock = voiceLock(c);
  const dropRef = useRef<HTMLDivElement>(null);
  const trackFor = (sm: VoiceSample) => { const a = assetById(state, sm.assetId); return a && !a.unavailable && a.src ? { id: `voice-${c.id}-${sm.id}`, src: a.src, title: `${c.name} — ${sm.label}`, subtitle: lang, artworkSrc: portrait, duration: a.durationSeconds } : null; };
  const unavailable = (sm: VoiceSample) => (sm.source === 'GENERATED' && !sm.assetId ? T('voice.notGenerated') : T('media.unavailable'));
  const uploaded = c.voice.samples.filter((s) => s.source === 'UPLOADED');
  const generated = c.voice.samples.filter((s) => s.source !== 'UPLOADED');
  const selected = c.voice.samples.find((s) => s.id === c.voice.selectedSampleId);
  const proofSample = identity?.proof ? c.voice.samples.find((s) => s.id === identity.proof!.sampleId) : undefined;
  const proofTrack = proofSample ? trackFor(proofSample) : identity?.proof?.assetId ? (() => { const a = assetById(state, identity.proof!.assetId); return a && !a.unavailable ? { id: `voice-${c.id}-proof`, src: a.src, title: `${c.name} — ${T('voice.proofLine')}`, subtitle: lang, artworkSrc: portrait, duration: a.durationSeconds } : null; })() : null;
  const referenceSample = identity?.referenceSampleId ? c.voice.samples.find((s) => s.id === identity.referenceSampleId) : undefined;
  const referenceName = referenceSample?.label ?? assetById(state, identity?.referenceAssetId)?.label;
  const buildFrom = (selected?.source === 'UPLOADED' ? selected : undefined) ?? uploaded[uploaded.length - 1];

  /* ---- the validated upload ---- */
  const [measured, setMeasured] = useState<{ name: string; seconds: number | null; verdict: AudioVerdict } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [refusal, setRefusal] = useState<{ code: VoiceReferenceRefusal | 'BROWSER'; message: string } | null>(null);
  const [checked, setChecked] = useState<string | null>(null);
  const upload = async (file: File) => {
    setRefusal(null); setChecked(null);
    if (checkAudioFile(file)) { setRefusal({ code: 'BROWSER', message: T('voice.notAudio') }); setMeasured(null); return; }
    const seconds = await measureAudio(file);
    const verdict = seconds === null ? 'OK' : checkAudioDuration(seconds);
    setMeasured({ name: file.name, seconds, verdict });
    if (verdict === 'TOO_SHORT') { setRefusal({ code: 'TOO_SHORT', message: T('voice.refuse.TOO_SHORT') }); return; }
    setUploading(true);
    try {
      const r = await api.uploadVoiceReference(c.id, file, { label: file.name.replace(/\.[a-z0-9]+$/i, ''), language: c.language, dialect: c.dialect });
      if (!r.ok) { setRefusal({ code: r.code, message: r.message }); return; }
      await refresh();
      const v = r.validation;
      setChecked(`${fmtSeconds(Math.round(v.durationSeconds * 10) / 10)} · ${Math.round(v.integratedLufs)} LUFS · ${v.speech.words} ${T('voice.words')} · ${v.speech.language === 'UNKNOWN' ? T('voice.langUnknown') : v.speech.language === 'AR' ? T('label.arabic') : T('label.english')}`);
      toast.ok(T('voice.added'));
    } catch (e) { setRefusal({ code: 'BROWSER', message: isStudioError(e) ? e.message : (e as Error).message }); }
    finally { setUploading(false); }
  };
  const measuredText = measured && (measured.seconds === null ? T('voice.measured.unknown') : `${fmtSeconds(Math.round(measured.seconds * 10) / 10)} · ${measured.verdict === 'OK' ? T('voice.measured.ok') : measured.verdict === 'TOO_SHORT' ? T('voice.measured.short') : T('voice.measured.long')}`);
  const refusalText = refusal && (refusal.code === 'BROWSER' ? refusal.message : `${T.dyn(`voice.refuse.${refusal.code}`, refusal.message)}${refusal.message && refusal.code !== 'TOO_SHORT' ? ` — ${refusal.message}` : ''}`);
  const identityBadge = !identity ? null : identity.status === 'STALE' ? <Badge tone="warn">{T('voice.identity.stale')}</Badge> : identity.status === 'REVIEW' || (identity.proof && !identity.proof.heard && identity.proof.coverage !== undefined && identity.proof.coverage < 0.85) ? <Badge tone="gold">{T('voice.identity.review')}</Badge> : identity.proof ? <Badge tone="ok">{T('voice.identity.verified')}</Badge> : <Badge tone="warn">{T('voice.identity.unchecked')}</Badge>;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-8">
        <section aria-labelledby="voice-now">
          <h2 id="voice-now" className="section-title mb-3">{T('char.voiceIdentity')}</h2>
          {identity ? (
            <div className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-fg">{engineName(identity, T)}{identityBadge}</p>
                  <p className="mt-0.5 text-[12.5px] text-muted">{identity.mode ? T.dyn(`voice.mode.${identity.mode}`) : T('voice.mode.REFERENCE')}{referenceName ? ` · ${T('voice.identity.reference')}: ` : ''}{referenceName && <span className="text-fg" dir="auto">{referenceName}</span>} · {lang} · {T('voice.revision')} {identity.revision}</p>
                </div>
                {identity.jobId && <Link href={`/production?job=${identity.jobId}`} className="text-[12px] font-medium text-accent-text hover:underline">{T('err.openJob')}</Link>}
              </div>
              <div className="mt-4">
                {proofTrack ? <VoicePreview track={proofTrack} name={T('voice.proofLine')} detail={identity.proof?.text ?? identity.referenceText} source="GENERATED" portraitSrc={portrait ?? ''} /> : <p className="text-[12.5px] text-faint">{T('voice.identity.noProof')}</p>}
              </div>
              {identity.proof && (
                <Details summary={T('voice.identity.check')} className="mt-3">
                  <KV rows={[[T('voice.identity.heard'), identity.proof.heard || '—'], [T('voice.identity.coverage'), identity.proof.coverage !== undefined ? `${Math.round(identity.proof.coverage * 100)}%` : '—'], [T('voice.identity.cer'), identity.proof.cer !== undefined ? `${Math.round(identity.proof.cer * 100)}%` : '—'], [T('voice.identity.wer'), identity.proof.wer !== undefined ? `${Math.round(identity.proof.wer * 100)}%` : '—'], [T('gen.model'), `${identity.model}${identity.engineVersion ? ` · ${identity.engineVersion}` : ''}`]]} />
                </Details>
              )}
            </div>
          ) : selected ? (
            <div className="space-y-2">
              <VoicePreview track={trackFor(selected)} name={selected.label} detail={`${lang} · ${T.dyn(`voice.pitch.${c.voice.pitch}`)} · ${T.dyn(`voice.pace.${c.voice.pace}`)}`} source={selected.source} portraitSrc={portrait ?? ''} selected unavailableText={unavailable(selected)} />
              <p className="text-[12px] text-faint">{selected.source === 'UPLOADED' ? T('voice.identity.notBuiltYet') : T('voice.identity.sampleChosen')}</p>
            </div>
          ) : (
            <Empty compact icon={<IconVoice />} title={T('voice.identity.none')} hint={T('voice.identity.noneHint')} action={<>
              <Button variant="primary" icon={<IconUpload />} onClick={() => { dropRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); dropRef.current?.querySelector('input')?.focus(); }}>{T('voice.upload')}</Button>
              <Button variant="secondary" disabled title={T('voice.chooseStudio.none')}>{T('voice.chooseStudio')}</Button>
              <span className="basis-full text-[12px] text-faint">{T('voice.chooseStudio.none')}</span>
            </>} />
          )}
        </section>

        {vlock.locked && <div role="note" id="voice-lock" className="card flex gap-4 border-violet-500/40 bg-primary/[0.05] p-4"><span aria-hidden className="grid size-10 flex-none place-items-center rounded-xl bg-accent-soft text-violet-300 [&>svg]:size-5"><IconShield /></span><p className="text-[13px] text-body">{T('char.voiceLock')}</p></div>}

        <Block title={T('voice.recordings')} count={uploaded.length} description={T('voice.recordingsHint')}
          actions={<div className="flex flex-wrap items-center gap-2"><BuildVoice c={c} from={buildFrom} locked={vlock.locked && Boolean(identity)} /><VoicePreviewButton c={c} /></div>}>
          {uploaded.length === 0 ? <p className="text-[13px] text-faint">{T('voice.noRecordings')}</p> : (
            <ul className="space-y-2" role="radiogroup" aria-label={T('voice.recordings')}>
              {uploaded.map((sm) => {
                const on = c.voice.selectedSampleId === sm.id;
                const track = trackFor(sm);
                const isReference = identity?.referenceSampleId === sm.id || (identity?.referenceAssetId && identity.referenceAssetId === sm.assetId);
                return (
                  <li key={sm.id}>
                    <VoicePreview track={track} name={sm.label} detail={`${lang}${sm.text ? ` · ${sm.text}` : ''}${isReference ? ` · ${T('voice.identity.reference')}` : ''}`} source={sm.source} selected={on} unavailableText={unavailable(sm)}
                      action={<button type="button" role="radio" aria-checked={on} disabled={(!track && !on) || (vlock.locked && !on)} aria-describedby={vlock.locked ? 'voice-lock' : undefined} onClick={() => { try { act('selectVoiceSample', c.id, on ? undefined : sm.id); if (!on) toast.ok(T('char.selectedVoice')); } catch (e) { toast.bad((e as Error).message); } }} aria-label={`${T('btn.select')} ${sm.label}`} className={`btn btn-sm ${on ? 'btn-primary' : 'btn-secondary'}`}>{on ? <><IconCheck />{T('btn.selected')}</> : T('btn.select')}</button>} />
                  </li>
                );
              })}
            </ul>
          )}
          <div ref={dropRef} className="mt-4">
            <Dropzone label={T('voice.upload')} hint={c.dialect === 'IRAQI_BAGHDADI' ? T('voice.uploadHintAr') : T('voice.uploadHintShort')} accept="audio/*" icon={<IconVoice />} busy={uploading} disabled={vlock.locked && Boolean(identity)} onFile={(f) => void upload(f)} error={refusalText} row={uploaded.length > 0} />
            {(measuredText || checked) && !refusal && (
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]" role="status">
                {measuredText && <span className={`status ${measured?.verdict === 'OK' ? 'status-ok' : 'status-warn'}`}>{T('voice.measured')}: {measuredText}</span>}
                {checked && <span className="status status-ok">{T('voice.checkedByStudio')}: <span className="num">{checked}</span></span>}
              </p>
            )}
            {measured?.verdict === 'TOO_LONG' && !refusal && <p className="mt-1 text-[12px] text-faint">{T('voice.measured.longHint')}</p>}
          </div>
        </Block>

        {generated.length > 0 && (
          <Block title={T('voice.generatedLines')} count={generated.length} description={T('voice.generatedLinesHint')}>
            <ul className="space-y-2">
              {generated.map((sm) => <li key={sm.id}><VoicePreview track={trackFor(sm)} name={sm.label} detail={`${lang}${sm.text ? ` · ${sm.text}` : ''}`} source={sm.source} selected={c.voice.selectedSampleId === sm.id} unavailableText={unavailable(sm)} action={<span className="badge" title={T('voice.listenOnlyHint')}>{T('voice.listenOnly')}</span>} /></li>)}
            </ul>
          </Block>
        )}
      </div>
      <aside className="space-y-4">
        <Block title={T('label.voiceNotes')}>
          <KV rows={[[T('label.language'), lang], [T('label.pitch'), T.dyn(`voice.pitch.${c.voice.pitch}`)], [T('label.pace'), T.dyn(`voice.pace.${c.voice.pace}`)], [T('label.timbre'), c.voice.timbre || '—'], [T('label.voiceNotes'), c.voice.notes || '—']]} />
          <p className="mt-3 text-[12px] text-faint">{T('voice.dialectEngine')}</p>
        </Block>
        {identity && vlock.locked && <p className="text-[12px] text-faint">{T('voice.lockNote')}</p>}
      </aside>
    </div>
  );
}

/** "Build the voice": VOICE_BUILD `{ characterId, mode: 'REFERENCE', referenceSampleId }` from a recording you
 *  uploaded; never from a generated line. Disabled with the reason when there is nothing to build from. */
function BuildVoice({ c, from, locked }: { c: Character; from?: VoiceSample; locked: boolean }) {
  const T = useT();
  const { startJob, retryJob } = useStudio();
  const toast = useToast();
  const copyOf = useErrorCopy();
  const [busy, setBusy] = useState(false);
  const mine = useJobsFor({ characterId: c.id, type: 'VOICE_BUILD' });
  const active = mine.find((j) => isActiveStatus(j.status));
  const last = mine[0];
  const build = async () => {
    if (!from) return;
    setBusy(true);
    // no client key: the server derives `VOICE_BUILD:${characterId}:${revision}` (contract §1.4) and queues a new
    // build when the last one under that key has ended — a failed build never makes this button a no-op
    try { await startVoiceBuild(startJob, { characterId: c.id, mode: 'REFERENCE', referenceSampleId: from.id }); }
    catch (e) { toast.bad(`${T('gen.failed')}: ${isStudioError(e) ? e.message : (e as Error).message}`); }
    finally { setBusy(false); }
  };
  if (active) return <span className="inline-flex items-center gap-2"><Status tone="info" live className="max-w-[18rem] truncate" title={active.progress?.message}><Spinner className="me-1" />{active.progress?.phase ? `${T.dyn(`jp.${active.progress.phase}`)} · ` : ''}{active.progress?.message || T('jobs.inProgress')}</Status></span>;
  if (locked) return <Button size="sm" icon={<IconGenerate />} disabled aria-describedby="voice-lock">{T('gen.voiceBuild')}</Button>;
  const reason = !from ? T('voice.build.needRecording') : null;
  return (
    <div className="flex max-w-full flex-wrap items-center gap-2">
      <Button size="sm" icon={<IconGenerate />} loading={busy} disabled={Boolean(reason)} onClick={() => void build()}>{T('gen.voiceBuild')}{from ? <span className="hidden max-w-[8rem] truncate font-normal opacity-80 sm:inline" dir="auto">· {from.label}</span> : null}</Button>
      {reason && <span className="text-[12px] text-faint" role="status">{reason}</span>}
      {last?.status === 'FAILED' && <div className="basis-full"><FailureNotice copy={copyOf(last.error)} jobId={last.id} action={<RecoveryAction copy={copyOf(last.error)} size="xs" onRetry={() => void retryJob(last.id)} jobId={last.id} custom={{ reference: <span className="text-[12px] text-muted">{T('voice.build.needRecording')}</span> }} />} /></div>}
    </div>
  );
}

/** Speak one line in the character's voice: a small form that starts a VOICE_PREVIEW job. */
function VoicePreviewButton({ c }: { c: Character }) {
  const T = useT();
  const { start, busy } = useStartJob();
  const [text, setText] = useState(c.language === 'AR' ? (c.dialect === 'IRAQI_BAGHDADI' ? 'شلونك؟ اني هنا من زمان، وين چنت؟' : 'مرحباً، أنا هنا منذ وقت طويل، أين كنت؟') : 'Hello. I have been here a while — where were you?');
  return (
    <Modal title={T('gen.voicePreview')} trigger={(open) => <Button size="sm" icon={<IconVoice />} onClick={open}>{T('gen.voicePreview')}</Button>}>
      {(close) => (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void start('VOICE_PREVIEW', { characterId: c.id, text }).then((j) => { if (j) close(); }); }}>
          <Field label={T('gen.voicePreview.text')}><Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={600} /></Field>
          <div className="sheet-actions flex justify-end gap-2"><Button variant="ghost" onClick={close}>{T('btn.cancel')}</Button><Button type="submit" variant="primary" loading={busy} disabled={!text.trim()}>{T('gen.voicePreview')}</Button></div>
        </form>
      )}
    </Modal>
  );
}

export { AUDIO_RULES };
