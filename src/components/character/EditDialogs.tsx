'use client';

import { useState } from 'react';
import type { Character } from '@/domain/types';
import { DIALECTS, PACES, PITCHES, SEXES, STYLES, type Dialect, type Language, type Sex, type Style } from '@/domain/vocabulary';
import { voiceLock } from '@/domain/rules';
import { useStudio } from '@/studio/store';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { Button, Field, Input, Modal, Segmented, Select, Textarea } from '@/components/ui/kit';
import { IconEdit } from '@/components/ui/icons';
import { dialectLabel } from '@/lib/format';
import { AGE_BANDS, ageBandOf, BAND_AGE, type AgeBand } from './sheetModel';

/** EDIT BY SECTION (DESIGN-SYSTEM-V3 §9.6, contract v2 §3) — small dialogs instead of one 22-field form. Details
 *  (name, Arabic name, short description, personality) stay editable after the character has been in a video; the
 *  language is held once the voice is preserved (a new language would make that voice stale). The look is an
 *  appearance field set: refused by the server once the character is locked, so its trigger is disabled with the
 *  reason. Voice characteristics follow the voice lock. */

function useSave(c: Character) {
  const { act } = useStudio();
  const toast = useToast();
  const T = useT();
  return (patch: Partial<Omit<Character, 'id' | 'createdAt' | 'usage'>>, close: () => void) => {
    try { act('updateCharacter', c.id, patch); toast.ok(T('toast.saved')); close(); } catch (e) { toast.bad((e as Error).message); }
  };
}

export function DetailsDialog({ c }: { c: Character }) {
  const T = useT();
  return (
    <Modal title={T('cast.edit.details')} description={T('cast.edit.detailsHint')} trigger={(open) => <Button size="sm" variant="secondary" icon={<IconEdit />} onClick={open}>{T('cast.edit.details')}</Button>}>
      {(close) => <DetailsForm c={c} close={close} />}
    </Modal>
  );
}

function DetailsForm({ c, close }: { c: Character; close: () => void }) {
  const T = useT();
  const save = useSave(c);
  const vlock = voiceLock(c);
  const [d, setD] = useState({ name: c.name, nameAr: c.nameAr ?? '', role: c.role, personality: c.personality, language: c.language as Language, dialect: (c.dialect ?? 'IRAQI_BAGHDADI') as Dialect });
  const [touched, setTouched] = useState(false);
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));
  const nameError = touched && !d.name.trim() ? T('char.form.needName') : null;
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setTouched(true);
    if (!d.name.trim()) return;
    const patch = { name: d.name.trim(), nameAr: d.nameAr.trim() || undefined, role: d.role.trim(), personality: d.personality.trim(), ...(vlock.locked ? {} : { language: d.language, dialect: d.language === 'AR' ? d.dialect : undefined }) };
    save(patch, close);
  };
  return (
    <form className="space-y-5" onSubmit={submit} noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={T('label.name')} error={nameError}><Input value={d.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} autoFocus /></Field>
        <Field label={T('label.nameAr')} hint={T('wizard.optional')}><Input value={d.nameAr} dir="rtl" onChange={(e) => set({ nameAr: e.target.value })} maxLength={80} /></Field>
      </div>
      <Field label={T('cast.edit.description')} hint={<span className="num" dir="ltr">{d.role.length} / 200</span>} help={T('char.form.roleHelp')}><Input value={d.role} onChange={(e) => set({ role: e.target.value })} maxLength={200} /></Field>
      <Field label={T('label.personality')} hint={<span className="num" dir="ltr">{d.personality.length} / 400</span>}><Textarea value={d.personality} onChange={(e) => set({ personality: e.target.value })} rows={3} maxLength={400} /></Field>
      <div>
        <div className="flex flex-wrap items-end gap-4">
          <div><p className="label">{T('label.language')}</p><Segmented label={T('label.language')} value={d.language} onChange={(v) => set({ language: v })} options={[{ value: 'EN' as Language, label: T('label.english'), disabled: vlock.locked }, { value: 'AR' as Language, label: T('label.arabic'), disabled: vlock.locked }]} /></div>
          {d.language === 'AR' && <Field label={T('label.dialect')} className="min-w-[11rem]"><Select value={d.dialect} disabled={vlock.locked} onChange={(e) => set({ dialect: e.target.value as Dialect })} options={DIALECTS.map((x) => ({ value: x, label: dialectLabel(x, T.locale) }))} /></Field>}
        </div>
        <p className="help">{vlock.locked ? T('cast.edit.languageLocked') : T('cast.edit.languageHint')}</p>
      </div>
      <div className="sheet-actions flex justify-end gap-2"><Button variant="quiet" onClick={close}>{T('btn.cancel')}</Button><Button type="submit" variant="primary">{T('btn.save')}</Button></div>
    </form>
  );
}

/** The written look: style, sex, age and the look fields. Disabled (with the reason) once the character is locked. */
export function LookDialog({ c, locked, describedBy }: { c: Character; locked: boolean; describedBy?: string }) {
  const T = useT();
  return (
    <Modal title={T('cast.edit.look')} description={T('cast.edit.lookHint')} size="lg" trigger={(open) => <Button size="sm" variant="quiet" icon={<IconEdit />} onClick={open} disabled={locked} aria-describedby={locked ? describedBy : undefined}>{T('cast.edit.look')}</Button>}>
      {(close) => <LookForm c={c} close={close} />}
    </Modal>
  );
}

