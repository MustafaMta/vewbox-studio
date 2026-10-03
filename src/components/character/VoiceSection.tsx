'use client';

import { useEffect, useRef, useState } from 'react';
import type { Character, VoiceSample } from '@/domain/types';
import type { Job } from '@/domain/jobs';
import { isActiveStatus } from '@/domain/jobs';
import { isStudioError } from '@/domain/errors';
import { voiceLock } from '@/domain/rules';
import { useJobsFor, useStudio } from '@/studio/store';
import { api, type StartedJob } from '@/studio/api';
import { assetById } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { Button, Details, Dropzone, Field, Input, KV, Segmented, Status, Textarea, cls } from '@/components/ui/kit';
import { FactList } from '@/components/ui/page';
import { FailureNotice, useErrorCopy } from '@/components/ui/progress';
import { RetryControl } from '@/components/ui/jobs';
import { IconCheck, IconGenerate, IconShield, IconVoice } from '@/components/ui/icons';
import type { Track } from '@/components/players/PlayerProvider';
import { dialectLabel, fmtSeconds } from '@/lib/format';
import { designResultOf, designedIraqiAllowed, recordVoiceListening, startVoiceBuild, startVoiceBuildV2, startVoiceDesign, voiceDescriptionOf, voiceExtras, type ConsentStatement, type VoiceReferenceRefusal } from './contract';
import { voiceListened, voiceMeasures, voiceOrigin, voiceState } from './identity';
import { VoicePlayer } from './VoicePlayer';
import { VoiceTraitsDialog } from './EditDialogs';
import { checkAudioDuration, checkAudioFile, measureAudio, type AudioVerdict } from './create/preflight';
import { ConsentChoice } from './ConsentChoice';

