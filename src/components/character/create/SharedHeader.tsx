'use client';

import { DIALECTS, STYLES, type Dialect, type Language, type Style } from '@/domain/vocabulary';
import { useStudio } from '@/studio/store';
import { useT } from '@/components/ui/locale';
import { Field, Segmented, Select } from '@/components/ui/kit';
import { dialectLabel } from '@/lib/format';

export interface HeaderValues { forId: string; style: Style; language: Language; dialect: Dialect }

/** THE SHARED HEADER — the three decisions every start needs: who the character is for (a show or a production,
 *  optional), the style, and the language with its dialect (Arabic only; Iraqi Baghdadi by default). These choose
 *  the engines and the look; everything else is per start. */
export function SharedHeader({ value, onChange, disabled }: { value: HeaderValues; onChange: (v: HeaderValues) => void; disabled?: boolean }) {
  const T = useT();
  const { state } = useStudio();
  const set = (p: Partial<HeaderValues>) => onChange({ ...value, ...p });
  const homes = [...state.shows.map((s) => ({ value: `show:${s.id}`, label: s.title })), ...state.productions.filter((p) => !p.showId).map((p) => ({ value: `p:${p.id}`, label: p.title }))];
  const home = homes.find((h) => h.value === value.forId);
  return (
    <fieldset disabled={disabled} className="card flex flex-wrap items-end gap-x-6 gap-y-4 p-4 sm:p-5">
      <legend className="sr-only">{T('char.create.header')}</legend>
      <Field label={T('char.create.for')} hint={T('wizard.optional')} className="min-w-[14rem] flex-1 basis-56">
        <Select value={value.forId} onChange={(e) => set({ forId: e.target.value })} placeholder={T('char.create.forNone')} options={homes} />
      </Field>
      <div><p className="label">{T('label.style')}</p><Segmented label={T('label.style')} value={value.style} onChange={(v) => set({ style: v })} options={STYLES.map((s) => ({ value: s, label: T.dyn(`style.${s}`) }))} /></div>
      <div className="flex flex-wrap items-end gap-3">
        <div><p className="label">{T('label.language')}</p><Segmented label={T('label.language')} value={value.language} onChange={(v) => set({ language: v })} options={[{ value: 'EN' as Language, label: T('label.english') }, { value: 'AR' as Language, label: T('label.arabic') }]} /></div>
        {value.language === 'AR' && <Field label={T('label.dialect')} className="min-w-[11rem]"><Select value={value.dialect} onChange={(e) => set({ dialect: e.target.value as Dialect })} options={DIALECTS.map((d) => ({ value: d, label: dialectLabel(d, T.locale) }))} /></Field>}
      </div>
      {home && <p className="basis-full text-[12px] text-faint" dir="auto"><span className="badge badge-accent me-2">{T('char.create.forChip')} {home.label}</span>{T('char.create.forHint')}</p>}
    </fieldset>
  );
}