function LookForm({ c, close }: { c: Character; close: () => void }) {
  const T = useT();
  const save = useSave(c);
  const [d, setD] = useState({ style: c.style as Style, sex: c.sex as Sex, ageYears: c.ageYears, build: c.build, face: c.face, hair: c.hair, skin: c.skin, eyes: c.eyes, wardrobe: c.wardrobe, distinguishing: c.distinguishing.join(', ') });
  const [exact, setExact] = useState(false);
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));
  const submit = (e: React.FormEvent) => { e.preventDefault(); save({ ...d, ageYears: Math.min(120, Math.max(1, Math.round(Number(d.ageYears) || 1))), distinguishing: d.distinguishing.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 6) }, close); };
  const text = (k: 'build' | 'face' | 'hair' | 'skin' | 'eyes', label: string) => <Field label={label}><Input value={d[k]} onChange={(e) => set({ [k]: e.target.value })} maxLength={400} /></Field>;
  return (
    <form className="space-y-5" onSubmit={submit} noValidate>
      <div className="flex flex-wrap gap-x-6 gap-y-4">
        <div><p className="label">{T('label.style')}</p><Segmented label={T('label.style')} value={d.style} onChange={(v) => set({ style: v })} options={STYLES.map((s) => ({ value: s, label: T.dyn(`style.${s}`) }))} /></div>
        <div><p className="label">{T('label.sex')}</p><Segmented label={T('label.sex')} value={d.sex} onChange={(v) => set({ sex: v })} options={SEXES.map((x) => ({ value: x, label: x === 'FEMALE' ? T('label.female') : T('label.male') }))} /></div>
        <div>
          <p className="label">{T('label.age')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented label={T('label.age')} value={ageBandOf(d.ageYears)} onChange={(b: AgeBand) => set({ ageYears: BAND_AGE[b] })} options={AGE_BANDS.map((b) => ({ value: b, label: T.dyn(`char.form.age.${b}`) }))} />
            <button type="button" className="text-[13px] font-medium text-muted underline-offset-2 hover:text-fg hover:underline" aria-expanded={exact} onClick={() => setExact((v) => !v)}>{T('char.form.exactAge')}</button>
            {exact && <Input type="number" min={1} max={120} value={d.ageYears} onChange={(e) => set({ ageYears: Number(e.target.value) })} aria-label={T('char.form.exactAge')} className="w-24" />}
          </div>
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {text('build', T('label.build'))}{text('face', T('label.face'))}{text('hair', T('label.hair'))}{text('skin', T('label.skin'))}{text('eyes', T('label.eyes'))}
        <Field label={T('label.distinguishing')} help={T('char.form.distinguishingHelp')}><Input value={d.distinguishing} onChange={(e) => set({ distinguishing: e.target.value })} /></Field>
        <Field label={T('label.wardrobe')} className="sm:col-span-2"><Textarea value={d.wardrobe} onChange={(e) => set({ wardrobe: e.target.value })} rows={2} maxLength={400} /></Field>
      </div>
      <p className="help">{T('cast.edit.lookRedraw')}</p>
      <div className="sheet-actions flex justify-end gap-2"><Button variant="quiet" onClick={close}>{T('btn.cancel')}</Button><Button type="submit" variant="primary">{T('btn.save')}</Button></div>
    </form>
  );
}

/** How the voice should feel: pitch, pace, timbre, notes. Held once the voice is preserved. */
export function VoiceTraitsDialog({ c, locked }: { c: Character; locked: boolean }) {
  const T = useT();
  return (
    <Modal title={T('cast.edit.voiceTraits')} trigger={(open) => <Button size="sm" variant="quiet" icon={<IconEdit />} onClick={open} disabled={locked} aria-describedby={locked ? 'voice-lock' : undefined}>{T('btn.edit')}</Button>}>
      {(close) => <VoiceTraitsForm c={c} close={close} />}
    </Modal>
  );
}

function VoiceTraitsForm({ c, close }: { c: Character; close: () => void }) {
  const T = useT();
  const save = useSave(c);
  const [d, setD] = useState({ pitch: c.voice.pitch, pace: c.voice.pace, timbre: c.voice.timbre, notes: c.voice.notes });
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));
  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save({ voice: { ...c.voice, ...d } }, close); }} noValidate>
      <div className="flex flex-wrap gap-x-6 gap-y-4">
        <div><p className="label">{T('label.pitch')}</p><Segmented label={T('label.pitch')} value={d.pitch} onChange={(v) => set({ pitch: v })} options={PITCHES.map((x) => ({ value: x, label: T.dyn(`voice.pitch.${x}`) }))} /></div>
        <div><p className="label">{T('label.pace')}</p><Segmented label={T('label.pace')} value={d.pace} onChange={(v) => set({ pace: v })} options={PACES.map((x) => ({ value: x, label: T.dyn(`voice.pace.${x}`) }))} /></div>
      </div>
      <Field label={T('label.timbre')}><Input value={d.timbre} onChange={(e) => set({ timbre: e.target.value })} placeholder={T('char.form.timbrePh')} maxLength={200} /></Field>
      <Field label={T('label.voiceNotes')}><Textarea value={d.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} maxLength={400} /></Field>
      <div className="sheet-actions flex justify-end gap-2"><Button variant="quiet" onClick={close}>{T('btn.cancel')}</Button><Button type="submit" variant="primary">{T('btn.save')}</Button></div>
    </form>
  );
}
