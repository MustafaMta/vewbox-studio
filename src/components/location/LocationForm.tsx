'use client';

import { useState } from 'react';
import type { Location } from '@/domain/types';
import { STYLES, TIMES_OF_DAY, type Style, type TimeOfDay } from '@/domain/vocabulary';
import { useStudio } from '@/studio/store';
import { T } from '@/lib/copy';
import { useToast } from '@/components/ui/toast';
import { Button, Checkbox, Field, Input, Segmented, Select, Textarea } from '@/components/ui/kit';
import { words } from '@/lib/format';

/** THE LOCATION FORM — a place described well enough to draw: what it is, what stands where, how it is lit. */
export function LocationForm({ initial, defaultStyle, onSaved, onCancel }: { initial?: Location; defaultStyle?: Style; onSaved: (id: string) => void; onCancel?: () => void }) {
  const { state, act } = useStudio();
  const toast = useToast();
  const [d, setD] = useState({ name: initial?.name ?? '', nameAr: initial?.nameAr ?? '', kind: initial?.kind ?? 'INTERIOR', style: initial?.style ?? defaultStyle ?? state.settings.defaults.style, description: initial?.description ?? '', landmarks: initial?.landmarks.join('\n') ?? '', props: initial?.props.join('\n') ?? '', lighting: initial?.lighting ?? (['MORNING', 'NIGHT'] as TimeOfDay[]) });
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));
  const [error, setError] = useState<string | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!d.name.trim()) { setError(T('wizard.needTitle')); return; }
    const base = { name: d.name.trim(), nameAr: d.nameAr.trim() || undefined, kind: d.kind, style: d.style, description: d.description, landmarks: d.landmarks.split('\n').map((x) => x.trim()).filter(Boolean), props: d.props.split('\n').map((x) => x.trim()).filter(Boolean), lighting: d.lighting };
    if (initial) { act('updateLocation', initial.id, base); toast.ok(T('toast.saved')); onSaved(initial.id); }
    else { const r = act('addLocation', base); toast.ok(T('toast.created')); onSaved(r.location.id); }
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={T('label.name')} required error={error}><Input value={d.name} onChange={(e) => { set({ name: e.target.value }); setError(null); }} autoFocus /></Field>
        <Field label={T('label.nameAr')}><Input value={d.nameAr} dir="rtl" onChange={(e) => set({ nameAr: e.target.value })} /></Field>
        <Field label={T('label.kind')}><div><Segmented label={T('label.kind')} value={d.kind} onChange={(v) => set({ kind: v })} options={[{ value: 'INTERIOR', label: T('label.interior') }, { value: 'EXTERIOR', label: T('label.exterior') }]} /></div></Field>
        <Field label={T('label.style')}><Select value={d.style} onChange={(e) => set({ style: e.target.value as Style })} options={STYLES.map((s) => ({ value: s, label: T.dyn(`style.${s}`) }))} /></Field>
      </div>
      <Field label={T('label.description')}><Textarea value={d.description} onChange={(e) => set({ description: e.target.value })} rows={3} /></Field>
      <Field label={T('label.landmarks')} help="One per line: what it is, and where it sits from the camera."><Textarea value={d.landmarks} onChange={(e) => set({ landmarks: e.target.value })} rows={3} /></Field>
      <Field label={T('tab.props')} help="One per line." hint={T('wizard.optional')}><Textarea value={d.props} onChange={(e) => set({ props: e.target.value })} rows={2} /></Field>
      <fieldset>
        <legend className="label">{T('label.lighting')}</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {TIMES_OF_DAY.map((tod) => <Checkbox key={tod} label={words(tod)} checked={d.lighting.includes(tod)} onChange={(e) => set({ lighting: e.target.checked ? [...d.lighting, tod] : d.lighting.filter((x) => x !== tod) })} />)}
        </div>
      </fieldset>
      <div className="flex justify-end gap-2">
        {onCancel && <Button variant="ghost" onClick={onCancel}>{T('btn.cancel')}</Button>}
        <Button type="submit" variant="primary">{initial ? T('btn.save') : T('btn.create')}</Button>
      </div>
    </form>
  );
}
