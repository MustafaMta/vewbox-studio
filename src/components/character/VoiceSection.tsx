'use client';

import { useEffect, useRef, useState } from 'react';
import type { Character, VoiceSample } from '@/domain/types';
import { isActiveStatus } from '@/domain/jobs';
import { isStudioError } from '@/domain/errors';
import { voiceLock } from '@/domain/rules';
import { useJobsFor, useStudio } from '@/studio/store';
import { api } from '@/studio/api';
import { assetById } from '@/studio/selectors';
import { useEngineStatus } from '@/lib/hooks';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { Button, Details, Dropzone, Field, KV, Status, Textarea, cls } from '@/components/ui/kit';
import { FactList } from '@/components/ui/page';
import { FailureNotice, useErrorCopy } from '@/components/ui/progress';
import { IconGenerate, IconShield, IconVoice } from '@/components/ui/icons';
import type { Track } from '@/components/players/PlayerProvider';
import { dialectLabel, fmtSeconds } from '@/lib/format';
import { startVoiceBuild, type VoiceReferenceRefusal } from './contract';
import { RetryWithChange } from './RetryWithChange';
import { voiceState } from './identity';
import { VoicePlayer } from './VoicePlayer';
import { VoiceTraitsDialog } from './EditDialogs';
import { checkAudioDuration, checkAudioFile, measureAudio, type AudioVerdict } from './create/preflight';

/** The engine, in words a producer can read. */
export function engineName(identity: Character['voice']['identity'], T: ReturnType<typeof useT>): string {
  if (!identity) return '—';
  if (identity.provider === 'MINIMAX') return T('voice.engine.minimax');
  const m = identity.model.toLowerCase();
  return m.includes('habibi') ? T('voice.engine.habibi') : m.includes('index') ? T('voice.engine.indextts') : identity.model;
}

/** THE VOICE IDENTITY (DESIGN-SYSTEM-V3 §9.7, limited to what works today) — the voice you can hear: the proof line in
 *  a real player with where it came from, its language and its check, and an inline line to preview. Then, when the
 *  voice may still change, how to create or replace it: from a recording (recorded here or dropped, validated in the
 *  browser and then by the studio); the designed voice and the catalogue say plainly why they are not available yet.
 *  Previews ("takes") are listened to, never cloned from. Once the character has spoken in a video the voice is held,
 *  said once in a slim bar. */