/** The engine, in words a producer can read. */
export function engineName(identity: Character['voice']['identity'], T: ReturnType<typeof useT>): string {
  if (!identity) return '—';
  if (identity.provider === 'MINIMAX') return T('voice.engine.minimax');
  const m = identity.model.toLowerCase();
  return m.includes('habibi') ? T('voice.engine.habibi') : m.includes('index') ? T('voice.engine.indextts') : identity.model;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const useLang = (c: Character) => { const T = useT(); return `${c.language === 'EN' ? T('label.english') : T('label.arabic')}${c.dialect ? ` · ${dialectLabel(c.dialect, T.locale)}` : ''}`; };

/** THE VOICE IDENTITY (DESIGN-SYSTEM-V3 §9.7; docs/CONTRACTS-VOICE-IDENTITY-V2.md) — the voice you can hear: the proof
 *  line in a real player, its origin said on it ("Studio-designed synthetic voice — not a real person" / "Recording —
 *  …"), what was measured in plain words ("intelligible: 98% of words heard", loudness), and what a listener said —
 *  never "natural" or "Iraqi" without a listening record, which "I listened" adds. Any line can be previewed. While the
 *  voice may still change: Automatic (one action), Design a voice (a description → three candidates → choose), or
 *  Recording (recorded here or dropped, with the speaker's consent). Previews are listened to, never cloned from. Once
 *  the character has spoken in a video the voice is held, said once. */
export function VoiceSection({ c }: { c: Character }) {
  const T = useT();
  const { state } = useStudio();
  const identity = c.voice.identity;
  const vlock = voiceLock(c);
  const vstate = voiceState(c);
  const lang = useLang(c);
  const trackFor = (sm: VoiceSample | undefined, id?: string): Track | null => { const a = assetById(state, sm?.assetId ?? id); return a && !a.unavailable && a.src ? { id: `voice-${c.id}-${a.id}`, src: a.src, title: `${c.name} — ${sm?.label ?? T('voice.proofLine')}`, subtitle: lang, duration: a.durationSeconds } : null; };
  const proofSample = identity?.proof ? c.voice.samples.find((s) => s.id === identity.proof!.sampleId) : undefined;
  const proofTrack = identity?.proof ? trackFor(proofSample, identity.proof.assetId) : null;
  const selected = c.voice.samples.find((s) => s.id === c.voice.selectedSampleId);
  const takes = c.voice.samples.filter((s) => s.source !== 'UPLOADED' && s.id !== identity?.proof?.sampleId);
  const stateWord = vstate === 'MEASURED' ? { tone: 'ok' as const, key: 'cast.voice.state.measured' as const } : vstate === 'REVIEW' ? { tone: 'warn' as const, key: 'voice.identity.review' as const } : vstate === 'STALE' ? { tone: 'warn' as const, key: 'voice.identity.stale' as const } : vstate === 'UNCHECKED' ? { tone: 'neutral' as const, key: 'voice.identity.unchecked' as const } : { tone: 'neutral' as const, key: 'voice.identity.none' as const };
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
              ? <VoicePlayer track={proofTrack} name={identity.proof?.text ? `“${identity.proof.text}”` : T('voice.proofLine')} detail={<OriginLabel c={c} />} source="GENERATED" />
              : <p className="text-[13px] text-muted">{T('voice.identity.noProof')} <OriginLabel c={c} /></p>}
            <Evaluation c={c} />
            <PreviewLine c={c} />
            {identity.proof && (
              <Details summary={T('cast.voice.checkDetails')} className="mt-4">
                <KV rows={[[T('voice.identity.heard'), identity.proof.heard || '—'], [T('voice.identity.coverage'), identity.proof.coverage !== undefined ? pct(identity.proof.coverage) : '—'], [T('voice.identity.cer'), identity.proof.cer !== undefined ? pct(identity.proof.cer) : '—'], [T('voice.identity.wer'), identity.proof.wer !== undefined ? pct(identity.proof.wer) : '—'], [T('gen.model'), `${identity.model}${identity.engineVersion ? ` · ${identity.engineVersion}` : ''} · ${T('voice.revision')} ${identity.revision}`]]} />
              </Details>
            )}
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
          <ul className="rows mt-3">{takes.map((sm) => <li key={sm.id} className="py-3"><VoicePlayer track={trackFor(sm)} name={sm.text ? `“${sm.text}”` : sm.label} detail={sm.source === 'SAMPLE' ? T('voice.source.SAMPLE') : T('cast.voice.generatedLine')} source={sm.source} unavailableText={sm.source === 'GENERATED' && !sm.assetId ? T('voice.notGenerated') : T('media.unavailable')} /></li>)}</ul>
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

/** The origin every voice carries: designed (a synthetic voice, not a real person), a recording (whose), or hosted. */
function OriginLabel({ c }: { c: Character }) {
  const T = useT();
  const { state } = useStudio();
  const id = c.voice.identity; if (!id) return null;
  const origin = voiceOrigin(c);
  const ref = (id.referenceSampleId ? c.voice.samples.find((s) => s.id === id.referenceSampleId)?.label : undefined) ?? assetById(state, id.referenceAssetId)?.label;
  const label = origin === 'DESIGNED' ? T('cast.voice.origin.designed') : origin === 'HOSTED' ? T('voice.engine.minimax') : ref ? `${T('cast.voice.origin.recording')} — “${ref}”` : engineName(id, T);
  return <span>{label} · {engineName(id, T)}</span>;
}

/** Measured vs listened (contract v2 §4): the numbers in plain words, then the producer's own listening — or the
 *  plain statement that nobody has listened yet, with "I listened". */
function Evaluation({ c }: { c: Character }) {
  const T = useT();
  const { act } = useStudio();
  const toast = useToast();
  const m = voiceMeasures(c);
  const heard = voiceListened(c);
  const x = voiceExtras(c.voice.identity);
  const iraqi = c.dialect === 'IRAQI_BAGHDADI';
  const [open, setOpen] = useState(false);
  const [natural, setNatural] = useState<string>('');
  const [authentic, setAuthentic] = useState<string>('');
  const [note, setNote] = useState('');
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!natural || (iraqi && !authentic)) return;
    try { recordVoiceListening(act, c.id, { natural: Number(natural), dialectAuthentic: iraqi ? authentic === 'YES' : undefined, note: note.trim() || undefined }); toast.ok(T('cast.voice.listenSaved')); setOpen(false); }
    catch (err) { toast.bad((err as Error).message); }
  };
  const measured = [
    m.intelligible !== undefined ? `${T('cast.voice.intelligible')}: ${T('cast.voice.wordsHeard').replace('{p}', pct(m.intelligible))}` : null,
    m.loudnessOk === undefined ? null : m.loudnessOk ? T('cast.voice.loudnessOk') : `${T('cast.voice.loudnessOff')}${m.lufs !== undefined ? ` (${Math.round(m.lufs)} LUFS)` : ''}`,
  ].filter(Boolean);
  const accentPending = c.language === 'AR' && heard.dialect !== 'APPROVED' && (x.origin === 'DESIGNED' || iraqi);
  return (
    <div className="mt-4 space-y-2 border-t border-line-soft pt-4 text-[13px] leading-5">
      <p className="text-body"><span className="text-faint">{T('cast.voice.measuredLabel')} · </span>{measured.length ? measured.join(' · ') : T('cast.voice.notMeasured')}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="min-w-0 text-body">
          <span className="text-faint">{T('cast.voice.listenedLabel')} · </span>
          {heard.last
            ? <>{T('cast.voice.natural').replace('{n}', String(heard.last.natural))}{heard.dialect === 'APPROVED' ? ` · ${T('cast.voice.iraqiYes')}` : heard.dialect === 'REJECTED' ? ` · ${T('cast.voice.iraqiNo')}` : ''}</>
            : T('cast.voice.notListened')}
        </p>
        {!open && <Button size="sm" variant="quiet" icon={<IconCheck />} onClick={() => setOpen(true)}>{T('cast.voice.iListened')}</Button>}
      </div>
      {accentPending && <p className="text-warn">{iraqi ? T('cast.voice.iraqiPending') : T('cast.voice.accentPending')}</p>}
      {open && (
        <form className="mt-2 space-y-4 rounded-[var(--r-2)] bg-input p-4" onSubmit={save}>
          <div><p className="label">{T('cast.voice.naturalQ')}</p><Segmented label={T('cast.voice.naturalQ')} value={natural} onChange={setNatural} options={['1', '2', '3', '4', '5'].map((n) => ({ value: n, label: n }))} /><p className="help">{T('cast.voice.naturalHelp')}</p></div>
          {iraqi && <div><p className="label">{T('cast.voice.iraqiQ')}</p><Segmented label={T('cast.voice.iraqiQ')} value={authentic} onChange={setAuthentic} options={[{ value: 'YES', label: T('cast.voice.yes') }, { value: 'NO', label: T('cast.voice.no') }]} /></div>}
          <Field label={T('cast.voice.listenNote')} hint={T('wizard.optional')}><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} /></Field>
          <div className="flex flex-wrap gap-2"><Button type="submit" size="sm" variant="secondary" disabled={!natural || (iraqi && !authentic)}>{T('cast.voice.saveListening')}</Button><Button size="sm" variant="quiet" onClick={() => setOpen(false)}>{T('btn.cancel')}</Button></div>
        </form>
      )}
    </div>
  );
}

