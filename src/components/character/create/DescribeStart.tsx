'use client';

import { useState } from 'react';
import { SEXES, type Sex } from '@/domain/vocabulary';
import { useT } from '@/components/ui/locale';
import { Button, Details, Dropzone, Field, Input, Segmented, Textarea } from '@/components/ui/kit';
import { IconAuto, IconVoice } from '@/components/ui/icons';
import { fmtSeconds } from '@/lib/format';
import { AUDIO_RULES, BRIEF_MAX, DESCRIBE_VOICE_MODES, checkAudioDuration, checkAudioFile, checkBrief, measureAudio, type DescribeVoiceMode } from './preflight';

export { describeVoiceMode, type DescribeVoiceMode } from './preflight';
export interface DescribeValues { name: string; brief: string; sex?: Sex; ageYears?: number; species?: string; voiceMode: DescribeVoiceMode }
/** The recording chosen in the form (a File cannot be remembered across a reload; the choice can). */
export interface DescribeRecording { file: File; seconds: number | null }

/** DESCRIBE THEM — a line is enough (role, age, where they come from, how they carry themselves), or nothing but a
 *  name: Casting writes the sheet, draws the portrait and the reference views. The voice is honest: with no studio
 *  voice bank, a voice comes only from a recording — add one now (it is checked as soon as the character exists and
 *  the voice is built from it), or later on the profile. */
export function DescribeStart({ value, onChange, recording, onRecording, onSubmit, busy, disabledReason, onCancel }: { value: DescribeValues; onChange: (v: DescribeValues) => void; recording: DescribeRecording | null; onRecording: (r: DescribeRecording | null) => void; onSubmit: () => void; busy?: boolean; /** the preflight's reason the primary is disabled, shown in the form (never only a tooltip) */ disabledReason?: string | null; onCancel: () => void }) {
  const T = useT();
  const [touched, setTouched] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
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
    <form className="card space-y-5 p-4 sm:p-5" onSubmit={submit} aria-busy={busy || undefined} noValidate>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Field label={T('label.name')} hint={T('wizard.optional')}><Input value={value.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} /></Field>
        <Field label={T('char.create.who')} help={T('char.create.whoHint')} error={briefError} hint={<span className="num">{value.brief.length}/{BRIEF_MAX}</span>}>
          <Textarea className="input-lg" value={value.brief} onChange={(e) => set({ brief: e.target.value })} rows={3} maxLength={BRIEF_MAX + 50} placeholder={T('char.create.briefPh')} />
        </Field>
      </div>
      <Details summary={T('char.create.preferences')} open={value.voiceMode === 'RECORDING' || undefined}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><p className="label">{T('label.sex')}</p><Segmented label={T('label.sex')} value={value.sex ?? 'ANY'} onChange={(v) => set({ sex: v === 'ANY' ? undefined : (v as Sex) })} options={[{ value: 'ANY', label: T('auto.decide') }, ...SEXES.map((x) => ({ value: x as string, label: x === 'FEMALE' ? T('label.female') : T('label.male') }))]} /></div>
          <Field label={T('label.age')} hint={T('wizard.optional')}><Input type="number" min={1} max={120} value={value.ageYears ?? ''} onChange={(e) => set({ ageYears: e.target.value ? Number(e.target.value) : undefined })} /></Field>
          <Field label={T('label.species')} hint={T('wizard.optional')}><Input value={value.species ?? ''} onChange={(e) => set({ species: e.target.value || undefined })} placeholder={T('char.form.speciesPh')} /></Field>
          <div className="sm:col-span-3">
            <p className="label">{T('tab.voice')}</p>
            <Segmented label={T('tab.voice')} value={value.voiceMode} onChange={(v) => set({ voiceMode: v })} options={DESCRIBE_VOICE_MODES.map((m) => ({ value: m, label: m === 'NONE' ? T('char.create.voiceNone') : T('char.create.voiceRecording') }))} />
            <p className="help">{value.voiceMode === 'RECORDING' ? T('char.create.voiceRecordingHint') : T('char.create.voiceNoneHint')}</p>
            {value.voiceMode === 'RECORDING' && (
              <div className="mt-3">
                <Dropzone label={recording ? recording.file.name : T('voice.upload')} hint={`${AUDIO_RULES.minSeconds}–${AUDIO_RULES.maxSeconds} s · ${T('char.create.voiceRecordingWhen')}`} accept="audio/*" icon={<IconVoice />} onFile={(f) => void chooseRecording(f)} error={audioError ?? (touched && needsRecording ? T('char.create.voiceRecordingNeeded') : null)} row />
                {recording && !audioError && <p className="mt-1.5 text-[12px]" role="status"><span className="status status-ok">{recording.seconds === null ? T('voice.measured.unknown') : `${fmtSeconds(Math.round(recording.seconds * 10) / 10)} · ${checkAudioDuration(recording.seconds) === 'OK' ? T('voice.measured.ok') : T('voice.measured.long')}`}</span></p>}
              </div>
            )}
          </div>
        </div>
      </Details>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft pt-4">
        {disabledReason && <p className="me-auto text-[12.5px] text-warn" role="status">{disabledReason}</p>}
        <Button variant="ghost" onClick={onCancel}>{T('btn.cancel')}</Button>
        <Button type="submit" variant="primary" icon={<IconAuto />} loading={busy} disabled={Boolean(disabledReason)}>{T('char.create.design')}</Button>
      </div>
      <p className="text-[12px] text-faint">{T('char.create.designHint')}</p>
    </form>
  );
}
