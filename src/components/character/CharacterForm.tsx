'use client';

import { useState } from 'react';
import type { Character } from '@/domain/types';
import { DIALECTS, LANGUAGES, PACES, PITCHES, SEXES, STYLES, type Style } from '@/domain/vocabulary';
import { useStudio } from '@/demo/store';
import { addCharacter, updateCharacter } from '@/demo/actions';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/kit';
import { dialectLabel, words } from '@/lib/format';
import { appearanceLock } from '@/demo/rules';
import { Notice } from '@/components/ui/kit';

/** THE CHARACTER FORM — who they are and what they look like, in plain fields. The same form creates a character
 *  from the library, from a show's canon, or inline from the wizard; with `initial` it edits one. */
export function CharacterForm({ initial, defaultStyle, onSaved, onCancel, section = 'all' }: { initial?: Character; defaultStyle?: Style; onSaved: (id: string) => void; onCancel?: () => void; section?: 'all' | 'appearance' | 'profile' }) {
  const T = useT();
  const { state, update } = useStudio();
  const toast = useToast();
  const def = state.settings.defaults;
  const [d, setD] = useState({
    name: initial?.name ?? '', nameAr: initial?.nameAr ?? '', role: initial?.role ?? '', style: initial?.style ?? defaultStyle ?? def.style, sex: initial?.sex ?? 'FEMALE', species: initial?.species ?? '', ageYears: initial?.ageYears ?? 30,
    build: initial?.build ?? '', face: initial?.face ?? '', hair: initial?.hair ?? '', skin: initial?.skin ?? '', eyes: initial?.eyes ?? '', distinguishing: initial?.distinguishing.join(', ') ?? '', wardrobe: initial?.wardrobe ?? '', personality: initial?.personality ?? '',
    language: initial?.language ?? def.language, dialect: initial?.dialect ?? def.dialect, pitch: initial?.voice.pitch ?? 'MID', pace: initial?.voice.pace ?? 'MEASURED', timbre: initial?.voice.timbre ?? '', notes: initial?.voice.notes ?? '',
  });
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));
  const [error, setError] = useState<string | null>(null);
  const showAppearance = section !== 'profile'; const showProfile = section !== 'appearance';
  // a character who has been in a video keeps their look: those fields are shown, not editable (the action drops them too)
  const locked = initial ? appearanceLock(initial).locked : false;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!d.name.trim()) { setError(T('label.name')); return; }
    const base = { name: d.name.trim(), nameAr: d.nameAr.trim() || undefined, role: d.role.trim(), style: d.style, sex: d.sex, species: d.species.trim() || undefined, ageYears: Number(d.ageYears) || 1, build: d.build, face: d.face, hair: d.hair, skin: d.skin, eyes: d.eyes, distinguishing: d.distinguishing.split(',').map((x) => x.trim()).filter(Boolean), wardrobe: d.wardrobe, personality: d.personality, language: d.language, dialect: d.language === 'AR' ? d.dialect : undefined };
    if (initial) {
      update((s) => updateCharacter(s, initial.id, { ...base, voice: { ...initial.voice, pitch: d.pitch, pace: d.pace, timbre: d.timbre, notes: d.notes } }));
      toast.ok(T('toast.saved')); onSaved(initial.id);
    } else {
      let id = '';
      update((s) => { const r = addCharacter(s, { ...base, voice: { pitch: d.pitch, pace: d.pace, timbre: d.timbre, notes: d.notes } }); id = r.character.id; return r.state; });
      toast.ok(T('toast.created')); onSaved(id);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {showProfile && (
        <fieldset className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={T('label.name')} required error={error && !d.name.trim() ? `${T('label.name')} — ${T('wizard.needTitle')}` : null}><Input value={d.name} onChange={(e) => { set({ name: e.target.value }); setError(null); }} autoFocus /></Field>
            <Field label={T('label.nameAr')}><Input value={d.nameAr} dir="rtl" onChange={(e) => set({ nameAr: e.target.value })} /></Field>
            <Field label={T('label.role')} className="sm:col-span-2"><Input value={d.role} onChange={(e) => set({ role: e.target.value })} placeholder="Café owner, sixty, unhurried" /></Field>
            <Field label={T('label.style')} help={locked ? T('char.lock.short') : undefined}><Select disabled={locked} value={d.style} onChange={(e) => set({ style: e.target.value as Style })} options={STYLES.map((s) => ({ value: s, label: T.dyn(`style.${s}`) }))} /></Field>
            <Field label={T('label.language')}><Select value={d.language} onChange={(e) => set({ language: e.target.value as typeof d.language })} options={LANGUAGES.map((l) => ({ value: l, label: l === 'EN' ? T('label.english') : T('label.arabic') }))} /></Field>
            {d.language === 'AR' && <Field label={T('label.dialect')}><Select value={d.dialect} onChange={(e) => set({ dialect: e.target.value as typeof d.dialect })} options={DIALECTS.map((x) => ({ value: x, label: dialectLabel(x, T.locale) }))} /></Field>}
          </div>
          <Field label={T('label.personality')}><Textarea value={d.personality} onChange={(e) => set({ personality: e.target.value })} rows={3} /></Field>
        </fieldset>
      )}
      {showAppearance && (
        <fieldset className="space-y-4" disabled={locked}>
          {section === 'all' && <legend className="h3 mb-1">{T('tab.appearance')}</legend>}
          {locked && <Notice tone="info" title={T('char.lock.title')}>{T('char.lock.formHint')}</Notice>}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={T('label.sex')}><Select value={d.sex} onChange={(e) => set({ sex: e.target.value as typeof d.sex })} options={SEXES.map((x) => ({ value: x, label: x === 'FEMALE' ? T('label.female') : T('label.male') }))} /></Field>
            <Field label={T('label.age')}><Input type="number" min={1} max={110} value={d.ageYears} onChange={(e) => set({ ageYears: Number(e.target.value) })} /></Field>
            <Field label={T('label.species')} hint={T('wizard.optional')}><Input value={d.species} onChange={(e) => set({ species: e.target.value })} placeholder="cat" /></Field>
            <Field label={T('label.build')}><Input value={d.build} onChange={(e) => set({ build: e.target.value })} /></Field>
            <Field label={T('label.hair')}><Input value={d.hair} onChange={(e) => set({ hair: e.target.value })} /></Field>
            <Field label={T('label.eyes')}><Input value={d.eyes} onChange={(e) => set({ eyes: e.target.value })} /></Field>
            <Field label={T('label.skin')}><Input value={d.skin} onChange={(e) => set({ skin: e.target.value })} /></Field>
            <Field label={T('label.face')} className="sm:col-span-2"><Input value={d.face} onChange={(e) => set({ face: e.target.value })} /></Field>
            <Field label={T('label.distinguishing')} help="Comma-separated" className="sm:col-span-3"><Input value={d.distinguishing} onChange={(e) => set({ distinguishing: e.target.value })} /></Field>
            <Field label={T('label.wardrobe')} className="sm:col-span-3"><Textarea value={d.wardrobe} onChange={(e) => set({ wardrobe: e.target.value })} rows={2} /></Field>
          </div>
        </fieldset>
      )}
      {section === 'all' && (
        <fieldset className="space-y-4">
          <legend className="h3 mb-1">{T('tab.voice')}</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={T('label.pitch')}><Select value={d.pitch} onChange={(e) => set({ pitch: e.target.value as typeof d.pitch })} options={PITCHES.map((x) => ({ value: x, label: words(x) }))} /></Field>
            <Field label={T('label.pace')}><Select value={d.pace} onChange={(e) => set({ pace: e.target.value as typeof d.pace })} options={PACES.map((x) => ({ value: x, label: words(x) }))} /></Field>
            <Field label={T('label.timbre')}><Input value={d.timbre} onChange={(e) => set({ timbre: e.target.value })} placeholder="Gravelly, warm" /></Field>
            <Field label={T('label.voiceNotes')} className="sm:col-span-3"><Input value={d.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
          </div>
        </fieldset>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && <Button variant="ghost" onClick={onCancel}>{T('btn.cancel')}</Button>}
        <Button type="submit" variant="primary">{initial ? T('btn.save') : T('btn.create')}</Button>
      </div>
    </form>
  );
}
