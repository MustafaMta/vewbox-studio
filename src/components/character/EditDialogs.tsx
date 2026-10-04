'use client';

import { useId, useState } from 'react';
import type { Character } from '@/domain/types';
import { DIALECTS, PACES, PITCHES, SEXES, STYLES, type Dialect, type Language, type Sex, type Style } from '@/domain/vocabulary';
import { voiceLock } from '@/domain/rules';
import { useStudio } from '@/studio/store';
import { useToast } from '@/components/ui/toast';
import { Button, Dialog, Field, Input, Segmented, Select, Textarea } from '@/components/ui/kit';
import { dialectLabel } from '@/lib/format';
import { AGE_BANDS, ageBandOf, BAND_AGE, type AgeBand } from './sheetModel';

/** EDIT BY SECTION (contract v2 §3) — three small dialogs instead of one long form, each opened from the profile:
 *  Details (name, Arabic name, short description, personality, language) stay editable after the character has been
 *  filmed, except the language once the voice is held; the Look is refused by the server once the character is locked,
 *  so its trigger is disabled with the reason; the Voice traits follow the voice lock. Writes go through the store's
 *  `updateCharacter` command, as before. */

export const STYLE_WORD: Record<Style, string> = { CARTOON: 'Cartoon', ANIME: 'Anime', REALISTIC: 'Realistic' };
export const BAND_WORD: Record<AgeBand, string> = { child: 'Child', teen: 'Teen', adult: 'Adult', older: 'Older' };
export const PITCH_WORD: Record<(typeof PITCHES)[number], string> = { LOW: 'Low', MID: 'Middle', HIGH: 'High' };
export const PACE_WORD: Record<(typeof PACES)[number], string> = { SLOW: 'Slow', MEASURED: 'Measured', QUICK: 'Quick' };
export const languageWords = (c: Pick<Character, 'language' | 'dialect'>) => `${c.language === 'EN' ? 'English' : 'Arabic'}${c.language === 'AR' && c.dialect ? ` (${dialectLabel(c.dialect)})` : ''}`;

function useSave(c: Character) {
  const { act } = useStudio();
  const toast = useToast();
  return (patch: Partial<Omit<Character, 'id' | 'createdAt' | 'usage'>>, close: () => void) => {
    try { act('updateCharacter', c.id, patch); toast.ok('Saved.'); close(); } catch (e) { toast.bad((e as Error).message); }
  };
}

const Foot = ({ form, onClose }: { form: string; onClose: () => void }) => (
  <><Button variant="quiet" onClick={onClose}>Cancel</Button><Button type="submit" form={form} variant="primary">Save</Button></>
);

export function DetailsDialog({ c, open, onClose }: { c: Character; open: boolean; onClose: () => void }) {
  const id = useId();
  return (
    <Dialog open={open} onClose={onClose} title="Edit details" description="Name, description and personality stay editable even after the character has been filmed." footer={<Foot form={id} onClose={onClose} />}>
      {open && <DetailsForm c={c} id={id} close={onClose} />}
    </Dialog>
  );
}

function DetailsForm({ c, id, close }: { c: Character; id: string; close: () => void }) {
  const save = useSave(c);
  const vlock = voiceLock(c);
  const [d, setD] = useState({ name: c.name, nameAr: c.nameAr ?? '', role: c.role, personality: c.personality, language: c.language as Language, dialect: (c.dialect ?? 'IRAQI_BAGHDADI') as Dialect });
  const [touched, setTouched] = useState(false);
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setTouched(true);
    if (!d.name.trim()) return;
    save({ name: d.name.trim(), nameAr: d.nameAr.trim() || undefined, role: d.role.trim(), personality: d.personality.trim(), ...(vlock.locked ? {} : { language: d.language, dialect: d.language === 'AR' ? d.dialect : undefined }) }, close);
  };
  return (
    <form id={id} className="char-form" onSubmit={submit} noValidate>
      <div className="pc-pair">
        <Field label="Name" error={touched && !d.name.trim() ? 'Give them a name.' : null}><Input value={d.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} /></Field>
        <Field label="Arabic name" optional><Input value={d.nameAr} dir="rtl" lang="ar" onChange={(e) => set({ nameAr: e.target.value })} maxLength={80} /></Field>
      </div>
      <Field label="Short description" hint={`${d.role.length} / 200`} help="One sentence: who they are in the story."><Input value={d.role} onChange={(e) => set({ role: e.target.value })} maxLength={200} /></Field>
      <Field label="Personality" hint={`${d.personality.length} / 400`}><Textarea value={d.personality} onChange={(e) => set({ personality: e.target.value })} rows={3} maxLength={400} /></Field>
      <div>
        <div className="char-form-row">
          <div><p className="label">Language</p><Segmented label="Language" value={d.language} onChange={(v) => set({ language: v })} options={[{ value: 'EN' as Language, label: 'English', disabled: vlock.locked }, { value: 'AR' as Language, label: 'Arabic', disabled: vlock.locked }]} /></div>
          {d.language === 'AR' && <Field label="Dialect"><Select value={d.dialect} disabled={vlock.locked} onChange={(e) => set({ dialect: e.target.value as Dialect })} options={DIALECTS.map((x) => ({ value: x, label: dialectLabel(x) }))} /></Field>}
        </div>
        <p className="help">{vlock.locked ? 'The language is kept: the character has spoken in a video with this voice.' : 'The language and dialect choose the voice engine.'}</p>
      </div>
    </form>
  );
}