export function VoiceSection({ c }: { c: Character }) {
  const T = useT();
  const { state } = useStudio();
  const identity = c.voice.identity;
  const vlock = voiceLock(c);
  const vstate = voiceState(c);
  const lang = `${c.language === 'EN' ? T('label.english') : T('label.arabic')}${c.dialect ? ` · ${dialectLabel(c.dialect, T.locale)}` : ''}`;
  const trackFor = (sm: VoiceSample | undefined, id?: string): Track | null => { const a = assetById(state, sm?.assetId ?? id); return a && !a.unavailable && a.src ? { id: `voice-${c.id}-${a.id}`, src: a.src, title: `${c.name} — ${sm?.label ?? T('voice.proofLine')}`, subtitle: lang, duration: a.durationSeconds } : null; };
  const proofSample = identity?.proof ? c.voice.samples.find((s) => s.id === identity.proof!.sampleId) : undefined;
  const proofTrack = identity?.proof ? trackFor(proofSample, identity.proof.assetId) : null;
  const referenceName = (identity?.referenceSampleId ? c.voice.samples.find((s) => s.id === identity.referenceSampleId)?.label : undefined) ?? assetById(state, identity?.referenceAssetId)?.label;
  const selected = c.voice.samples.find((s) => s.id === c.voice.selectedSampleId);
  const takes = c.voice.samples.filter((s) => s.source !== 'UPLOADED' && s.id !== identity?.proof?.sampleId);
  const stateWord = vstate === 'VERIFIED' ? { tone: 'ok' as const, key: 'voice.identity.verified' as const } : vstate === 'REVIEW' ? { tone: 'warn' as const, key: 'voice.identity.review' as const } : vstate === 'STALE' ? { tone: 'warn' as const, key: 'voice.identity.stale' as const } : vstate === 'UNCHECKED' ? { tone: 'neutral' as const, key: 'voice.identity.unchecked' as const } : { tone: 'neutral' as const, key: 'voice.identity.none' as const };
  const [previewOpen, setPreviewOpen] = useState(false);
  const canChange = !(vlock.locked && Boolean(identity));

  return (
    <section id="voice" aria-labelledby="voice-h" className="scroll-mt-24">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="voice-h" className="section-title">{T('cast.voice.title')}</h2>
        <Status tone={stateWord.tone}>{T(stateWord.key)}</Status>
      </div>

      <div className="panel p-4 sm:p-5">
        {identity ? (
          <>
            {proofTrack
              ? <VoicePlayer track={proofTrack} name={identity.proof?.text ? `“${identity.proof.text}”` : T('voice.proofLine')} detail={[engineName(identity, T), referenceName ? `${T('cast.voice.fromRecording')} “${referenceName}”` : T.dyn(`voice.mode.${identity.mode}`), `${T('voice.revision')} ${identity.revision}`].join(' · ')} source="GENERATED" />
              : <p className="text-[13px] text-muted">{T('voice.identity.noProof')}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line-soft pt-4">
              <Button size="sm" variant="secondary" icon={<IconVoice />} aria-expanded={previewOpen} onClick={() => setPreviewOpen((v) => !v)}>{T('cast.voice.previewLine')}</Button>
              <span className="text-xs text-faint">{lang}</span>
              {identity.proof && (
                <Details summary={T('cast.voice.checkDetails')} className="basis-full">
                  <KV rows={[[T('voice.identity.heard'), identity.proof.heard || '—'], [T('voice.identity.coverage'), identity.proof.coverage !== undefined ? `${Math.round(identity.proof.coverage * 100)}%` : '—'], [T('voice.identity.cer'), identity.proof.cer !== undefined ? `${Math.round(identity.proof.cer * 100)}%` : '—'], [T('voice.identity.wer'), identity.proof.wer !== undefined ? `${Math.round(identity.proof.wer * 100)}%` : '—'], [T('gen.model'), `${identity.model}${identity.engineVersion ? ` · ${identity.engineVersion}` : ''}`]]} />
                </Details>
              )}
            </div>
            {previewOpen && <PreviewLine c={c} onDone={() => setPreviewOpen(false)} />}
          </>
        ) : selected ? (
          <>
            <VoicePlayer track={trackFor(selected)} name={selected.label} detail={lang} source={selected.source} unavailableText={T('media.unavailable')} />
            <p className="mt-3 text-[13px] text-muted">{selected.source === 'UPLOADED' ? T('voice.identity.notBuiltYet') : T('voice.identity.sampleChosen')}</p>
          </>
        ) : (
          <p className="text-[14px] leading-[22px] text-muted">{c.dialect === 'IRAQI_BAGHDADI' ? T('cast.voice.emptyIraqi') : T('cast.voice.empty')}</p>
        )}
        {vlock.locked && (
          <p id="voice-lock" role="note" className="mt-4 flex items-start gap-2 border-t border-line-soft pt-4 text-[13px] leading-5 text-muted"><IconShield aria-hidden className="mt-0.5 size-3.5 flex-none" />{T('cast.voice.locked')}</p>
        )}
      </div>

      {canChange && <CreateVoice c={c} open={!identity} />}

      {takes.length > 0 && (
        <div className="mt-8">
          <h3 className="h3">{T('cast.voice.takes')}<span className="num ms-2 text-[13px] font-medium text-faint">{takes.length}</span></h3>
          <p className="mt-1 text-[13px] text-faint">{T('cast.voice.takesHint')}</p>
          <ul className="rows mt-3">{takes.map((sm) => <li key={sm.id} className="py-3"><VoicePlayer track={trackFor(sm)} name={sm.text ? `“${sm.text}”` : sm.label} detail={sm.source === 'SAMPLE' ? T('voice.source.SAMPLE') : lang} source={sm.source} unavailableText={sm.source === 'GENERATED' && !sm.assetId ? T('voice.notGenerated') : T('media.unavailable')} /></li>)}</ul>
        </div>
      )}

      <div className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="h3">{T('cast.voice.traits')}</h3><VoiceTraitsDialog c={c} locked={vlock.locked} /></div>
        <div className="mt-3"><FactList items={[{ label: T('label.pitch'), value: T.dyn(`voice.pitch.${c.voice.pitch}`) }, { label: T('label.pace'), value: T.dyn(`voice.pace.${c.voice.pace}`) }, { label: T('label.timbre'), value: c.voice.timbre || '—' }, ...(c.voice.notes ? [{ label: T('label.voiceNotes'), value: c.voice.notes }] : [])]} /></div>
        <p className="mt-3 text-xs text-faint">{T('voice.dialectEngine')}</p>
      </div>
    </section>
  );
}

/** Speak one line in the character's voice, inline (no dialog): the take appears under "Takes" with its phase. */
function PreviewLine({ c, onDone }: { c: Character; onDone: () => void }) {
  const T = useT();
  const { startJob } = useStudio();
  const toast = useToast();
  const running = useJobsFor({ characterId: c.id, type: 'VOICE_PREVIEW' }).find((j) => isActiveStatus(j.status));
  const [text, setText] = useState(c.language === 'AR' ? (c.dialect === 'IRAQI_BAGHDADI' ? 'شلونك؟ اني هنا من زمان، وين چنت؟' : 'مرحباً، أنا هنا منذ وقت طويل، أين كنت؟') : 'Hello. I have been here a while — where were you?');
  const [busy, setBusy] = useState(false);
  const speak = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); try { await startJob('VOICE_PREVIEW', { characterId: c.id, text }); } catch (err) { toast.bad(`${T('gen.failed')}: ${(err as Error).message}`); } finally { setBusy(false); } };
  return (
    <form className="mt-4 space-y-3" onSubmit={(e) => void speak(e)}>
      <Field label={T('gen.voicePreview.text')}><Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={600} autoFocus /></Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant="secondary" icon={<IconVoice />} loading={busy} disabled={!text.trim() || Boolean(running)}>{T('cast.voice.speak')}</Button>
        <Button size="sm" variant="quiet" onClick={onDone}>{T('btn.close')}</Button>
        {running && <Status tone="info" live className="max-w-full truncate">{running.progress?.message || T('jobs.inProgress')}</Status>}
      </div>
    </form>
  );
}

