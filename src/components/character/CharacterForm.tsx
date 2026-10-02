'use client';

import { useState } from 'react';
import type { Character } from '@/domain/types';
import { DIALECTS, LANGUAGES, PACES, PITCHES, SEXES, STYLES, type Dialect, type Language, type Style } from '@/domain/vocabulary';
import { useStudio } from '@/studio/store';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { Button, Details, Field, Input, Notice, Segmented, Select, Textarea, cls } from '@/components/ui/kit';
import { Art } from '@/components/ui/cinema';
import { dialectLabel, words } from '@/lib/format';
import { appearanceLock } from '@/domain/rules';
import { IconGenerate } from '@/components/ui/icons';
import type { CharacterProfileInput } from './contract';

/** THE CHARACTER SHEET — who they are and what they look like, in plain fields, laid out Identity → Look → Voice
 *  with the rarely needed fields behind a disclosure. The minimum is a name (style and language come from the
 *  creation header, or from the fields here when editing); everything else is optional and the agents fill the
 *  rest. The same form creates a character from the library or inline from the wizard, edits one (`initial`), or,
 *  with `create`, hands the written sheet to the creation page instead of saving it itself. */

type AgeBand = 'child' | 'teen' | 'adult' | 'older';
const BAND_AGE: Record<AgeBand, number> = { child: 9, teen: 16, adult: 32, older: 66 };
const bandOf = (age: number): AgeBand => (age <= 12 ? 'child' : age <= 19 ? 'teen' : age <= 59 ? 'adult' : 'older');

export interface CreateMode {
  /** the header's choices, shown as a line and not as fields */
  style: Style; language: Language; dialect?: Dialect;
  /** prefilled from a Describe start that failed ("write it myself") */
  name?: string; personality?: string;
  /** Create (record only) vs Create and draw (record + appearance + sheet); the reason when drawing is not possible */
  onCreate: (profile: CharacterProfileInput, draw: boolean) => void; busy?: boolean; drawDisabledReason?: string;
}

