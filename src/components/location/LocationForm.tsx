'use client';

import { useId, useState } from 'react';
import type { Location } from '@/domain/types';
import { STYLES, TIMES_OF_DAY, type Style, type TimeOfDay } from '@/domain/vocabulary';
import { useStudio } from '@/studio/store';
import { useToast } from '@/components/ui/toast';
import { Button, Checkbox, Field, Input, Segmented, Textarea } from '@/components/ui/kit';
import { IconGenerate } from '@/components/ui/icons';
import { words } from '@/lib/format';

export const STYLE_WORDS: Record<Style, string> = { CARTOON: 'Cartoon', ANIME: 'Anime', REALISTIC: 'Realistic' };
export const timeWord = (t: string) => words(t);

/** THE LOCATION FORM — a place described well enough to draw: what it is, what stands where, how it is lit. Creates
 *  (addLocation) or saves (updateLocation) through the store's commands. `withDraw` adds "Create and draw plates" (the
 *  caller starts LOCATION_PLATES from `onSaved(id, true)`); `footer: false` hands the actions to a dialog footer
 *  (submit with `form={formId}`). Used by the location pages, the wizard and the canon picker. */
export function LocationForm({ initial, defaultStyle, onSaved, onCancel, withDraw, formId, footer = true }: {
  initial?: Location; defaultStyle?: Style; onSaved: (id: string, draw?: boolean) => void; onCancel?: () => void; withDraw?: boolean; formId?: string; footer?: boolean;
}) {
  const { state, act } = useStudio();
  const toast = useToast();
  const auto = useId();
  const id = formId ?? auto;
  const [d, setD] = useState({ name: initial?.name ?? '', nameAr: initial?.nameAr ?? '', kind: initial?.kind ?? 'INTERIOR', style: initial?.style ?? defaultStyle ?? state.settings.defaults.style, description: initial?.description ?? '', landmarks: initial?.landmarks.join('\n') ?? '', props: initial?.props.join('\n') ?? '', lighting: initial?.lighting ?? (['MORNING', 'NIGHT'] as TimeOfDay[]) });
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));
  const [touched, setTouched] = useState(false);
  const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
  const save = (draw: boolean) => {
    setTouched(true);
    if (!d.name.trim()) { document.getElementById(`${id}-name`)?.focus(); return; }
    const base = { name: d.name.trim(), nameAr: d.nameAr.trim() || undefined, kind: d.kind, style: d.style, description: d.description.trim(), landmarks: lines(d.landmarks), props: lines(d.props), lighting: d.lighting.length ? d.lighting : (['MORNING'] as TimeOfDay[]) };
    try {
      if (initial) { act('updateLocation', initial.id, base); toast.ok('Saved.'); onSaved(initial.id); }
      else { const r = act('addLocation', base); toast.ok(`${base.name} was created.`); onSaved(r.location.id, draw); }
    } catch (e) { toast.bad((e as Error).message); }
  };
  return (
    <form id={id} onSubmit={(e) => { e.preventDefault(); save(Boolean(withDraw)); }} className="char-form" noValidate>
      <div className="pc-pair">
        <Field label="Name" error={touched && !d.name.trim() ? 'Give the place a name.' : null}><Input id={`${id}-name`} value={d.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} autoComplete="off" /></Field>
        <Field label="Arabic name" optional><Input value={d.nameAr} dir="rtl" lang="ar" onChange={(e) => set({ nameAr: e.target.value })} maxLength={80} /></Field>
      </div>
      <div className="pc-choices">
        <div><p className="label">Kind</p><Segmented label="Kind" value={d.kind} onChange={(v) => set({ kind: v })} options={[{ value: 'INTERIOR' as const, label: 'Interior' }, { value: 'EXTERIOR' as const, label: 'Exterior' }]} /></div>
        <div><p className="label">Style</p><Segmented label="Style" value={d.style} onChange={(v) => set({ style: v })} options={STYLES.map((s) => ({ value: s, label: STYLE_WORDS[s] }))} /></div>
      </div>
      <Field label="What the place is" help="The light, the materials, what you see from the camera."><Textarea value={d.description} onChange={(e) => set({ description: e.target.value })} rows={3} maxLength={2000} /></Field>
      <Field label="Landmarks" optional help="One per line: what it is, and where it sits from the camera."><Textarea value={d.landmarks} onChange={(e) => set({ landmarks: e.target.value })} rows={3} /></Field>
      <Field label="Props" optional help="One per line."><Textarea value={d.props} onChange={(e) => set({ props: e.target.value })} rows={2} /></Field>
      <fieldset className="pc-fieldset">
        <legend className="label">Lighting to draw</legend>
        <div className="pc-choices">
          {TIMES_OF_DAY.map((tod) => <Checkbox key={tod} label={timeWord(tod)} checked={d.lighting.includes(tod)} onChange={(e) => set({ lighting: e.target.checked ? [...d.lighting, tod] : d.lighting.filter((x) => x !== tod) })} />)}
        </div>
      </fieldset>
      {footer && (
        <div className="creation-foot">
          <span className="t-meta">{withDraw ? 'Drawing the plates takes a few minutes.' : ''}</span>
          <span className="char-form-acts">
            {onCancel && <Button variant="quiet" onClick={onCancel}>Cancel</Button>}
            {initial ? <Button type="submit" variant="primary">Save</Button> : withDraw ? <>
              <Button variant="secondary" onClick={() => save(false)}>Create without drawing</Button>
              <Button type="submit" variant="primary" icon={<IconGenerate />}>Create and draw plates</Button>
            </> : <Button type="submit" variant="primary">Create</Button>}
          </span>
        </div>
      )}
    </form>
  );
}