/** The written look: style, sex, age and the look fields. Opened only while the look may change. */
export function LookDialog({ c, open, onClose }: { c: Character; open: boolean; onClose: () => void }) {
  const id = useId();
  return (
    <Dialog open={open} onClose={onClose} size="lg" title="Edit the look" description="How they look, in words. Saving does not change the image: redraw it to apply a new look." footer={<Foot form={id} onClose={onClose} />}>
      {open && <LookForm c={c} id={id} close={onClose} />}
    </Dialog>
  );
}

function LookForm({ c, id, close }: { c: Character; id: string; close: () => void }) {
  const save = useSave(c);
  const [d, setD] = useState({ style: c.style as Style, sex: c.sex as Sex, ageYears: c.ageYears, build: c.build, face: c.face, hair: c.hair, skin: c.skin, eyes: c.eyes, wardrobe: c.wardrobe, distinguishing: c.distinguishing.join(', ') });
  const [exact, setExact] = useState(false);
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));
  const submit = (e: React.FormEvent) => { e.preventDefault(); save({ ...d, ageYears: Math.min(120, Math.max(1, Math.round(Number(d.ageYears) || 1))), distinguishing: d.distinguishing.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 6) }, close); };
  const text = (k: 'build' | 'face' | 'hair' | 'skin' | 'eyes', label: string) => <Field label={label}><Input value={d[k]} onChange={(e) => set({ [k]: e.target.value })} maxLength={400} /></Field>;
  return (
    <form id={id} className="char-form" onSubmit={submit} noValidate>
      <div className="char-form-row">
        <div><p className="label">Style</p><Segmented label="Style" value={d.style} onChange={(v) => set({ style: v })} options={STYLES.map((s) => ({ value: s, label: STYLE_WORD[s] }))} /></div>
        <div><p className="label">Sex</p><Segmented label="Sex" value={d.sex} onChange={(v) => set({ sex: v })} options={SEXES.map((x) => ({ value: x, label: x === 'FEMALE' ? 'Female' : 'Male' }))} /></div>
        <div>
          <p className="label">Age</p>
          <div className="char-form-acts">
            <Segmented label="Age" value={ageBandOf(d.ageYears)} onChange={(b: AgeBand) => set({ ageYears: BAND_AGE[b] })} options={AGE_BANDS.map((b) => ({ value: b, label: BAND_WORD[b] }))} />
            <Button size="sm" variant="quiet" aria-expanded={exact} onClick={() => setExact((v) => !v)}>Exact age</Button>
            {exact && <Input type="number" min={1} max={120} value={d.ageYears} onChange={(e) => set({ ageYears: Number(e.target.value) })} aria-label="Exact age" style={{ inlineSize: 96 }} />}
          </div>
        </div>
      </div>
      <div className="pc-pair">
        {text('build', 'Build')}{text('face', 'Face')}{text('hair', 'Hair')}{text('skin', 'Skin')}{text('eyes', 'Eyes')}
        <Field label="Distinguishing marks" help="Separate with commas: a scar, a limp, round glasses."><Input value={d.distinguishing} onChange={(e) => set({ distinguishing: e.target.value })} /></Field>
      </div>
      <Field label="Wardrobe"><Textarea value={d.wardrobe} onChange={(e) => set({ wardrobe: e.target.value })} rows={2} maxLength={400} /></Field>
    </form>
  );
}

/** How the voice should feel: pitch, pace, timbre, notes. Held once the voice is preserved. */
export function VoiceTraitsDialog({ c, open, onClose }: { c: Character; open: boolean; onClose: () => void }) {
  const id = useId();
  return (
    <Dialog open={open} onClose={onClose} title="How the voice should sound" description="The studio designs and checks voices against these." footer={<Foot form={id} onClose={onClose} />}>
      {open && <VoiceTraitsForm c={c} id={id} close={onClose} />}
    </Dialog>
  );
}

function VoiceTraitsForm({ c, id, close }: { c: Character; id: string; close: () => void }) {
  const save = useSave(c);
  const [d, setD] = useState({ pitch: c.voice.pitch, pace: c.voice.pace, timbre: c.voice.timbre, notes: c.voice.notes });
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));
  return (
    <form id={id} className="char-form" onSubmit={(e) => { e.preventDefault(); save({ voice: { ...c.voice, ...d } }, close); }} noValidate>
      <div className="char-form-row">
        <div><p className="label">Pitch</p><Segmented label="Pitch" value={d.pitch} onChange={(v) => set({ pitch: v })} options={PITCHES.map((x) => ({ value: x, label: PITCH_WORD[x] }))} /></div>
        <div><p className="label">Pace</p><Segmented label="Pace" value={d.pace} onChange={(v) => set({ pace: v })} options={PACES.map((x) => ({ value: x, label: PACE_WORD[x] }))} /></div>
      </div>
      <Field label="Timbre"><Input value={d.timbre} onChange={(e) => set({ timbre: e.target.value })} placeholder="Gravelly, warm" maxLength={200} /></Field>
      <Field label="Performance notes"><Textarea value={d.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} maxLength={400} /></Field>
    </form>
  );
}