export function CharacterForm({ initial, defaultStyle, onSaved, onCancel, section = 'all', create }: { initial?: Character; defaultStyle?: Style; onSaved: (id: string) => void; onCancel?: () => void; section?: 'all' | 'appearance' | 'profile'; create?: CreateMode }) {
  const T = useT();
  const { state, act } = useStudio();
  const toast = useToast();
  const def = state.settings.defaults;
  const [d, setD] = useState({
    name: initial?.name ?? create?.name ?? '', nameAr: initial?.nameAr ?? '', role: initial?.role ?? '', style: initial?.style ?? create?.style ?? defaultStyle ?? def.style, sex: initial?.sex ?? 'FEMALE', species: initial?.species ?? '', ageYears: initial?.ageYears ?? 30,
    build: initial?.build ?? '', face: initial?.face ?? '', hair: initial?.hair ?? '', skin: initial?.skin ?? '', eyes: initial?.eyes ?? '', distinguishing: initial?.distinguishing.join(', ') ?? '', wardrobe: initial?.wardrobe ?? '', personality: initial?.personality ?? create?.personality ?? '',
    language: initial?.language ?? create?.language ?? def.language, dialect: initial?.dialect ?? create?.dialect ?? def.dialect, pitch: initial?.voice.pitch ?? 'MID', pace: initial?.voice.pace ?? 'MEASURED', timbre: initial?.voice.timbre ?? '', notes: initial?.voice.notes ?? '',
  });
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));
  const [error, setError] = useState<string | null>(null);
  const [exactAge, setExactAge] = useState(false);
  const showAppearance = section !== 'profile'; const showProfile = section !== 'appearance';
  // a character who has been in a video keeps their look: those fields are shown, not editable (the action drops them too)
  const locked = initial ? appearanceLock(initial).locked : false;
  // the header owns style, language and dialect on the creation page
  const style = create ? create.style : d.style; const language = create ? create.language : d.language; const dialect = create ? create.dialect : d.dialect;
  const arabicName = language === 'AR' || T.locale === 'ar';

  const profile = (): CharacterProfileInput => ({ name: d.name.trim(), nameAr: d.nameAr.trim() || undefined, role: d.role.trim(), style, sex: d.sex, species: d.species.trim() || undefined, ageYears: Number(d.ageYears) || 1, build: d.build, face: d.face, hair: d.hair, skin: d.skin, eyes: d.eyes, distinguishing: d.distinguishing.split(',').map((x) => x.trim()).filter(Boolean), wardrobe: d.wardrobe, personality: d.personality, language, dialect: language === 'AR' ? dialect : undefined, voice: { pitch: d.pitch, pace: d.pace, timbre: d.timbre, notes: d.notes } });

  const submit = (e: React.SyntheticEvent, draw = false) => {
    e.preventDefault();
    if (!d.name.trim()) { setError(T('label.name')); return; }
    const { voice, ...base } = profile();
    if (create) { create.onCreate(profile(), draw); return; }
    if (initial) {
      act('updateCharacter', initial.id, { ...base, voice: { ...initial.voice, pitch: d.pitch, pace: d.pace, timbre: d.timbre, notes: d.notes } });
      toast.ok(T('toast.saved')); onSaved(initial.id);
    } else {
      const r = act('addCharacter', { ...base, voice: { pitch: voice!.pitch, pace: voice!.pace, timbre: voice!.timbre ?? '', notes: voice!.notes ?? '' } });
      toast.ok(T('toast.created')); onSaved(r.character.id);
    }
  };
  const traits = d.distinguishing.split(',').map((x) => x.trim()).filter(Boolean);
  const nameError = error && !d.name.trim() ? `${T('label.name')} — ${T('char.form.needName')}` : null;

  const form = (
    <form onSubmit={(e) => submit(e, false)} className="space-y-8" noValidate aria-busy={create?.busy || undefined}>
      {showProfile && (
        <fieldset className="space-y-4">
          <legend className="h3 mb-1">{T('char.form.identity')}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={T('label.name')} required error={nameError} className={arabicName ? '' : 'sm:col-span-2'}><Input value={d.name} onChange={(e) => { set({ name: e.target.value }); setError(null); }} autoFocus={!initial} maxLength={80} /></Field>
            {arabicName && <Field label={T('label.nameAr')} hint={language === 'AR' ? T('char.form.nameArHint') : T('wizard.optional')}><Input value={d.nameAr} dir="rtl" onChange={(e) => set({ nameAr: e.target.value })} maxLength={80} /></Field>}
            <Field label={T('label.role')} hint={<span className="num">{d.role.length}/200</span>} help={T('char.form.roleHelp')} className="sm:col-span-2"><Input value={d.role} onChange={(e) => set({ role: e.target.value })} placeholder={T('char.form.rolePh')} maxLength={200} /></Field>
            {!create && <>
              <Field label={T('label.style')} help={locked ? T('char.lock.short') : undefined}><Select disabled={locked} value={d.style} onChange={(e) => set({ style: e.target.value as Style })} options={STYLES.map((s) => ({ value: s, label: T.dyn(`style.${s}`) }))} /></Field>
              <Field label={T('label.language')}><Select value={d.language} onChange={(e) => set({ language: e.target.value as Language })} options={LANGUAGES.map((l) => ({ value: l, label: l === 'EN' ? T('label.english') : T('label.arabic') }))} /></Field>
              {d.language === 'AR' && <Field label={T('label.dialect')}><Select value={d.dialect} onChange={(e) => set({ dialect: e.target.value as Dialect })} options={DIALECTS.map((x) => ({ value: x, label: dialectLabel(x, T.locale) }))} /></Field>}
            </>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><p className="label">{T('label.sex')}</p><Segmented label={T('label.sex')} value={d.sex} onChange={(v) => set({ sex: v })} options={SEXES.map((x) => ({ value: x, label: x === 'FEMALE' ? T('label.female') : T('label.male') }))} /></div>
            <div><p className="label">{T('label.age')}</p><div className="flex flex-wrap items-center gap-2"><Segmented label={T('label.age')} value={bandOf(Number(d.ageYears) || 30)} onChange={(b) => { set({ ageYears: BAND_AGE[b] }); setExactAge(false); }} options={(['child', 'teen', 'adult', 'older'] as AgeBand[]).map((b) => ({ value: b, label: T.dyn(`char.form.age.${b}`) }))} /><button type="button" className="text-[12.5px] font-medium text-muted underline-offset-2 hover:text-fg hover:underline" aria-expanded={exactAge} onClick={() => setExactAge((v) => !v)}>{T('char.form.exactAge')}</button>{exactAge && <Input type="number" min={1} max={120} value={d.ageYears} onChange={(e) => set({ ageYears: Number(e.target.value) })} aria-label={T('char.form.exactAge')} className="w-24" />}</div></div>
          </div>
          <Field label={T('label.personality')} hint={T('wizard.optional')} help={T('char.form.personalityHelp')}><Textarea value={d.personality} onChange={(e) => set({ personality: e.target.value })} rows={3} maxLength={400} /></Field>
          <Details summary={T('misc.details')}>
            <Field label={T('label.species')} hint={T('wizard.optional')} help={T('char.form.speciesHelp')}><Input value={d.species} onChange={(e) => set({ species: e.target.value })} placeholder={T('char.form.speciesPh')} /></Field>
          </Details>
        </fieldset>
      )}
      {showAppearance && (
        <fieldset className="space-y-4" disabled={locked}>
          <legend className="h3 mb-1">{T('char.form.look')}</legend>
          {locked && <Notice tone="info" title={T('char.lock.title')}>{T('char.lock.formHint')}</Notice>}
          {create && <p className="text-[12.5px] text-faint">{T('char.form.lookHint')}</p>}
          <Details summary={T('misc.details')} open={!create}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={T('label.build')}><Input value={d.build} onChange={(e) => set({ build: e.target.value })} /></Field>
              <Field label={T('label.hair')}><Input value={d.hair} onChange={(e) => set({ hair: e.target.value })} /></Field>
              <Field label={T('label.eyes')}><Input value={d.eyes} onChange={(e) => set({ eyes: e.target.value })} /></Field>
              <Field label={T('label.skin')}><Input value={d.skin} onChange={(e) => set({ skin: e.target.value })} /></Field>
              <Field label={T('label.face')} className="sm:col-span-2"><Input value={d.face} onChange={(e) => set({ face: e.target.value })} /></Field>
              <Field label={T('label.distinguishing')} help={T('char.form.distinguishingHelp')} className="sm:col-span-3"><Input value={d.distinguishing} onChange={(e) => set({ distinguishing: e.target.value })} /></Field>
              <Field label={T('label.wardrobe')} className="sm:col-span-3"><Textarea value={d.wardrobe} onChange={(e) => set({ wardrobe: e.target.value })} rows={2} /></Field>
            </div>
          </Details>
        </fieldset>
      )}
      {section === 'all' && (
        <fieldset className="space-y-4">
          <legend className="h3 mb-1">{T('tab.voice')}</legend>
          {create && <p className="text-[12.5px] text-faint">{T('char.form.voiceHint')}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div><p className="label">{T('label.pitch')}</p><Segmented label={T('label.pitch')} value={d.pitch} onChange={(v) => set({ pitch: v })} options={PITCHES.map((x) => ({ value: x, label: T.dyn(`voice.pitch.${x}`, words(x)) }))} /></div>
            <div><p className="label">{T('label.pace')}</p><Segmented label={T('label.pace')} value={d.pace} onChange={(v) => set({ pace: v })} options={PACES.map((x) => ({ value: x, label: T.dyn(`voice.pace.${x}`, words(x)) }))} /></div>
            <Field label={T('label.timbre')} className="sm:col-span-2"><Input value={d.timbre} onChange={(e) => set({ timbre: e.target.value })} placeholder={T('char.form.timbrePh')} /></Field>
          </div>
          <Details summary={T('misc.details')}>
            <Field label={T('label.voiceNotes')}><Input value={d.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
          </Details>
        </fieldset>
      )}
      <div className={cls('flex flex-wrap items-center justify-end gap-2', create && 'sticky bottom-0 -mx-1 border-t border-line-soft bg-bg/95 px-1 py-3 backdrop-blur sm:static sm:m-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none')}>
        {create?.drawDisabledReason && <p className="me-auto text-[12px] text-warn" role="status">{create.drawDisabledReason}</p>}
        {onCancel && <Button variant="ghost" onClick={onCancel}>{T('btn.cancel')}</Button>}
        {create ? <>
          <Button type="submit" variant="secondary" loading={create.busy}>{T('char.create.recordOnly')}</Button>
          <Button type="button" variant="primary" icon={<IconGenerate />} loading={create.busy} disabled={Boolean(create.drawDisabledReason)} onClick={(e) => submit(e, true)}>{T('char.create.andDraw')}</Button>
        </> : <Button type="submit" variant="primary">{initial ? T('btn.save') : T('btn.create')}</Button>}
      </div>
    </form>
  );
  if (!create) return form;
  // the creation page: the sheet with a live preview beside it (the written description as type, never a fake image)
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0">{form}</div>
      <aside className="order-first lg:order-none"><div className="lg:sticky lg:top-6">
        <p className="kicker mb-2">{T('char.form.preview')}</p>
        <div className="flex gap-3 lg:block">
          <div className="w-24 flex-none lg:w-full"><Art ratio="portrait" title={[d.name.trim() || T('char.form.unnamed'), d.role.trim()].filter(Boolean).join(' — ')} /></div>
          <div className="min-w-0 lg:mt-3">
            <p className="eyebrow">{T.dyn(`style.${style}`)} · {d.species.trim() || `${d.ageYears} · ${d.sex === 'FEMALE' ? T('label.female') : T('label.male')}`}</p>
            <p className="mt-1 text-[15px] font-semibold text-fg" dir="auto">{d.name.trim() || T('char.form.unnamed')}{d.nameAr.trim() ? <span className="bi-ar ms-2 text-[0.85em] font-medium text-muted" dir="rtl">{d.nameAr.trim()}</span> : null}</p>
            <p className="text-[12.5px] text-muted" dir="auto">{d.role.trim() || '—'}</p>
            <p className="mt-1 text-[12px] text-faint">{language === 'EN' ? T('label.english') : T('label.arabic')}{language === 'AR' && dialect ? ` · ${dialectLabel(dialect, T.locale)}` : ''}</p>
            {traits.length > 0 && <ul className="mt-2 flex flex-wrap gap-1.5">{traits.slice(0, 6).map((x) => <li key={x} className="badge" dir="auto">{x}</li>)}</ul>}
            <p className="mt-3 text-[11.5px] text-faint">{T('char.form.previewNote')}</p>
          </div>
        </div>
      </div></aside>
    </div>
  );
}