/** Speak any text with the pinned voice, inline; the take appears under "Takes" with its phase. */
function PreviewLine({ c }: { c: Character }) {
  const T = useT();
  const { startJob } = useStudio();
  const toast = useToast();
  const running = useJobsFor({ characterId: c.id, type: 'VOICE_PREVIEW' }).find((j) => isActiveStatus(j.status));
  const [text, setText] = useState(c.language === 'AR' ? (c.dialect === 'IRAQI_BAGHDADI' ? 'شلونك؟ اني هنا من زمان، وين چنت؟' : 'مرحباً، أنا هنا منذ وقت طويل، أين كنت؟') : 'Hello. I have been here a while — where were you?');
  const [busy, setBusy] = useState(false);
  const speak = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); try { await startJob('VOICE_PREVIEW', { characterId: c.id, text }); } catch (err) { toast.bad(`${T('gen.failed')}: ${(err as Error).message}`); } finally { setBusy(false); } };
  return (
    <form className="mt-4 border-t border-line-soft pt-4" onSubmit={(e) => void speak(e)}>
      <label className="label" htmlFor={`preview-${c.id}`}>{T('cast.voice.previewLine')}</label>
      <div className="flex flex-wrap items-center gap-2">
        <Input id={`preview-${c.id}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={600} className="min-w-0 flex-1 basis-64" />
        <Button type="submit" variant="secondary" icon={<IconVoice />} loading={busy} disabled={!text.trim() || Boolean(running)}>{T('cast.voice.speak')}</Button>
      </div>
      {running && <p className="mt-2"><Status tone="info" live className="max-w-full truncate">{running.progress?.message || T('jobs.inProgress')}</Status></p>}
    </form>
  );
}

type Method = 'AUTOMATIC' | 'DESIGN' | 'RECORDING';

/** Create or replace the voice: Automatic, Design a voice, or a Recording. */
function CreateVoice({ c, open }: { c: Character; open: boolean }) {
  const T = useT();
  const { state } = useStudio();
  const identity = c.voice.identity;
  const iraqi = c.dialect === 'IRAQI_BAGHDADI';
  const uploads = c.voice.samples.filter((s) => s.source === 'UPLOADED');
  const experiment = designedIraqiAllowed(state.settings);
  const [method, setMethod] = useState<Method>(iraqi ? 'RECORDING' : 'AUTOMATIC');
  const methods: Array<{ value: Method; label: string; hint: string }> = [
    { value: 'AUTOMATIC', label: T('cast.voice.m.automatic'), hint: iraqi && !uploads.length && !experiment ? T('cast.voice.iraqiNeedsRecording') : T('cast.voice.m.automatic.hint') },
    { value: 'DESIGN', label: T('cast.voice.m.design'), hint: T('cast.voice.m.design.hint') },
    { value: 'RECORDING', label: T('cast.voice.m.recording'), hint: T('cast.voice.m.recording.hint') },
  ];
  return (
    <Details summary={identity ? T('cast.voice.replace') : T('cast.voice.create')} open={open} className="mt-6">
      <div className="space-y-6">
        <div role="radiogroup" aria-label={T('cast.voice.how')} className="grid gap-2 md:grid-cols-3 md:gap-3">
          {methods.map((m) => (
            <label key={m.value} data-selected={method === m.value || undefined} className="tile-choice min-h-16 gap-1 px-4 py-3">
              <input type="radio" name={`voice-method-${c.id}`} value={m.value} checked={method === m.value} onChange={() => setMethod(m.value)} className="sr-only" />
              <span className="flex items-center gap-3"><span className="min-w-0 flex-1 text-[15px] font-semibold leading-5 text-fg">{m.label}</span><span aria-hidden className="radio-mark" /></span>
              <span className="text-[13px] leading-5 text-muted">{m.hint}</span>
            </label>
          ))}
        </div>
        <div key={method} className="fade-in">
          {method === 'AUTOMATIC' && <Automatic c={c} hasUploads={uploads.length > 0} experiment={experiment} />}
          {method === 'DESIGN' && <Design c={c} />}
          {method === 'RECORDING' && <Recording c={c} />}
        </div>
      </div>
    </Details>
  );
}

/** The job of a kind for this character that is running now, or the newest one. */
function useLatest(c: Character, type: string): { running?: Job; last?: Job } {
  const { jobs } = useStudio();
  const mine = jobs.filter((j) => j.characterId === c.id && String(j.type) === type).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { running: mine.find((j) => isActiveStatus(j.status)), last: mine[0] };
}

/** Start a job; a refusal is said in a toast — except CONSENT_REQUIRED (the server refused a build from a recording
 *  without a consent statement), which the panel answers with the consent choice instead (consentNeeded). */
function useLaunch() {
  const T = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [consentNeeded, setConsentNeeded] = useState<{ sampleId?: unknown } | null>(null);
  const run = async (f: () => Promise<StartedJob>) => {
    setBusy(true); setConsentNeeded(null);
    try { const job = await f(); for (const w of job.warnings ?? []) toast.push({ tone: 'info', text: w.detail }); return job; }
    catch (e) {
      if (isStudioError(e) && e.code === 'CONSENT_REQUIRED') { setConsentNeeded({ sampleId: e.details?.sampleId }); return null; }
      toast.bad(`${T('gen.failed')}: ${isStudioError(e) ? e.message : (e as Error).message}`); return null;
    }
    finally { setBusy(false); }
  };
  return { run, busy, consentNeeded };
}

function JobPhase({ job }: { job: Job }) {
  const T = useT();
  return <Status tone="info" live className="max-w-full truncate" title={job.progress?.message}>{job.progress?.phase ? `${T.dyn(`jp.${job.progress.phase}`)} · ` : ''}{job.progress?.message || T('jobs.inProgress')}</Status>;
}

/** AUTOMATIC — one action. English and Modern Standard Arabic are designed from the profile; an Iraqi voice is cloned
 *  only from an Iraqi recording (or, with the experiment switch on, from a designed seed that stays unverified). */
function Automatic({ c, hasUploads, experiment }: { c: Character; hasUploads: boolean; experiment: boolean }) {
  const T = useT();
  const { startJob } = useStudio();
  const copyOf = useErrorCopy();
  const { run, busy, consentNeeded } = useLaunch();
  const { running, last } = useLatest(c, 'VOICE_BUILD');
  const build = () => run(() => startVoiceBuildV2(startJob, { characterId: c.id, mode: 'AUTOMATIC' }));
  const failed = last?.status === 'FAILED' ? copyOf(last.error) : null;
  const iraqi = c.dialect === 'IRAQI_BAGHDADI';
  const blocked = iraqi && !hasUploads && !experiment;
  return (
    <div className="space-y-3">
      <p className="max-w-[64ch] text-[13px] leading-5 text-muted">{iraqi ? (hasUploads ? T('cast.voice.auto.iraqiFromRecording') : experiment ? T('cast.voice.auto.iraqiExperiment') : T('cast.voice.iraqiNeedsRecording')) : c.language === 'AR' ? T('cast.voice.auto.msa') : T('cast.voice.auto.en')}</p>
      {running ? <JobPhase job={running} /> : (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" icon={<IconGenerate />} loading={busy} disabled={blocked} onClick={() => void build()}>{T('cast.voice.auto.go')}</Button>
          {consentNeeded && <div className="basis-full"><ConsentChoice characterId={c.id} sampleId={consentNeeded.sampleId} onConfirmed={() => void build()} /></div>}
          {last && failed && !consentNeeded && <div className="basis-full"><FailureNotice copy={failed} jobId={last.id} action={failed.fix.kind === 'consent' ? <ConsentChoice characterId={c.id} sampleId={last.error?.details?.sampleId} job={last} /> : <RetryControl job={last} size="sm" />} /></div>}
        </div>
      )}
    </div>
  );
}

/** DESIGN A VOICE — a description (prefilled from the profile, editable) → three candidates speaking a calibration
 *  sentence, each with a real player and its measured numbers → choose one. A designed voice is synthetic and belongs
 *  to nobody; a description that names a real person is refused by the service. */
function Design({ c }: { c: Character }) {
  const T = useT();
  const { state, startJob } = useStudio();
  const copyOf = useErrorCopy();
  const { run, busy } = useLaunch();
  const { running, last } = useLatest(c, 'VOICE_DESIGN');
  const build = useLatest(c, 'VOICE_BUILD');
  const [description, setDescription] = useState(() => voiceDescriptionOf(c));
  const result = last?.status === 'COMPLETED' ? designResultOf(last) : null;
  const lang = useLang(c);
  return (
    <div className="space-y-4">
      <Field label={T('cast.voice.design.description')} hint={<span className="num" dir="ltr">{description.length} / 600</span>} help={T('cast.voice.design.help')}>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={600} dir="auto" />
      </Field>
      {c.dialect === 'IRAQI_BAGHDADI' && <p className="text-[13px] text-warn">{T('cast.voice.design.iraqiNote')}</p>}
      {running ? <JobPhase job={running} /> : <Button variant="secondary" icon={<IconGenerate />} loading={busy} disabled={description.trim().length < 12} onClick={() => void run(() => startVoiceDesign(startJob, c.id, description.trim()))}>{T('cast.voice.design.go')}</Button>}
      {last?.status === 'FAILED' && !running && <FailureNotice copy={copyOf(last.error)} jobId={last.id} action={<RetryControl job={last} size="sm" />} />}
      {result && !running && (
        <div>
          <h3 className="h3">{T('cast.voice.design.candidates')}</h3>
          <p className="mt-1 text-[13px] text-faint">{T('cast.voice.origin.designed')}</p>
          <ul className="rows mt-3">
            {result.candidates.map((cand) => {
              const a = assetById(state, cand.assetId);
              const track: Track | null = a && !a.unavailable && a.src ? { id: `design-${result.designId}-${cand.index}`, src: a.src, title: `${c.name} — ${T('cast.voice.design.candidate')} ${cand.index}`, subtitle: lang, duration: a.durationSeconds ?? cand.durationSeconds } : null;
              const numbers = [cand.coverage !== undefined ? T('cast.voice.wordsHeard').replace('{p}', pct(cand.coverage)) : cand.cer !== undefined ? T('cast.voice.wordsHeard').replace('{p}', pct(Math.max(0, 1 - cand.cer))) : null, cand.passed === false ? T('cast.voice.design.failedGate') : null].filter(Boolean).join(' · ');
              return (
                <li key={cand.index} className="py-3">
                  <VoicePlayer track={track} name={`${T('cast.voice.design.candidate')} ${cand.index}`} detail={numbers || T('cast.voice.notMeasured')} source="GENERATED" unavailableText={T('media.unavailable')}
                    action={build.running ? undefined : <Button size="sm" variant="secondary" icon={<IconCheck />} disabled={cand.passed === false} onClick={() => void run(() => startVoiceBuildV2(startJob, { characterId: c.id, mode: 'DESIGN', designId: result.designId, candidate: cand.index }))}>{T('cast.voice.design.choose')}</Button>} />
                </li>
              );
            })}
          </ul>
          {build.running && <p className="mt-2"><JobPhase job={build.running} /></p>}
        </div>
      )}
    </div>
  );
}

/** RECORDING — a real person's voice: the producer states consent first, then records here (MediaRecorder) or drops
 *  a file; the browser measures the length, the studio checks speech, loudness and language; the voice is built from
 *  the chosen recording. */
function Recording({ c }: { c: Character }) {
  const T = useT();
  const { state, refresh, act } = useStudio();
  const toast = useToast();
  const identity = c.voice.identity;
  const vlock = voiceLock(c);
  const lang = useLang(c);
  const uploaded = c.voice.samples.filter((s) => s.source === 'UPLOADED');
  const selected = c.voice.samples.find((s) => s.id === c.voice.selectedSampleId);
  const buildFrom = (selected?.source === 'UPLOADED' ? selected : undefined) ?? uploaded[uploaded.length - 1];
  const [consent, setConsent] = useState<ConsentStatement | ''>('');
  const [measured, setMeasured] = useState<{ seconds: number | null; verdict: AudioVerdict } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [refusal, setRefusal] = useState<{ code: VoiceReferenceRefusal | 'BROWSER'; message: string } | null>(null);
  const [checked, setChecked] = useState<string | null>(null);
  const trackFor = (sm: VoiceSample): Track | null => { const a = assetById(state, sm.assetId); return a && !a.unavailable && a.src ? { id: `voice-${c.id}-${sm.id}`, src: a.src, title: `${c.name} — ${sm.label}`, subtitle: lang, duration: a.durationSeconds } : null; };

  const upload = async (file: File) => {
    setRefusal(null); setChecked(null);
    if (!consent) { setRefusal({ code: 'BROWSER', message: T('cast.voice.consentFirst') }); return; }
    if (checkAudioFile(file)) { setRefusal({ code: 'BROWSER', message: T('voice.notAudio') }); setMeasured(null); return; }
    const seconds = await measureAudio(file);
    const verdict = seconds === null ? 'OK' : checkAudioDuration(seconds);
    setMeasured({ seconds, verdict });
    if (verdict === 'TOO_SHORT') { setRefusal({ code: 'TOO_SHORT', message: T('voice.refuse.TOO_SHORT') }); return; }
    setUploading(true);
    try {
      const r = await api.uploadVoiceReference(c.id, file, { label: file.name.replace(/\.[a-z0-9]+$/i, ''), language: c.language, dialect: c.dialect, consent });
      if (!r.ok) { setRefusal({ code: r.code, message: r.message }); return; }
      await refresh();
      const v = r.validation;
      setChecked(`${fmtSeconds(Math.round(v.durationSeconds * 10) / 10)} · ${v.speech.present ? T('cast.voice.clearSpeech') : T('cast.voice.noSpeech')} · ${v.speech.language === 'UNKNOWN' ? T('voice.langUnknown') : v.speech.language === 'AR' ? T('label.arabic') : T('label.english')}`);
      toast.ok(T('voice.added'));
    } catch (e) { setRefusal({ code: 'BROWSER', message: isStudioError(e) ? e.message : (e as Error).message }); }
    finally { setUploading(false); }
  };
  const refusalText = refusal && (refusal.code === 'BROWSER' ? refusal.message : `${T.dyn(`voice.refuse.${refusal.code}`, refusal.message)}${refusal.message && refusal.code !== 'TOO_SHORT' ? ` — ${refusal.message}` : ''}`);
  return (
    <div className="space-y-6">
      <div>
        <p className="label">{T('cast.voice.consent')}</p>
        <Segmented label={T('cast.voice.consent')} value={consent || 'NONE'} onChange={(v) => setConsent(v === 'NONE' ? '' : (v as ConsentStatement))} options={[{ value: 'MY_VOICE', label: T('cast.voice.consent.mine') }, { value: 'SPEAKER_PERMISSION', label: T('cast.voice.consent.permission') }]} />
        <p className="help">{consent ? T('cast.voice.consent.recorded') : T('cast.voice.consentFirst')}</p>
      </div>
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <Recorder onFile={(f) => void upload(f)} disabled={uploading || !consent} />
          <Dropzone className="min-w-0 flex-1" label={T('cast.voice.drop')} hint={T('cast.voice.dropHint')} accept="audio/*" icon={<IconVoice />} busy={uploading} disabled={!consent} onFile={(f) => void upload(f)} error={refusalText} row />
        </div>
        {(measured || checked) && !refusal && (
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1" role="status">
            {measured && <span className={cls('status whitespace-normal', measured.verdict === 'OK' ? 'status-ok' : 'status-warn')}>{measured.seconds === null ? T('voice.measured.unknown') : `${T('cast.voice.measured')} ${fmtSeconds(Math.round(measured.seconds * 10) / 10)}${measured.verdict === 'TOO_LONG' ? ` · ${T('voice.measured.longHint')}` : ''}`}</span>}
            {checked && <span className="status status-ok whitespace-normal">{T('voice.checkedByStudio')}: <span className="num">{checked}</span></span>}
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
  );
}

/** Record in the browser (MediaRecorder): start, a running clock, stop — at most 30 seconds. The recording is then
 *  checked exactly like a dropped file. Hidden where the browser cannot record. */
function Recorder({ onFile, disabled }: { onFile: (f: File) => void; disabled?: boolean }) {
  const T = useT();
  const [supported, setSupported] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'asking' | 'recording'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  useEffect(() => { setSupported(typeof window !== 'undefined' && 'MediaRecorder' in window && Boolean(navigator.mediaDevices?.getUserMedia)); }, []);
  useEffect(() => { if (phase !== 'recording') return; const t = setInterval(() => setSeconds((s) => { if (s + 1 >= 30) rec.current?.stop(); return s + 1; }), 1000); return () => clearInterval(t); }, [phase]);
  useEffect(() => () => { if (rec.current?.state === 'recording') rec.current.stop(); }, []);
  if (!supported) return null;
  const start = async () => {
    setError(null); setPhase('asking');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream); const chunks: Blob[] = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      r.onstop = () => { stream.getTracks().forEach((t) => t.stop()); setPhase('idle'); const type = r.mimeType || 'audio/webm'; const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm'; onFile(new File(chunks, `recording-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`, { type })); };
      rec.current = r; r.start(); setSeconds(0); setPhase('recording');
    } catch { setPhase('idle'); setError(T('cast.voice.micRefused')); }
  };
  return (
    <div className="flex flex-none flex-col justify-center gap-1">
      {phase === 'recording'
        ? <Button variant="secondary" onClick={() => rec.current?.stop()}><span aria-hidden className="dot dot-live bg-bad" />{T('cast.voice.stop')} <span className="num font-normal text-muted" aria-live="polite">{fmtSeconds(seconds)}</span></Button>
        : <Button variant="secondary" disabled={disabled} loading={phase === 'asking'} onClick={() => void start()}><span aria-hidden className="dot bg-bad" />{T('cast.voice.record')}</Button>}
      {error && <p role="alert" className="text-xs text-bad">{error}</p>}
    </div>
  );
}

/** "Build voice from …": VOICE_BUILD `{ characterId, mode: 'REFERENCE', referenceSampleId }` from a recording you
 *  uploaded; never from a generated line. Disabled with the reason when there is nothing to build from. */
function BuildVoice({ c, from, locked }: { c: Character; from?: VoiceSample; locked: boolean }) {
  const T = useT();
  const { startJob } = useStudio();
  const copyOf = useErrorCopy();
  const { run, busy, consentNeeded } = useLaunch();
  const mine = useJobsFor({ characterId: c.id, type: 'VOICE_BUILD' });
  const active = mine.find((j) => isActiveStatus(j.status));
  const last = mine[0];
  if (active) return <JobPhase job={active} />;
  const build = () => { if (from) void run(() => startVoiceBuild(startJob, { characterId: c.id, mode: 'REFERENCE', referenceSampleId: from.id })); };
  const failed = last?.status === 'FAILED' ? copyOf(last.error) : null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line-soft pt-5">
      <Button variant="primary" icon={<IconGenerate />} loading={busy} disabled={!from || locked} aria-describedby={locked ? 'voice-lock' : undefined} onClick={build} className="max-w-full"><span className="truncate">{from ? `${T('cast.voice.buildFrom')} “${from.label}”` : T('gen.voiceBuild')}</span></Button>
      {!from && <span className="text-[13px] text-faint" role="status">{T('voice.build.needRecording')}</span>}
      {consentNeeded && <div className="basis-full"><ConsentChoice characterId={c.id} sampleId={consentNeeded.sampleId ?? from?.id} onConfirmed={build} /></div>}
      {last && failed && !consentNeeded && <div className="basis-full"><FailureNotice copy={failed} jobId={last.id} action={failed.fix.kind === 'reference' ? <span className="text-[13px] text-muted">{T('voice.build.needRecording')}</span> : failed.fix.kind === 'consent' ? <ConsentChoice characterId={c.id} sampleId={last.error?.details?.sampleId} job={last} /> : <RetryControl job={last} size="sm" />} /></div>}
    </div>
  );
}
