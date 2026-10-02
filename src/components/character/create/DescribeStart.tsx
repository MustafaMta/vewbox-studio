'use client';

import { useState } from 'react';
import { SEXES, type Sex } from '@/domain/vocabulary';
import { useT } from '@/components/ui/locale';
import { Button, Details, Field, Input, Segmented, Textarea } from '@/components/ui/kit';
import { IconAuto } from '@/components/ui/icons';
import { BRIEF_MAX, checkBrief } from './preflight';

export interface DescribeValues { name: string; brief: string; sex?: Sex; ageYears?: number; species?: string; voiceMode: 'NONE' | 'AUTOMATIC' }

/** DESCRIBE THEM — a line is enough (role, age, where they come from, how they carry themselves), or nothing but a
 *  name: Casting writes the sheet, draws the portrait and the reference views. The voice is honest: with no studio
 *  voice bank yet, Auto creation makes no voice and says so; a recording is added on the profile. */
export function DescribeStart({ value, onChange, onSubmit, busy, disabledReason, onCancel }: { value: DescribeValues; onChange: (v: DescribeValues) => void; onSubmit: () => void; busy?: boolean; /** the preflight's reason the primary is disabled, shown in the form (never only a tooltip) */ disabledReason?: string | null; onCancel: () => void }) {
  const T = useT();
  const [touched, setTouched] = useState(false);
  const set = (p: Partial<DescribeValues>) => onChange({ ...value, ...p });
  const brief = checkBrief(value.brief, value.name);
  const briefError = !brief.ok && touched ? (brief.reason === 'LONG' ? T('char.create.briefLong') : T('char.create.briefEmpty')) : null;
  const submit = (e: React.FormEvent) => { e.preventDefault(); setTouched(true); if (!brief.ok || disabledReason) return; onSubmit(); };
  return (
    <form className="card space-y-5 p-4 sm:p-5" onSubmit={submit} aria-busy={busy || undefined} noValidate>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Field label={T('label.name')} hint={T('wizard.optional')}><Input value={value.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} /></Field>
        <Field label={T('char.create.who')} help={T('char.create.whoHint')} error={briefError} hint={<span className="num">{value.brief.length}/{BRIEF_MAX}</span>}>
          <Textarea className="input-lg" value={value.brief} onChange={(e) => set({ brief: e.target.value })} rows={3} maxLength={BRIEF_MAX + 50} placeholder={T('char.create.briefPh')} />
        </Field>
      </div>
      <Details summary={T('char.create.preferences')}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><p className="label">{T('label.sex')}</p><Segmented label={T('label.sex')} value={value.sex ?? 'ANY'} onChange={(v) => set({ sex: v === 'ANY' ? undefined : (v as Sex) })} options={[{ value: 'ANY', label: T('auto.decide') }, ...SEXES.map((x) => ({ value: x as string, label: x === 'FEMALE' ? T('label.female') : T('label.male') }))]} /></div>
          <Field label={T('label.age')} hint={T('wizard.optional')}><Input type="number" min={1} max={120} value={value.ageYears ?? ''} onChange={(e) => set({ ageYears: e.target.value ? Number(e.target.value) : undefined })} /></Field>
          <Field label={T('label.species')} hint={T('wizard.optional')}><Input value={value.species ?? ''} onChange={(e) => set({ species: e.target.value || undefined })} placeholder={T('char.form.speciesPh')} /></Field>
          <div className="sm:col-span-3">
            <p className="label">{T('tab.voice')}</p>
            <Segmented label={T('tab.voice')} value={value.voiceMode} onChange={(v) => set({ voiceMode: v })} options={[{ value: 'NONE' as const, label: T('char.create.voiceNone') }, { value: 'AUTOMATIC' as const, label: T('char.create.voiceAuto') }]} />
            <p className="help">{value.voiceMode === 'AUTOMATIC' ? T('char.create.voiceAutoHint') : T('char.create.voiceNoneHint')}</p>
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
