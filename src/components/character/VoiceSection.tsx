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
import { useToast } from '@/components/ui/toast';
import { Button, Dropzone, Field, Input, Segmented, StateWord, Textarea, type StateTone } from '@/components/ui/kit';
import { FailureNotice, useErrorCopy } from '@/components/ui/progress';
import { RetryControl } from '@/components/ui/jobs';
import { IconCheck, IconEdit, IconGenerate, IconShield, IconVoice } from '@/components/ui/icons';
import type { Track } from '@/components/players/PlayerProvider';
import { dialectLabel, fmtSeconds } from '@/lib/format';
import { designResultOf, designedIraqiAllowed, recordVoiceListening, startVoiceBuild, startVoiceBuildV2, startVoiceDesign, voiceDescriptionOf, voiceExtras, type ConsentStatement, type VoiceReferenceRefusal } from './contract';
import { voiceListened, voiceMeasures, voiceOrigin, voiceState } from './identity';
import { VoicePlayer } from './VoicePlayer';
import { PACE_WORD, PITCH_WORD, VoiceTraitsDialog } from './EditDialogs';
import { checkAudioDuration, checkAudioFile, measureAudio, type AudioVerdict } from './create/preflight';
import { ConsentChoice } from './ConsentChoice';
import { CardHead, CastSection } from './parts';

/** THE ONE VOICE (docs/CONTRACTS-VOICE-IDENTITY-V2.md; v5 §8.8) — in two places on the profile:
 *
 *  VoiceSummary, beside the figure: the voice you can hear as one audio row (the proof line, else the chosen sample),
 *  where it comes from, its state in one word, and "Voice settings" down to the section.
 *
 *  VoiceSection, the "Voice" section: what was measured and what a listener said (never "natural" or "Iraqi" without a
 *  listening record — "I listened" adds one), a line to preview, the ways to make or replace the voice while it may
 *  still change (Automatic · Design a voice · A recording with consent), the lines already spoken, and how it should
 *  sound. Once the character has spoken in a video the voice is held, said once. Every write goes through the same
 *  commands and jobs as before. */