type Method = 'RECORDING' | 'DESIGNED' | 'CATALOGUE';

/** Create or replace the voice: three ways, honestly available or not; the recording path is the one that works. */
function CreateVoice({ c, open }: { c: Character; open: boolean }) {
  const T = useT();
  const { state, refresh, act } = useStudio();
  const toast = useToast();
  const engines = useEngineStatus();
  const identity = c.voice.identity;
  const vlock = voiceLock(c);
  const lang = `${c.language === 'EN' ? T('label.english') : T('label.arabic')}${c.dialect ? ` · ${dialectLabel(c.dialect, T.locale)}` : ''}`;
  const uploaded = c.voice.samples.filter((s) => s.source === 'UPLOADED');
  const selected = c.voice.samples.find((s) => s.id === c.voice.selectedSampleId);
  const buildFrom = (selected?.source === 'UPLOADED' ? selected : undefined) ?? uploaded[uploaded.length - 1];
  const [method, setMethod] = useState<Method>('RECORDING');
  const [measured, setMeasured] = useState<{ seconds: number | null; verdict: AudioVerdict } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [refusal, setRefusal] = useState<{ code: VoiceReferenceRefusal | 'BROWSER'; message: string } | null>(null);
  const [checked, setChecked] = useState<string | null>(null);
  const trackFor = (sm: VoiceSample): Track | null => { const a = assetById(state, sm.assetId); return a && !a.unavailable && a.src ? { id: `voice-${c.id}-${sm.id}`, src: a.src, title: `${c.name} — ${sm.label}`, subtitle: lang, duration: a.durationSeconds } : null; };

  const upload = async (file: File) => {
    setRefusal(null); setChecked(null);
    if (checkAudioFile(file)) { setRefusal({ code: 'BROWSER', message: T('voice.notAudio') }); setMeasured(null); return; }
    const seconds = await measureAudio(file);
    const verdict = seconds === null ? 'OK' : checkAudioDuration(seconds);
    setMeasured({ seconds, verdict });
    if (verdict === 'TOO_SHORT') { setRefusal({ code: 'TOO_SHORT', message: T('voice.refuse.TOO_SHORT') }); return; }
    setUploading(true);
    try {
      const r = await api.uploadVoiceReference(c.id, file, { label: file.name.replace(/\.[a-z0-9]+$/i, ''), language: c.language, dialect: c.dialect });
      if (!r.ok) { setRefusal({ code: r.code, message: r.message }); return; }
      await refresh();
      const v = r.validation;
      setChecked(`${fmtSeconds(Math.round(v.durationSeconds * 10) / 10)} · ${v.speech.present ? T('cast.voice.clearSpeech') : T('cast.voice.noSpeech')} · ${v.speech.language === 'UNKNOWN' ? T('voice.langUnknown') : v.speech.language === 'AR' ? T('label.arabic') : T('label.english')}`);
      toast.ok(T('voice.added'));
    } catch (e) { setRefusal({ code: 'BROWSER', message: isStudioError(e) ? e.message : (e as Error).message }); }
    finally { setUploading(false); }
  };
  const refusalText = refusal && (refusal.code === 'BROWSER' ? refusal.message : `${T.dyn(`voice.refuse.${refusal.code}`, refusal.message)}${refusal.message && refusal.code !== 'TOO_SHORT' ? ` — ${refusal.message}` : ''}`);
  const catalogueReason = engines.status?.minimaxConfigured ? T('cast.voice.catalogueSoon') : T('cast.voice.catalogueKey');
  const methods: Array<{ value: Method; label: string; hint: string; disabled: boolean }> = [
    { value: 'RECORDING', label: T('cast.voice.m.recording'), hint: T('cast.voice.m.recording.hint'), disabled: false },
    { value: 'DESIGNED', label: T('cast.voice.m.designed'), hint: T('cast.voice.m.designed.why'), disabled: true },
    { value: 'CATALOGUE', label: T('cast.voice.m.catalogue'), hint: catalogueReason, disabled: true },
  ];

  return (
    <Details summary={identity ? T('cast.voice.replace') : T('cast.voice.create')} open={open} className="mt-6">
      <div className="space-y-6">
        <div role="radiogroup" aria-label={T('cast.voice.how')} className="grid gap-2 md:grid-cols-3 md:gap-3">
          {methods.map((m) => (
            <label key={m.value} data-selected={method === m.value || undefined} aria-disabled={m.disabled || undefined} className="tile-choice min-h-16 gap-1 px-4 py-3">
              <input type="radio" name={`voice-method-${c.id}`} value={m.value} checked={method === m.value} disabled={m.disabled} onChange={() => setMethod(m.value)} className="sr-only" />
              <span className="flex items-center gap-3"><span className={cls('min-w-0 flex-1 text-[15px] font-semibold leading-5', m.disabled ? 'text-disabled' : 'text-fg')}>{m.label}</span><span aria-hidden className="radio-mark" /></span>
              <span className={cls('text-[13px] leading-5', m.disabled ? 'text-faint' : 'text-muted')}>{m.hint}</span>
            </label>
          ))}
        </div>

        <div>
          <div className="dropzone-wrap flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <Recorder onFile={(f) => void upload(f)} disabled={uploading} />
            <Dropzone className="min-w-0 flex-1" label={T('cast.voice.drop')} hint={T('cast.voice.dropHint')} accept="audio/*" icon={<IconVoice />} busy={uploading} onFile={(f) => void upload(f)} error={refusalText} row />
          </div>
          {(measured || checked) && !refusal && (
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1" role="status">
              {measured && <span className={cls('status', measured.verdict === 'OK' ? 'status-ok' : 'status-warn')}>{measured.seconds === null ? T('voice.measured.unknown') : `${T('cast.voice.measured')} ${fmtSeconds(Math.round(measured.seconds * 10) / 10)}${measured.verdict === 'TOO_LONG' ? ` · ${T('voice.measured.longHint')}` : ''}`}</span>}
              {checked && <span className="status status-ok">{T('voice.checkedByStudio')}: <span className="num">{checked}</span></span>}
            </p>
          )}
        </div>

        <div>
          <h3 className="h3">{T('voice.recordings')}<span className="num ms-2 text-[13px] font-medium text-faint">{uploaded.length}</span></h3>
          {uploaded.length === 0 ? <p className="mt-2 text-[13px] text-faint">{T('voice.noRecordings')}</p> : (
            <ul className="rows mt-2" role="radiogroup" aria-label={T('voice.recordings')}>
              {uploaded.map((sm) => {
                const on = buildFrom?.id === sm.id; const track = trackFor(sm);
                return (
                  <li key={sm.id} className="py-2">
                    <VoicePlayer track={track} name={sm.label} detail={sm.text || lang} source="UPLOADED" selected={on} unavailableText={T('media.unavailable')}
                      action={<button type="button" role="radio" aria-checked={on} disabled={!track && !on} className={cls('btn btn-sm', on ? 'btn-secondary' : 'btn-quiet')} onClick={() => { try { if (!on) act('selectVoiceSample', c.id, sm.id); } catch (e) { toast.bad((e as Error).message); } }}>{on ? T('cast.voice.reference') : T('cast.voice.useAsReference')}</button>} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <BuildVoice c={c} from={buildFrom} locked={vlock.locked && Boolean(identity)} />
      </div>
    </Details>
  );
}

/** Record in the browser (MediaRecorder): start, a running clock, stop — at most 30 seconds. The recording is then
 *  checked exactly like a dropped file. Hidden where the browser cannot record. */
function Recorder({ onFile, disabled }: { onFile: (f: File) => void; disabled?: boolean }) {
  const T = useT();
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<'idle' | 'asking' | 'recording'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  useEffect(() => { setSupported(typeof window !== 'undefined' && 'MediaRecorder' in window && Boolean(navigator.mediaDevices?.getUserMedia)); }, []);
  useEffect(() => { if (state !== 'recording') return; const t = setInterval(() => setSeconds((s) => { if (s + 1 >= 30) rec.current?.stop(); return s + 1; }), 1000); return () => clearInterval(t); }, [state]);
  useEffect(() => () => { if (rec.current?.state === 'recording') rec.current.stop(); }, []);
  if (!supported) return null;
  const start = async () => {
    setError(null); setState('asking');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream); const chunks: Blob[] = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      r.onstop = () => { stream.getTracks().forEach((t) => t.stop()); setState('idle'); const type = r.mimeType || 'audio/webm'; const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm'; onFile(new File(chunks, `recording-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`, { type })); };
      rec.current = r; r.start(); setSeconds(0); setState('recording');
    } catch { setState('idle'); setError(T('cast.voice.micRefused')); }
  };
  return (
    <div className="flex flex-none flex-col justify-center gap-1">
      {state === 'recording'
        ? <Button variant="secondary" onClick={() => rec.current?.stop()} aria-live="polite"><span aria-hidden className="dot dot-live bg-bad" />{T('cast.voice.stop')} <span className="num font-normal text-muted">{fmtSeconds(seconds)}</span></Button>
        : <Button variant="secondary" disabled={disabled} loading={state === 'asking'} onClick={() => void start()}><span aria-hidden className="dot bg-bad" />{T('cast.voice.record')}</Button>}
      {error && <p role="alert" className="text-xs text-bad">{error}</p>}
    </div>
  );
}

/** "Build voice from …": VOICE_BUILD `{ characterId, mode: 'REFERENCE', referenceSampleId }` from a recording you
 *  uploaded; never from a generated line. Disabled with the reason when there is nothing to build from. */
function BuildVoice({ c, from, locked }: { c: Character; from?: VoiceSample; locked: boolean }) {
  const T = useT();
  const { startJob } = useStudio();
  const toast = useToast();
  const copyOf = useErrorCopy();
  const [busy, setBusy] = useState(false);
  const mine = useJobsFor({ characterId: c.id, type: 'VOICE_BUILD' });
  const active = mine.find((j) => isActiveStatus(j.status));
  const last = mine[0];
  const build = async () => {
    if (!from) return;
    setBusy(true);
    try { const job = await startVoiceBuild(startJob, { characterId: c.id, mode: 'REFERENCE', referenceSampleId: from.id }); for (const w of job.warnings ?? []) toast.push({ tone: 'info', text: w.detail }); }
    catch (e) { toast.bad(`${T('gen.failed')}: ${isStudioError(e) ? e.message : (e as Error).message}`); }
    finally { setBusy(false); }
  };
  if (active) return <Status tone="info" live className="max-w-full truncate" title={active.progress?.message}>{active.progress?.phase ? `${T.dyn(`jp.${active.progress.phase}`)} · ` : ''}{active.progress?.message || T('jobs.inProgress')}</Status>;
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line-soft pt-5">
      <Button variant="primary" icon={<IconGenerate />} loading={busy} disabled={!from || locked} aria-describedby={locked ? 'voice-lock' : undefined} onClick={() => void build()} className="max-w-full"><span className="truncate">{from ? `${T('cast.voice.buildFrom')} “${from.label}”` : T('gen.voiceBuild')}</span></Button>
      {!from && <span className="text-[13px] text-faint" role="status">{T('voice.build.needRecording')}</span>}
      {last?.status === 'FAILED' && <div className="basis-full"><FailureNotice copy={copyOf(last.error)} jobId={last.id} action={copyOf(last.error).fix.kind === 'reference' ? <span className="text-[13px] text-muted">{T('voice.build.needRecording')}</span> : <RetryWithChange job={last} />} /></div>}
    </div>
  );
}
