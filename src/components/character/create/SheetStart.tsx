'use client';

import { useRef, useState, type ReactNode } from 'react';
import { PACES, PITCHES, SEXES, type Language, type Sex } from '@/domain/vocabulary';
import { T } from '@/lib/copy';
import { Button, Details, Field, Input, Segmented, Textarea, cls } from '@/components/ui/kit';
import { IconCheck, IconGenerate } from '@/components/ui/icons';
import { AGE_BANDS, SHEET_STEPS, sheetAge, sheetStepProblem, type AgeBand, type SheetStep, type SheetValues } from '../sheetModel';
import { CharacterImage } from '../CharacterImage';
import { Footer } from './DescribeStart';

const STEP_KEY = { identity: 'cast.sheet.identity', look: 'cast.sheet.look', voice: 'cast.sheet.voice' } as const;

/** WRITE THE SHEET (DESIGN-SYSTEM-V3 §9.5) — three short steps, one visible at a time, at most six fields each:
 *  ① Identity (name, Arabic name, short description, sex, age band, personality) ② Look (one description, the details
 *  disclosed) ③ Voice (pitch, pace, timbre, notes). Nothing is preselected: what is left on "Studio decides" or blank
 *  is designed by Casting. The preview beside it shows only what was written. Create keeps the record; Create and
 *  draw also draws the canonical image (and the voice when a recording comes later). */
