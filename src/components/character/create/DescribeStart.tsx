'use client';

import { useState, type ReactNode } from 'react';
import { SEXES, type Sex } from '@/domain/vocabulary';
import { useT } from '@/components/ui/locale';
import { Button, Details, Dropzone, Field, Input, Segmented, Textarea } from '@/components/ui/kit';
import { IconAuto, IconVoice } from '@/components/ui/icons';
import { fmtSeconds } from '@/lib/format';
import { AGE_BANDS, type AgeBand } from '../sheetModel';
import { AUDIO_RULES, BRIEF_MAX, DESCRIBE_VOICE_MODES, checkAudioDuration, checkAudioFile, checkBrief, measureAudio, type DescribeVoiceMode } from './preflight';

export { describeVoiceMode, type DescribeVoiceMode } from './preflight';
/** Nothing is preselected: sex, age band and species stay unset ("Studio decides") until the producer chooses. */
export interface DescribeValues { name: string; brief: string; sex?: Sex; band?: AgeBand; ageYears?: number; species?: string; voiceMode: DescribeVoiceMode }
/** The recording chosen in the form (a File cannot be remembered across a reload; the choice can). */
export interface DescribeRecording { file: File; seconds: number | null }

/** DESCRIBE THEM (DESIGN-SYSTEM-V3 §9.5) — the one essential input first: who they are, in a line (or nothing but a
 *  name). Then the production settings as one line, then "More control" (sex, age band, species, voice) disclosed.
 *  The voice is honest: with no studio voice bank, a voice comes only from a recording — add one now (it is checked
 *  as soon as the character exists and the voice is built from it), or later on the profile. */