/** The engine, in words a producer can read. */
export function engineName(identity: Character['voice']['identity']): string {
  if (!identity) return '—';
  if (identity.provider === 'MINIMAX') return 'Hosted voice';
  const m = identity.model.toLowerCase();
  return m.includes('habibi') ? 'Iraqi dialect engine' : m.includes('index') ? 'Bilingual studio engine' : 'Studio voice engine';
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const langOf = (c: Character) => `${c.language === 'EN' ? 'English' : 'Arabic'}${c.dialect ? ` · ${dialectLabel(c.dialect)}` : ''}`;
const phaseWord = (p: string) => ({ QUEUED: 'Queued', PREPARING: 'Preparing', GENERATING: 'Generating', VALIDATING: 'Checking the result', POSTPROCESSING: 'Saving' } as Record<string, string>)[p] ?? p.replace(/_/g, ' ').toLowerCase().replace(/^./, (x) => x.toUpperCase());
const REFUSAL: Record<string, string> = {
  TOO_SHORT: 'Too short: at least 3 seconds of speech.', TOO_LONG: 'Too long: 30 seconds at most.', NO_SPEECH: 'No speech was heard: at least three words.', TOO_QUIET: 'Too quiet to use.',
  CLIPPING: 'The recording clips (distorted peaks).', WRONG_LANGUAGE: 'This recording is in another language than the character speaks.', BAD_FORMAT: 'The file could not be read as audio.',
};

/** The voice's state in one word, with its tone. */
export function voiceWord(c: Character): { tone: StateTone; words: string } {
  const v = voiceState(c);
  return v === 'MEASURED' ? { tone: 'done', words: 'Intelligible, measured' } : v === 'REVIEW' ? { tone: 'waiting', words: 'Needs a listen' } : v === 'STALE' ? { tone: 'waiting', words: 'Out of date: the language changed' } : v === 'UNCHECKED' ? { tone: 'idle', words: 'Not checked' } : { tone: 'idle', words: c.voice.selectedSampleId ? 'Sample chosen, not built' : 'No voice yet' };
}

function useVoiceTracks(c: Character) {
  const { state } = useStudio();
  const lang = langOf(c);
  const trackFor = (sm: VoiceSample | undefined, id?: string): Track | null => { const a = assetById(state, sm?.assetId ?? id); return a && !a.unavailable && a.src ? { id: `voice-${c.id}-${a.id}`, src: a.src, title: `${c.name} — ${sm?.label ?? 'Proof line'}`, subtitle: lang, duration: a.durationSeconds } : null; };
  const identity = c.voice.identity;
  const proofSample = identity?.proof ? c.voice.samples.find((s) => s.id === identity.proof!.sampleId) : undefined;
  return { trackFor, lang, proofTrack: identity?.proof ? trackFor(proofSample, identity.proof.assetId) : null, selected: c.voice.samples.find((s) => s.id === c.voice.selectedSampleId) };
}

/** The origin every voice carries: designed (synthetic, not a real person), a recording (whose), or hosted. */
function useOrigin(c: Character): string | null {
  const { state } = useStudio();
  const id = c.voice.identity; if (!id) return null;
  const origin = voiceOrigin(c);
  const ref = (id.referenceSampleId ? c.voice.samples.find((s) => s.id === id.referenceSampleId)?.label : undefined) ?? assetById(state, id.referenceAssetId)?.label;
  return origin === 'DESIGNED' ? 'Designed voice, not a real person' : origin === 'HOSTED' ? 'Hosted voice' : ref ? `Recording “${ref}”` : engineName(id);
}

export function VoiceSummary({ c }: { c: Character }) {
  const { proofTrack, selected, trackFor, lang } = useVoiceTracks(c);
  const identity = c.voice.identity;
  const origin = useOrigin(c);
  const w = voiceWord(c);
  const proofText = identity?.proof?.text;
  return (
    <div className="char-voice">
      {identity && proofTrack ? <VoicePlayer track={proofTrack} name={proofText ? `“${proofText}”` : 'Proof line'} detail={[origin, lang].filter(Boolean).join(' · ')} />
        : identity ? <VoicePlayer track={null} name="No proof line was kept for this voice" unavailableText={[origin, lang].filter(Boolean).join(' · ')} />
        : selected ? <VoicePlayer track={trackFor(selected)} name={selected.label} detail={lang} source={selected.source} />
        : <VoicePlayer track={null} name="No voice yet" unavailableText={c.dialect === 'IRAQI_BAGHDADI' ? 'Iraqi voices are made from a real Iraqi recording' : 'Make one automatically, by describing it, or from a recording'} />}
      <div className="char-voice-foot">
        <StateWord tone={w.tone}>{w.words}</StateWord>
        <a className="btn btn-quiet btn-sm" href="#voice">{identity || selected ? 'Voice settings' : 'Give them a voice'}</a>
      </div>
    </div>
  );
}

export function VoiceSection({ c }: { c: Character }) {
  const { trackFor } = useVoiceTracks(c);
  const identity = c.voice.identity;
  const vlock = voiceLock(c);
  const takes = c.voice.samples.filter((s) => s.source !== 'UPLOADED' && s.id !== identity?.proof?.sampleId);
  const canChange = !(vlock.locked && Boolean(identity));
  const [traits, setTraits] = useState(false);
  return (
    <CastSection id="voice" title="Voice" description="One voice, the same in every production.">
      <div className="char-stack">
        {vlock.locked && <p id="voice-lock" role="note" className="t-body char-note pc-lock"><IconShield aria-hidden /><span>This character has spoken in a video, so the voice is kept as it is. You can still listen and preview lines.</span></p>}
        {identity && (
          <div className="card char-card">
            <h3 className="t-title char-card-title">Measured and heard</h3>
            <Evaluation c={c} />
            <PreviewLine c={c} />
            {identity.proof && (
              <details className="details char-details">
                <summary>What was heard back</summary>
                <dl className="char-facts">
                  <div><dt className="t-label">Heard</dt><dd dir="auto">{identity.proof.heard || '—'}</dd></div>
                  <div><dt className="t-label">Words heard</dt><dd>{identity.proof.coverage !== undefined ? pct(identity.proof.coverage) : '—'}</dd></div>
                </dl>
              </details>
            )}
          </div>
        )}
        {canChange && <CreateVoice c={c} />}
        {takes.length > 0 && (
          <div>
            <CardHead title="Lines spoken" count={takes.length} />
            <p className="t-body char-card-line">Lines spoken to try the voice. Listen only: a voice is never built from them.</p>
            <ul className="vrow-list char-voice">{takes.map((sm) => <li key={sm.id}><VoicePlayer track={trackFor(sm)} name={sm.text ? `“${sm.text}”` : sm.label} detail={sm.source === 'SAMPLE' ? 'Sample' : 'Generated line'} unavailableText={sm.source === 'GENERATED' && !sm.assetId ? 'Not spoken yet: build the voice to hear it' : 'Recording unavailable'} /></li>)}</ul>
          </div>
        )}
        <div className="card char-card">
          <CardHead title="How it should sound" action={<Button size="sm" variant="secondary" icon={<IconEdit />} disabled={vlock.locked} aria-describedby={vlock.locked ? 'voice-lock' : undefined} onClick={() => setTraits(true)}>Edit</Button>} />
          <dl className="char-facts" data-flush>
            <div><dt className="t-label">Pitch</dt><dd>{PITCH_WORD[c.voice.pitch]}</dd></div>
            <div><dt className="t-label">Pace</dt><dd>{PACE_WORD[c.voice.pace]}</dd></div>
            <div><dt className="t-label">Timbre</dt><dd data-empty={!c.voice.timbre || undefined} dir="auto">{c.voice.timbre || 'Not written'}</dd></div>
            {c.voice.notes && <div><dt className="t-label">Performance notes</dt><dd dir="auto">{c.voice.notes}</dd></div>}
          </dl>
          <VoiceTraitsDialog c={c} open={traits} onClose={() => setTraits(false)} />
        </div>
      </div>
    </CastSection>
  );
}

/** Measured vs listened (contract v2 §4): the numbers in plain words, then the producer's own listening — or the plain
 *  statement that nobody has listened yet, with "I listened". */
function Evaluation({ c }: { c: Character }) {
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
    try { recordVoiceListening(act, c.id, { natural: Number(natural), dialectAuthentic: iraqi ? authentic === 'YES' : undefined, note: note.trim() || undefined }); toast.ok('Listening recorded.'); setOpen(false); }
    catch (err) { toast.bad((err as Error).message); }
  };
  const measured = [
    m.intelligible !== undefined ? `${pct(m.intelligible)} of words heard back` : null,
    m.loudnessOk === undefined ? null : m.loudnessOk ? 'loudness within range' : `loudness outside the range${m.lufs !== undefined ? ` (${Math.round(m.lufs)} LUFS)` : ''}`,
  ].filter(Boolean);
  const accentPending = c.language === 'AR' && heard.dialect !== 'APPROVED' && (x.origin === 'DESIGNED' || iraqi);
  return (
    <div className="char-measure">
      <p className="t-body"><b>Measured · </b>{measured.length ? measured.join(' · ') : 'not measured yet'}</p>
      <p className="t-body"><b>Listened · </b>{heard.last ? <>natural {heard.last.natural} of 5{heard.dialect === 'APPROVED' ? ' · sounds authentically Iraqi' : heard.dialect === 'REJECTED' ? ' · does not sound Iraqi' : ''}</> : 'nobody has listened yet, so naturalness is not claimed'}</p>
      {accentPending && <p className="t-body">{iraqi ? 'The Iraqi dialect has not been confirmed by a listener yet.' : 'The Arabic accent has not been confirmed by a listener yet.'}</p>}
      {!open ? <div className="char-card-acts" data-flush><Button size="sm" variant="secondary" icon={<IconCheck />} onClick={() => setOpen(true)}>I listened</Button></div> : (
        <form className="char-form char-voice" onSubmit={save}>
          <div><p className="label">How natural does it sound?</p><Segmented label="How natural does it sound?" value={natural} onChange={setNatural} options={['1', '2', '3', '4', '5'].map((n) => ({ value: n, label: n }))} /><p className="help">1 is clearly synthetic, 5 could be a person.</p></div>
          {iraqi && <div><p className="label">Does it sound authentically Iraqi?</p><Segmented label="Does it sound authentically Iraqi?" value={authentic} onChange={setAuthentic} options={[{ value: 'YES', label: 'Yes' }, { value: 'NO', label: 'No' }]} /></div>}
          <Field label="Note" optional><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} /></Field>
          <div className="char-form-acts"><Button size="sm" variant="quiet" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" size="sm" variant="primary" disabled={!natural || (iraqi && !authentic)}>Save what I heard</Button></div>
        </form>
      )}
    </div>
  );
}