export function SheetStart({ value, onChange, step, onStep, onCreate, busy, drawDisabledReason, onCancel, settings, language, styleWord, languageWord }: {
  value: SheetValues; onChange: (v: SheetValues) => void; step: SheetStep; onStep: (s: SheetStep) => void; onCreate: (draw: boolean) => void; busy?: boolean;
  drawDisabledReason?: string | null; onCancel: () => void; settings: ReactNode; language: Language; styleWord: string; languageWord: string;
}) {
  const [touched, setTouched] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const set = (p: Partial<SheetValues>) => onChange({ ...value, ...p });
  const i = SHEET_STEPS.indexOf(step);
  const problem = sheetStepProblem('identity', value);
  const go = (to: SheetStep) => { if (SHEET_STEPS.indexOf(to) > 0 && problem) { setTouched(true); onStep('identity'); return; } onStep(to); top.current?.scrollIntoView({ block: 'nearest' }); };
  const next = () => go(SHEET_STEPS[Math.min(i + 1, SHEET_STEPS.length - 1)]);
  const create = (draw: boolean) => { if (problem) { setTouched(true); onStep('identity'); return; } onCreate(draw); };
  const age = sheetAge(value);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_16rem]">
      <form className="panel min-w-0 space-y-6 p-4 sm:p-5" onSubmit={(e) => { e.preventDefault(); if (i < SHEET_STEPS.length - 1) next(); else create(true); }} aria-busy={busy || undefined} noValidate>
        <div ref={top} className="scroll-mt-24">
          <ol className="stepper flex-wrap gap-y-2" aria-label={T('cast.sheet.steps')}>
            {SHEET_STEPS.map((s, n) => (
              <li key={s} className="flex items-center gap-2" aria-current={s === step ? 'step' : undefined} data-done={n < i ? '' : undefined}>
                {n > 0 && <span aria-hidden className="h-px w-6 bg-line" />}
                <button type="button" className="flex items-center gap-2 rounded-[var(--r-1)] font-medium" onClick={() => go(s)}>
                  <span className="stepper-n">{n < i ? <IconCheck aria-hidden className="size-3.5" /> : n + 1}</span>{T(STEP_KEY[s])}
                </button>
              </li>
            ))}
          </ol>
        </div>

        {step === 'identity' && (
          <div className="space-y-5 fade-in">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label={T('label.name')} error={touched && problem ? `${T('label.name')} — ${T('char.form.needName')}` : null}><Input value={value.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} autoComplete="off" /></Field>
              {language === 'AR' && <Field label={T('label.nameAr')} hint={language === 'AR' ? T('char.form.nameArHint') : T('wizard.optional')}><Input value={value.nameAr} dir="rtl" onChange={(e) => set({ nameAr: e.target.value })} maxLength={80} /></Field>}
            </div>
            <Field label={T('cast.edit.description')} hint={<span className="num" dir="ltr">{value.role.length} / 200</span>} help={T('char.form.roleHelp')}><Input value={value.role} onChange={(e) => set({ role: e.target.value })} placeholder={T('char.form.rolePh')} maxLength={200} /></Field>
            <div className="flex flex-wrap gap-x-6 gap-y-4">
              <div><p className="label">{T('label.sex')}</p><Segmented label={T('label.sex')} value={value.sex ?? 'ANY'} onChange={(v) => set({ sex: v === 'ANY' ? undefined : (v as Sex) })} options={[{ value: 'ANY', label: T('auto.decide') }, ...SEXES.map((x) => ({ value: x as string, label: x === 'FEMALE' ? T('cast.new.woman') : T('cast.new.man') }))]} /></div>
              <div><p className="label">{T('label.age')}</p><Segmented label={T('label.age')} value={value.band ?? 'ANY'} onChange={(v) => set({ band: v === 'ANY' ? undefined : (v as AgeBand), exactAge: undefined })} options={[{ value: 'ANY', label: T('auto.decide') }, ...AGE_BANDS.map((b) => ({ value: b as string, label: T.dyn(`char.form.age.${b}`) }))]} /></div>
            </div>
            <Field label={T('label.personality')} hint={T('wizard.optional')} help={T('char.form.personalityHelp')}><Textarea value={value.personality} onChange={(e) => set({ personality: e.target.value })} rows={2} maxLength={400} /></Field>
            {settings}
          </div>
        )}

        {step === 'look' && (
          <div className="space-y-5 fade-in">
            <Field label={T('cast.sheet.describeLook')} hint={T('wizard.optional')} help={T('cast.sheet.describeLookHelp')}><Textarea className="input-lg" value={value.look} onChange={(e) => set({ look: e.target.value })} rows={4} maxLength={2000} /></Field>
            <Details summary={T('cast.sheet.lookDetails')} open={Boolean(value.build || value.face || value.hair || value.skin || value.eyes || value.wardrobe || value.marks) || undefined}>
              <div className="grid gap-5 md:grid-cols-2">
                <Field label={T('label.build')}><Input value={value.build} onChange={(e) => set({ build: e.target.value })} maxLength={400} /></Field>
                <Field label={T('label.face')}><Input value={value.face} onChange={(e) => set({ face: e.target.value })} maxLength={400} /></Field>
                <Field label={T('label.hair')}><Input value={value.hair} onChange={(e) => set({ hair: e.target.value })} maxLength={400} /></Field>
                <Field label={T('label.skin')}><Input value={value.skin} onChange={(e) => set({ skin: e.target.value })} maxLength={400} /></Field>
                <Field label={T('label.eyes')}><Input value={value.eyes} onChange={(e) => set({ eyes: e.target.value })} maxLength={400} /></Field>
                <Field label={T('label.distinguishing')} help={T('char.form.distinguishingHelp')}><Input value={value.marks} onChange={(e) => set({ marks: e.target.value })} /></Field>
                <Field label={T('label.wardrobe')} className="md:col-span-2"><Textarea value={value.wardrobe} onChange={(e) => set({ wardrobe: e.target.value })} rows={2} maxLength={400} /></Field>
              </div>
            </Details>
            <p className="text-[13px] text-faint">{T('char.form.lookHint')}</p>
          </div>
        )}

        {step === 'voice' && (
          <div className="space-y-5 fade-in">
            <div className="flex flex-wrap gap-x-6 gap-y-4">
              <div><p className="label">{T('label.pitch')}</p><Segmented label={T('label.pitch')} value={value.pitch ?? 'ANY'} onChange={(v) => set({ pitch: v === 'ANY' ? undefined : (v as SheetValues['pitch']) })} options={[{ value: 'ANY', label: T('auto.decide') }, ...PITCHES.map((x) => ({ value: x as string, label: T.dyn(`voice.pitch.${x}`) }))]} /></div>
              <div><p className="label">{T('label.pace')}</p><Segmented label={T('label.pace')} value={value.pace ?? 'ANY'} onChange={(v) => set({ pace: v === 'ANY' ? undefined : (v as SheetValues['pace']) })} options={[{ value: 'ANY', label: T('auto.decide') }, ...PACES.map((x) => ({ value: x as string, label: T.dyn(`voice.pace.${x}`) }))]} /></div>
            </div>
            <Field label={T('label.timbre')} hint={T('wizard.optional')}><Input value={value.timbre} onChange={(e) => set({ timbre: e.target.value })} placeholder={T('char.form.timbrePh')} maxLength={200} /></Field>
            <Details summary={T('cast.sheet.performance')}><Field label={T('label.voiceNotes')}><Textarea value={value.voiceNotes} onChange={(e) => set({ voiceNotes: e.target.value })} rows={2} maxLength={400} /></Field></Details>
            <p className="text-[13px] text-faint">{T('char.form.voiceHint')}</p>
          </div>
        )}

        <Footer reason={i === SHEET_STEPS.length - 1 ? drawDisabledReason : null} onCancel={i === 0 ? onCancel : () => go(SHEET_STEPS[i - 1])} cancelLabel={i === 0 ? undefined : T('btn.back')}
          estimate={i === SHEET_STEPS.length - 1 ? T('cast.sheet.createHint') : <>{T('cast.sheet.step')} <span className="num" dir="ltr">{i + 1} / {SHEET_STEPS.length}</span></>}
          secondary={i === SHEET_STEPS.length - 1 ? <Button variant="secondary" loading={busy} onClick={() => create(false)}>{T('char.create.recordOnly')}</Button> : undefined}
          primary={i < SHEET_STEPS.length - 1
            ? <Button type="submit" variant="primary">{T('btn.next')}</Button>
            : <Button type="submit" variant="primary" icon={<IconGenerate />} loading={busy} disabled={Boolean(drawDisabledReason)}>{T('char.create.andDraw')}</Button>} />
      </form>

      <aside className="hidden xl:block" aria-label={T('char.form.preview')}>
        <div className="sticky top-8">
          <CharacterImage kind="NONE" name={value.name.trim() || '?'} placeholder={T('cast.new.imageLands')} />
          <p className={cls('mt-3 text-[15px] font-semibold leading-5', value.name.trim() ? 'text-fg' : 'text-faint')} dir="auto">{value.name.trim() || T('char.form.unnamed')}</p>
          {value.nameAr.trim() && <p className="text-sm text-muted"><bdi dir="rtl" lang="ar">{value.nameAr.trim()}</bdi></p>}
          {value.role.trim() && <p className="mt-1 text-[13px] leading-5 text-muted" dir="auto">{value.role.trim()}</p>}
          <p className="mt-2 text-xs text-faint">{[styleWord, languageWord, value.sex ? (value.sex === 'FEMALE' ? T('cast.new.woman') : T('cast.new.man')) : null, age ? String(age) : null].filter(Boolean).join(' · ')}</p>
        </div>
      </aside>
    </div>
  );
}