export function DescribeStart({ value, onChange, recording, onRecording, onSubmit, busy, disabledReason, onCancel, settings }: { value: DescribeValues; onChange: (v: DescribeValues) => void; recording: DescribeRecording | null; onRecording: (r: DescribeRecording | null) => void; onSubmit: () => void; busy?: boolean; /** the preflight's reason the primary is disabled, shown in the form (never only a tooltip) */ disabledReason?: string | null; onCancel: () => void; settings: ReactNode }) {
  const T = useT();
  const [touched, setTouched] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [exact, setExact] = useState(Boolean(value.ageYears));
  const set = (p: Partial<DescribeValues>) => onChange({ ...value, ...p });
  const brief = checkBrief(value.brief, value.name);
  const briefError = !brief.ok && touched ? (brief.reason === 'LONG' ? T('char.create.briefLong') : T('char.create.briefEmpty')) : null;
  const needsRecording = value.voiceMode === 'RECORDING' && !recording;
  const submit = (e: React.FormEvent) => { e.preventDefault(); setTouched(true); if (!brief.ok || disabledReason || needsRecording) return; onSubmit(); };
  const chooseRecording = async (file: File) => {
    setAudioError(null);
    if (checkAudioFile(file)) { setAudioError(T('voice.notAudio')); onRecording(null); return; }
    const seconds = await measureAudio(file);
    if (seconds !== null && checkAudioDuration(seconds) === 'TOO_SHORT') { setAudioError(T('voice.refuse.TOO_SHORT')); onRecording(null); return; }
    onRecording({ file, seconds });
  };
  return (
    <form className="panel space-y-6 p-4 sm:p-5" onSubmit={submit} aria-busy={busy || undefined} noValidate>
      <Field label={T('char.create.who')} help={T('char.create.whoHint')} error={briefError} hint={<span className="num">{value.brief.length} / {BRIEF_MAX}</span>}>
        <Textarea className="input-lg" value={value.brief} onChange={(e) => set({ brief: e.target.value })} rows={4} maxLength={BRIEF_MAX + 50} placeholder={T('char.create.briefPh')} />
      </Field>
      <Field label={T('label.name')} hint={T('wizard.optional')} className="max-w-sm"><Input value={value.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} /></Field>
      {settings}
      <Details summary={T('cast.new.moreControl')} open={value.voiceMode === 'RECORDING' || Boolean(value.sex || value.band || value.species) || undefined}>
        <div className="space-y-5">
          <div className="flex flex-wrap gap-x-6 gap-y-4">
            <div><p className="label">{T('label.sex')}</p><Segmented label={T('label.sex')} value={value.sex ?? 'ANY'} onChange={(v) => set({ sex: v === 'ANY' ? undefined : (v as Sex) })} options={[{ value: 'ANY', label: T('auto.decide') }, ...SEXES.map((x) => ({ value: x as string, label: x === 'FEMALE' ? T('cast.new.woman') : T('cast.new.man') }))]} /></div>
            <div>
              <p className="label">{T('label.age')}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Segmented label={T('label.age')} value={value.band ?? 'ANY'} onChange={(v) => set({ band: v === 'ANY' ? undefined : (v as AgeBand), ageYears: undefined })} options={[{ value: 'ANY', label: T('auto.decide') }, ...AGE_BANDS.map((b) => ({ value: b as string, label: T.dyn(`char.form.age.${b}`) }))]} />
                <button type="button" className="text-[13px] font-medium text-muted underline-offset-2 hover:text-fg hover:underline" aria-expanded={exact} onClick={() => setExact((x) => !x)}>{T('char.form.exactAge')}</button>
                {exact && <Input type="number" min={1} max={120} value={value.ageYears ?? ''} onChange={(e) => set({ ageYears: e.target.value ? Number(e.target.value) : undefined })} aria-label={T('char.form.exactAge')} className="w-24" />}
              </div>
            </div>
          </div>
          <Field label={T('label.species')} hint={T('wizard.optional')} help={T('char.form.speciesHelp')} className="max-w-sm"><Input value={value.species ?? ''} onChange={(e) => set({ species: e.target.value || undefined })} /></Field>
          <div>
            <p className="label">{T('tab.voice')}</p>
            <Segmented label={T('tab.voice')} value={value.voiceMode} onChange={(v) => set({ voiceMode: v })} options={DESCRIBE_VOICE_MODES.map((m) => ({ value: m, label: m === 'NONE' ? T('char.create.voiceNone') : T('char.create.voiceRecording') }))} />
            <p className="help">{value.voiceMode === 'RECORDING' ? T('char.create.voiceRecordingHint') : T('char.create.voiceNoneHint')}</p>
            {value.voiceMode === 'RECORDING' && (
              <div className="mt-3">
                <Dropzone label={recording ? recording.file.name : T('voice.upload')} hint={`${AUDIO_RULES.minSeconds}–${AUDIO_RULES.maxSeconds} s · ${T('char.create.voiceRecordingWhen')}`} accept="audio/*" icon={<IconVoice />} onFile={(f) => void chooseRecording(f)} error={audioError ?? (touched && needsRecording ? T('char.create.voiceRecordingNeeded') : null)} row />
                {recording && !audioError && <p className="mt-1.5" role="status"><span className="status status-ok">{recording.seconds === null ? T('voice.measured.unknown') : `${fmtSeconds(Math.round(recording.seconds * 10) / 10)} · ${checkAudioDuration(recording.seconds) === 'OK' ? T('voice.measured.ok') : T('voice.measured.long')}`}</span></p>}
              </div>
            )}
          </div>
        </div>
      </Details>
      <Footer reason={disabledReason} estimate={T('cast.new.estimate')} onCancel={onCancel} primary={<Button type="submit" variant="primary" icon={<IconAuto />} loading={busy} disabled={Boolean(disabledReason)}>{T('char.create.design')}</Button>} />
    </form>
  );
}

/** The panel's footer (§9.5): the time estimate — or the reason the action cannot run — sits before the actions on
 *  the same row; on a phone it is a sticky bar that never covers the focused field. */
export function Footer({ reason, estimate, onCancel, cancelLabel, primary, secondary }: { reason?: ReactNode; estimate?: ReactNode; onCancel: () => void; cancelLabel?: ReactNode; primary: ReactNode; secondary?: ReactNode }) {
  const T = useT();
  return (
    <div className="sticky bottom-0 z-10 -mx-4 -mb-4 flex flex-wrap items-center justify-end gap-2 border-t border-line-soft bg-surface px-4 py-3 sm:static sm:m-0 sm:p-0 sm:pt-5">
      {reason ? <p className="me-auto min-w-0 basis-full text-[13px] text-warn sm:basis-auto" role="status">{reason}</p> : estimate ? <p className="me-auto min-w-0 basis-full text-[13px] text-faint sm:basis-auto">{estimate}</p> : null}
      <Button variant="quiet" onClick={onCancel}>{cancelLabel ?? T('btn.cancel')}</Button>
      {secondary}
      {primary}
    </div>
  );
}
