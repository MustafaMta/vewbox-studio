'use client';

import type { Production, Shot } from '@/domain/types';
import { CAMERA_MOVES, FRAMINGS, TRANSITIONS, type CameraMove, type Framing, type Transition } from '@/domain/vocabulary';
import { nid } from '@/domain/actions';
import { castOf } from '@/studio/selectors';
import { useStudio } from '@/studio/store';
import { Button, Checkbox, Details, Field, Input, Select, Textarea } from '@/components/ui/kit';
import { IconDelete, IconPlus } from '@/components/ui/icons';
import { vocab as words } from './model';

export type ShotDraft = Omit<Shot, 'id' | 'number' | 'takes' | 'selectedTakeId'>;

export const emptyShot = (sceneId: string): ShotDraft => ({ sceneId, purpose: '', action: '', framing: 'MEDIUM', cameraMove: 'STATIC', durationSeconds: 5, characterIds: [], dialogue: [], transition: 'CUT' });

/** WHAT HAPPENS IN A SHOT — plain filmmaking fields: the purpose, the action, who is in frame, the framing and the
 *  camera, the length, the dialogue. The rare settings sit behind "Advanced". Used by the shot editor and Add Shot. */
export function ShotFields({ p, draft, onChange, showScene }: { p: Production; draft: ShotDraft; onChange: (patch: Partial<ShotDraft>) => void; showScene?: boolean }) {
  const { state } = useStudio();
  const cast = castOf(state, p);
  const nameOf = (id: string) => cast.find((c) => c.id === id)?.name ?? '?';
  return (
    <div className="ws-form">
      {showScene && <Field label={'Scene'}><Select value={draft.sceneId} onChange={(e) => onChange({ sceneId: e.target.value })} options={p.scenes.map((sc) => ({ value: sc.id, label: `${'Scene'} ${sc.number} · ${sc.title}` }))} /></Field>}
      <Field label={'Purpose'} help="One line: why this shot exists."><Input value={draft.purpose} onChange={(e) => onChange({ purpose: e.target.value })} placeholder="Establish the alley at dawn" /></Field>
      <Field label={'Action'}><Textarea value={draft.action} onChange={(e) => onChange({ action: e.target.value })} rows={3} placeholder="Layla walks towards camera down the shuttered alley, keys in hand." /></Field>
      <fieldset>
        <legend className="t-label">{'People in the shot'}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">{cast.map((c) => <Checkbox key={c.id} label={c.name} checked={draft.characterIds.includes(c.id)} onChange={(e) => onChange({ characterIds: e.target.checked ? [...draft.characterIds, c.id] : draft.characterIds.filter((x) => x !== c.id) })} />)}{cast.length === 0 && <span className="t-meta">{'Nobody in the cast yet.'}</span>}</div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={'Framing'}><Select value={draft.framing} onChange={(e) => onChange({ framing: e.target.value as Framing })} options={FRAMINGS.map((f) => ({ value: f, label: words(f) }))} /></Field>
        <Field label={'Camera'}><Select value={draft.cameraMove} onChange={(e) => onChange({ cameraMove: e.target.value as CameraMove })} options={CAMERA_MOVES.map((f) => ({ value: f, label: words(f) }))} /></Field>
        <Field label={`${'Duration'} (${'seconds'})`}><Input type="number" min={1} max={30} step={0.5} value={draft.durationSeconds} onChange={(e) => onChange({ durationSeconds: Number(e.target.value) || 1 })} /></Field>
      </div>
      <fieldset>
        <div className="mb-1.5 flex items-center justify-between"><legend className="t-label">{'Dialogue'}</legend><Button size="sm" variant="quiet" icon={<IconPlus />} disabled={draft.characterIds.length === 0} onClick={() => onChange({ dialogue: [...draft.dialogue, { id: nid('d'), characterId: draft.characterIds[0], text: '' }] })}>{'Add line'}</Button></div>
        {draft.dialogue.length === 0 ? <p className="t-meta">{'No dialogue in this shot.'}</p> : (
          <ul className="space-y-1.5">
            {draft.dialogue.map((d) => (
              <li key={d.id} className="grid gap-1.5 sm:grid-cols-[9rem_1fr_auto]">
                <Select aria-label={'Role'} value={d.characterId} onChange={(e) => onChange({ dialogue: draft.dialogue.map((x) => (x.id === d.id ? { ...x, characterId: e.target.value } : x)) })} options={draft.characterIds.map((id) => ({ value: id, label: nameOf(id) }))} />
                <div className="grid gap-1.5">
                  <Input value={d.text} aria-label={'Dialogue'} onChange={(e) => onChange({ dialogue: draft.dialogue.map((x) => (x.id === d.id ? { ...x, text: e.target.value } : x)) })} />
                  {p.language === 'AR' && <Input value={d.textAr ?? ''} dir="rtl" lang="ar" aria-label={`${'Dialogue'} (${'Arabic'})`} onChange={(e) => onChange({ dialogue: draft.dialogue.map((x) => (x.id === d.id ? { ...x, textAr: e.target.value } : x)) })} />}
                </div>
                <Button variant="quiet" size="sm" aria-label={'Remove'} icon={<IconDelete />} onClick={() => onChange({ dialogue: draft.dialogue.filter((x) => x.id !== d.id) })} />
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      <Details summary={'Advanced'}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={'Begins with'}><Select value={draft.transition} onChange={(e) => onChange({ transition: e.target.value as Transition })} options={TRANSITIONS.map((t) => ({ value: t, label: words(t) }))} /></Field>
          {p.kind === 'MUSIC_VIDEO' && <Field label={`${'Song window'} (${'seconds'})`}><div className="flex items-center gap-2"><Input type="number" min={0} value={draft.songWindow?.from ?? 0} aria-label="from" onChange={(e) => onChange({ songWindow: { from: Number(e.target.value), to: draft.songWindow?.to ?? Number(e.target.value) + draft.durationSeconds } })} /><span className="text-faint">–</span><Input type="number" min={0} value={draft.songWindow?.to ?? draft.durationSeconds} aria-label="to" onChange={(e) => onChange({ songWindow: { from: draft.songWindow?.from ?? 0, to: Number(e.target.value) } })} /></div></Field>}
          <Field label={'Notes'} className="sm:col-span-2"><Textarea value={draft.notes ?? ''} onChange={(e) => onChange({ notes: e.target.value })} rows={2} /></Field>
          <Field label={'Prompt for this shot'} help={'Written by the studio from the shot; edit it and the next take uses your words.'} className="sm:col-span-2"><Textarea value={draft.prompt ?? ''} onChange={(e) => onChange({ prompt: e.target.value || undefined })} rows={5} dir="ltr" placeholder="Written automatically from the setting, the people and the action when empty." /></Field>
        </div>
      </Details>
    </div>
  );
}