/** Speak any text with the pinned voice; the line appears under "Lines spoken" with its phase. */
function PreviewLine({ c }: { c: Character }) {
  const { startJob } = useStudio();
  const toast = useToast();
  const running = useJobsFor({ characterId: c.id, type: 'VOICE_PREVIEW' }).find((j) => isActiveStatus(j.status));
  const [text, setText] = useState(c.language === 'AR' ? (c.dialect === 'IRAQI_BAGHDADI' ? 'شلونك؟ اني هنا من زمان، وين چنت؟' : 'مرحباً، أنا هنا منذ وقت طويل، أين كنت؟') : 'Hello. I have been here a while — where were you?');
  const [busy, setBusy] = useState(false);
  const speak = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); try { await startJob('VOICE_PREVIEW', { characterId: c.id, text }); } catch (err) { toast.bad(`Could not start: ${(err as Error).message}`); } finally { setBusy(false); } };
  return (
    <form className="char-voice" onSubmit={(e) => void speak(e)}>
      <label className="label" htmlFor={`preview-${c.id}`}>Preview a line</label>
      <div className="loc-add" data-flush>
        <Input id={`preview-${c.id}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={600} />
        <Button type="submit" variant="secondary" icon={<IconVoice />} loading={busy} disabled={!text.trim() || Boolean(running)}>Speak it</Button>
      </div>
      {running && <p className="help"><JobPhase job={running} /></p>}
    </form>
  );
}

type Method = 'AUTOMATIC' | 'DESIGN' | 'RECORDING';

/** Make or replace the voice: Automatic, Design a voice, or A recording. */
function CreateVoice({ c }: { c: Character }) {
  const { state } = useStudio();
  const identity = c.voice.identity;
  const iraqi = c.dialect === 'IRAQI_BAGHDADI';
  const uploads = c.voice.samples.filter((s) => s.source === 'UPLOADED');
  const experiment = designedIraqiAllowed(state.settings);
  const [method, setMethod] = useState<Method>(iraqi ? 'RECORDING' : 'AUTOMATIC');
  return (
    <div className="card char-card">
      <h3 className="t-title char-card-title">{identity ? 'Replace the voice' : 'Make the voice'}</h3>
      <p className="t-body char-card-line">{identity ? 'A new voice replaces this one everywhere the character has not spoken yet.' : 'Choose how: the studio designs it, you describe it, or a real recording.'}</p>
      <div className="char-voice char-methods">
        <Segmented label="How the voice is made" value={method} onChange={setMethod} options={[{ value: 'AUTOMATIC' as Method, label: 'Automatic' }, { value: 'DESIGN' as Method, label: 'Design a voice' }, { value: 'RECORDING' as Method, label: 'A recording' }]} />
      </div>
      <div key={method}>
        {method === 'AUTOMATIC' && <Automatic c={c} hasUploads={uploads.length > 0} experiment={experiment} />}
        {method === 'DESIGN' && <Design c={c} />}
        {method === 'RECORDING' && <Recording c={c} />}
      </div>
    </div>
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
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [consentNeeded, setConsentNeeded] = useState<{ sampleId?: unknown } | null>(null);
  const run = async (f: () => Promise<StartedJob>) => {
    setBusy(true); setConsentNeeded(null);
    try { const job = await f(); for (const w of job.warnings ?? []) toast.push({ tone: 'info', text: w.detail }); return job; }
    catch (e) {
      if (isStudioError(e) && e.code === 'CONSENT_REQUIRED') { setConsentNeeded({ sampleId: e.details?.sampleId }); return null; }
      toast.bad(`Could not start: ${isStudioError(e) ? e.message : (e as Error).message}`); return null;
    }
    finally { setBusy(false); }
  };
  return { run, busy, consentNeeded };
}

function JobPhase({ job }: { job: Job }) {
  return <StateWord tone="running" title={job.progress?.message}>{job.progress?.phase ? `${phaseWord(job.progress.phase)} · ` : ''}{job.progress?.message || 'In progress'}</StateWord>;
}

/** AUTOMATIC — one action. English and Modern Standard Arabic are designed from the profile; an Iraqi voice is made
 *  only from an Iraqi recording (or, with the experiment switch on, from a designed seed that stays unverified). */
function Automatic({ c, hasUploads, experiment }: { c: Character; hasUploads: boolean; experiment: boolean }) {
  const { startJob } = useStudio();
  const copyOf = useErrorCopy();
  const { run, busy, consentNeeded } = useLaunch();
  const { running, last } = useLatest(c, 'VOICE_BUILD');
  const build = () => run(() => startVoiceBuildV2(startJob, { characterId: c.id, mode: 'AUTOMATIC' }));
  const failed = last?.status === 'FAILED' ? copyOf(last.error) : null;
  const iraqi = c.dialect === 'IRAQI_BAGHDADI';
  const blocked = iraqi && !hasUploads && !experiment;
  return (
    <div className="char-form">
      <p className="t-body char-card-line">{iraqi ? (hasUploads ? 'The voice is made from your Iraqi recording.' : experiment ? 'Experiment on: a designed Arabic voice stands in for an Iraqi character; the dialect stays unconfirmed until a listener says so.' : 'Iraqi voices are made from a real Iraqi recording: record or upload 5 to 12 seconds of the voice under “A recording”.') : c.language === 'AR' ? 'One synthetic Modern Standard Arabic voice is designed from the profile and measured. Its accent waits for a listener.' : 'One synthetic voice is designed from the profile (sex, age, pitch, pace, timbre) and measured; you hear it before it speaks any line.'}</p>
      {running ? <JobPhase job={running} /> : (
        <div className="char-form-acts">
          <Button variant="primary" icon={<IconGenerate />} loading={busy} disabled={blocked} onClick={() => void build()}>Make the voice</Button>
          {consentNeeded && <ConsentChoice characterId={c.id} sampleId={consentNeeded.sampleId} onConfirmed={() => void build()} />}
        </div>
      )}
      {!running && last && failed && !consentNeeded && <FailureNotice copy={failed} jobId={last.id} action={failed.fix.kind === 'consent' ? <ConsentChoice characterId={c.id} sampleId={last.error?.details?.sampleId} job={last} /> : <RetryControl job={last} size="sm" />} />}
    </div>
  );
}

/** DESIGN A VOICE — a description (prefilled from the profile, editable) → ONE designed voice speaking a calibration
 *  sentence, with a real player and its measured numbers → use it (first-attempt policy: no candidate grid). A designed voice is synthetic and belongs
 *  to nobody; a description that names a real person is refused by the service. */
function Design({ c }: { c: Character }) {
  const { state, startJob } = useStudio();
  const copyOf = useErrorCopy();
  const { run, busy } = useLaunch();
  const { running, last } = useLatest(c, 'VOICE_DESIGN');
  const build = useLatest(c, 'VOICE_BUILD');
  const [description, setDescription] = useState(() => voiceDescriptionOf(c));
  const result = last?.status === 'COMPLETED' ? designResultOf(last) : null;
  const lang = langOf(c);
  return (
    <div className="char-form">
      <Field label="Describe the voice" hint={`${description.length} / 600`} help="Written from the profile; change anything. Never name or imitate a real person.">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={600} dir="auto" />
      </Field>
      {c.dialect === 'IRAQI_BAGHDADI' && <p className="t-body char-card-line">Designed voices speak English or Modern Standard Arabic; an Iraqi voice needs a recording.</p>}
      {running ? <JobPhase job={running} /> : <div className="char-form-acts"><Button variant="primary" icon={<IconGenerate />} loading={busy} disabled={description.trim().length < 12} onClick={() => void run(() => startVoiceDesign(startJob, c.id, description.trim()))}>Design the voice</Button></div>}
      {last?.status === 'FAILED' && !running && <FailureNotice copy={copyOf(last.error)} jobId={last.id} action={<RetryControl job={last} size="sm" />} />}
      {result && !running && (
        <div>
          <p className="label">The designed voice · synthetic, not a real person</p>
          <ul className="vrow-list">
            {result.candidates.map((cand) => {
              const a = assetById(state, cand.assetId);
              const track: Track | null = a && !a.unavailable && a.src ? { id: `design-${result.designId}-${cand.index}`, src: a.src, title: `${c.name} — designed voice`, subtitle: lang, duration: a.durationSeconds ?? cand.durationSeconds } : null;
              const heard = cand.coverage !== undefined ? cand.coverage : cand.cer !== undefined ? Math.max(0, 1 - cand.cer) : undefined;
              const numbers = [heard !== undefined ? `${pct(heard)} of words heard back` : null, cand.passed === false ? 'did not pass the measured checks' : null].filter(Boolean).join(' · ');
              return (
                <li key={cand.index}>
                  <VoicePlayer track={track} name="Designed voice" detail={numbers || 'not measured yet'}
                    action={build.running ? undefined : <Button size="sm" variant="secondary" icon={<IconCheck />} disabled={cand.passed === false} onClick={() => void run(() => startVoiceBuildV2(startJob, { characterId: c.id, mode: 'DESIGN', designId: result.designId, candidate: cand.index }))}>Use this voice</Button>} />
                </li>
              );
            })}
          </ul>
          {build.running && <p className="help"><JobPhase job={build.running} /></p>}
        </div>
      )}
    </div>
  );
}

/** A RECORDING — a real person's voice: the producer states consent first, then records here (MediaRecorder) or drops
 *  a file; the browser measures the length, the studio checks speech, loudness and language; the voice is built from
 *  the chosen recording. */
function Recording({ c }: { c: Character }) {
  const { state, refresh, act } = useStudio();
  const toast = useToast();
  const identity = c.voice.identity;
  const vlock = voiceLock(c);
  const lang = langOf(c);
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
    if (!consent) { setRefusal({ code: 'BROWSER', message: 'Say whose voice it is before recording or uploading.' }); return; }
    if (checkAudioFile(file)) { setRefusal({ code: 'BROWSER', message: 'Choose an audio file.' }); setMeasured(null); return; }
    const seconds = await measureAudio(file);
    const verdict = seconds === null ? 'OK' : checkAudioDuration(seconds);
    setMeasured({ seconds, verdict });
    if (verdict === 'TOO_SHORT') { setRefusal({ code: 'TOO_SHORT', message: REFUSAL.TOO_SHORT }); return; }
    setUploading(true);
    try {
      const r = await api.uploadVoiceReference(c.id, file, { label: file.name.replace(/\.[a-z0-9]+$/i, ''), language: c.language, dialect: c.dialect, consent });
      if (!r.ok) { setRefusal({ code: r.code, message: r.message }); return; }
      await refresh();
      const v = r.validation;
      setChecked(`${fmtSeconds(Math.round(v.durationSeconds * 10) / 10)} · ${v.speech.present ? 'speech heard' : 'no speech heard'} · ${v.speech.language === 'UNKNOWN' ? 'language unclear' : v.speech.language === 'AR' ? 'Arabic' : 'English'}`);
      toast.ok('Recording added.');
    } catch (e) { setRefusal({ code: 'BROWSER', message: isStudioError(e) ? e.message : (e as Error).message }); }
    finally { setUploading(false); }
  };
  const refusalText = refusal && (refusal.code === 'BROWSER' || refusal.code === 'TOO_SHORT' ? refusal.message : `${REFUSAL[refusal.code] ?? 'The recording was refused.'}${refusal.message ? ` ${refusal.message}` : ''}`);
  return (
    <div className="char-form">
      <div>
        <p className="label">Whose voice is this?</p>
        <Segmented label="Whose voice is this?" value={consent || 'NONE'} onChange={(v) => setConsent(v === 'NONE' ? '' : (v as ConsentStatement))} options={[{ value: 'MY_VOICE', label: 'My voice' }, { value: 'SPEAKER_PERMISSION', label: 'I have the speaker’s permission' }]} />
        <p className="help">{consent ? 'Your statement is recorded with the recording.' : 'Say whose voice it is before recording or uploading.'}</p>
      </div>
      <div>
        <div className="char-form-acts">
          <Recorder onFile={(f) => void upload(f)} disabled={uploading || !consent} />
          <Dropzone className="pc-grow" label="or drop a recording" hint="WAV, MP3, M4A or OGG · 3 to 30 seconds" accept="audio/*" icon={<IconVoice />} busy={uploading} disabled={!consent} onFile={(f) => void upload(f)} error={refusalText} row />
        </div>
        {(measured || checked) && !refusal && (
          <p className="help" role="status">
            {measured && (measured.seconds === null ? 'The length could not be read here; the studio measures it. ' : `Measured ${fmtSeconds(Math.round(measured.seconds * 10) / 10)}${measured.verdict === 'TOO_LONG' ? ' · a window of up to 12 seconds after a short lead-in is used' : ''}. `)}
            {checked && <>Checked by the studio: {checked}.</>}
          </p>
        )}
      </div>
      <div>
        <p className="label">Your recordings · {uploaded.length}</p>
        {uploaded.length === 0 ? <p className="t-body char-card-line">No recording yet.</p> : (
          <ul className="vrow-list" role="radiogroup" aria-label="Your recordings">
            {uploaded.map((sm) => {
              const on = buildFrom?.id === sm.id; const track = trackFor(sm);
              return (
                <li key={sm.id}>
                  <VoicePlayer track={track} name={sm.label} detail={sm.text || lang} source="UPLOADED" selected={on}
                    action={<button type="button" role="radio" aria-checked={on} disabled={!track && !on} className={`btn btn-sm ${on ? 'btn-secondary' : 'btn-quiet'}`} onClick={() => { try { if (!on) act('selectVoiceSample', c.id, sm.id); } catch (e) { toast.bad((e as Error).message); } }}>{on ? 'Reference' : 'Use as reference'}</button>} />
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
    } catch { setPhase('idle'); setError('The browser did not allow the microphone.'); }
  };
  return (
    <div>
      {phase === 'recording'
        ? <Button variant="secondary" onClick={() => rec.current?.stop()}>Stop · <span className="arow-time" aria-live="polite">{fmtSeconds(seconds)}</span></Button>
        : <Button variant="secondary" disabled={disabled} loading={phase === 'asking'} onClick={() => void start()}>Record</Button>}
      {error && <p role="alert" className="help">{error}</p>}
    </div>
  );
}

/** "Build the voice from …": VOICE_BUILD `{ characterId, mode: 'REFERENCE', referenceSampleId }` from a recording you
 *  uploaded; never from a generated line. Disabled with the reason when there is nothing to build from. */
function BuildVoice({ c, from, locked }: { c: Character; from?: VoiceSample; locked: boolean }) {
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
    <div className="char-form">
      <div className="char-form-acts">
        <Button variant="primary" icon={<IconGenerate />} loading={busy} disabled={!from || locked} aria-describedby={locked ? 'voice-lock' : !from ? 'build-why' : undefined} onClick={build}>{from ? `Build the voice from “${from.label}”` : 'Build the voice'}</Button>
        {!from && <span id="build-why" className="t-meta" role="status">Upload a recording first.</span>}
      </div>
      {consentNeeded && <ConsentChoice characterId={c.id} sampleId={consentNeeded.sampleId ?? from?.id} onConfirmed={build} />}
      {last && failed && !consentNeeded && <FailureNotice copy={failed} jobId={last.id} action={failed.fix.kind === 'reference' ? <span className="t-meta">Upload a recording first.</span> : failed.fix.kind === 'consent' ? <ConsentChoice characterId={c.id} sampleId={last.error?.details?.sampleId} job={last} /> : <RetryControl job={last} size="sm" />} />}
    </div>
  );
}
