'use client';

import { useState } from 'react';
import { DIALECTS, STYLES, type Dialect, type Language } from '@/domain/vocabulary';
import { useStudio } from '@/studio/store';
import { useT } from '@/components/ui/locale';
import { Field, Segmented, Select } from '@/components/ui/kit';
import { dialectLabel } from '@/lib/format';

export interface HeaderValues { forId: string; style: (typeof STYLES)[number]; language: Language; dialect: Dialect }

/** THE PRODUCTION SETTINGS, AS ONE LINE (DESIGN-SYSTEM-V3 §9.5) — for whom, the style, the language and its dialect
 *  are defaulted (from `?show=` / `?production=` or Settings) and said in one quiet line: "For the library · Cartoon ·
 *  Arabic (Iraqi Baghdadi)  Change". Change opens the four controls in place. Intent comes first; configuration waits
 *  until it is wanted. */
export function SettingsSummary({ value, onChange, disabled }: { value: HeaderValues; onChange: (v: HeaderValues) => void; disabled?: boolean }) {
  const T = useT();
  const { state } = useStudio();
  const [open, setOpen] = useState(false);
  const set = (p: Partial<HeaderValues>) => onChange({ ...value, ...p });
  const homes = [...state.shows.map((s) => ({ value: `show:${s.id}`, label: s.title })), ...state.productions.filter((p) => !p.showId).map((p) => ({ value: `p:${p.id}`, label: p.title }))];
  const home = homes.find((h) => h.value === value.forId);
  const langWords = value.language === 'AR' ? `${T('label.arabic')} (${dialectLabel(value.dialect, T.locale)})` : T('label.english');
  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px] leading-5 text-muted">
        <span className="min-w-0" dir="auto">{home ? T('cast.new.for').replace('{name}', home.label) : T('cast.new.forLibrary')}</span>
        <span aria-hidden className="text-ink-500">·</span><span>{T.dyn(`style.${value.style}`)}</span>
        <span aria-hidden className="text-ink-500">·</span><span>{langWords}</span>
        <button type="button" disabled={disabled} aria-expanded={open} aria-controls="new-settings" onClick={() => setOpen((o) => !o)} className="ms-1 font-medium text-fg underline decoration-line-field underline-offset-4 hover:decoration-fg disabled:text-disabled">{open ? T('btn.done') : T('cast.new.change')}</button>
      </p>
      {open && (
        <fieldset id="new-settings" disabled={disabled} className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-4 border-t border-line-soft pt-4">
          <legend className="sr-only">{T('char.create.header')}</legend>
          <Field label={T('cast.new.forLabel')} hint={T('wizard.optional')} className="min-w-[14rem] flex-1 basis-56">
            <Select value={value.forId} onChange={(e) => set({ forId: e.target.value })} placeholder={T('char.create.forNone')} options={homes} />
          </Field>
          <div><p className="label">{T('label.style')}</p><Segmented label={T('label.style')} value={value.style} onChange={(v) => set({ style: v })} options={STYLES.map((s) => ({ value: s, label: T.dyn(`style.${s}`) }))} /></div>
          <div><p className="label">{T('label.language')}</p><Segmented label={T('label.language')} value={value.language} onChange={(v) => set({ language: v })} options={[{ value: 'EN' as Language, label: T('label.english') }, { value: 'AR' as Language, label: T('label.arabic') }]} /></div>
          {value.language === 'AR' && <Field label={T('label.dialect')} className="min-w-[11rem]"><Select value={value.dialect} onChange={(e) => set({ dialect: e.target.value as Dialect })} options={DIALECTS.map((d) => ({ value: d, label: dialectLabel(d, T.locale) }))} /></Field>}
        </fieldset>
      )}
    </div>
  );
}
