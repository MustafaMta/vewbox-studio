'use client';

import type { Production, Shot } from '@/domain/types';
import { CAMERA_MOVES, FRAMINGS, TRANSITIONS, type CameraMove, type Framing, type Transition } from '@/domain/vocabulary';
import { nid } from '@/domain/actions';
import { castOf } from '@/studio/selectors';
import { useStudio } from '@/studio/store';
import { useT } from '@/components/ui/locale';
import { Button, Checkbox, Details, Field, Input, Select, Textarea } from '@/components/ui/kit';
import { IconDelete, IconPlus } from '@/components/ui/icons';
import { words } from '@/lib/format';

export type ShotDraft = Omit<Shot, 'id' | 'number' | 'takes' | 'selectedTakeId'>;

export const emptyShot = (sceneId: string): ShotDraft => ({ sceneId, purpose: '', action: '', framing: 'MEDIUM', cameraMove: 'STATIC', durationSeconds: 5, characterIds: [], dialogue: [], transition: 'CUT' });

/** WHAT HAPPENS IN A SHOT — plain filmmaking fields: the purpose, the action, who is in frame, the framing and the
 *  camera, the length, the dialogue. The rare settings sit behind "Advanced". Used by the shot editor and Add Shot. */
export function ShotFields({ p, draft, onChange, showScene }: { p: Production; draft: ShotDraft; onChange: (patch: Partial<ShotDraft>) => void; showScene?: boolean }) {
  const T = useT();
  const { state } = useStudio();
  const cast = castOf(state, p);
  const nameOf = (id: string) => cast.find((c) => c.id === id)?.name ?? '?';
  return (
    <div className="space-y-5">
      {showScene && <Field label={T('label.scene')}><Select value={draft.sceneId} onChange={(e) => onChange({ sceneId: e.target.value })} options={p.scenes.map((sc) => ({ value: sc.id, label: `${T('label.scene')} ${sc.number} · ${sc.title}` }))} /></Field>}
      <Field label={T('label.purpose')} help="One line: why this shot exists."><Input value={draft.purpose} onChange={(e) => onChange({ purpose: e.target.value })} placeholder="Establish the alley at dawn" /></Field>
      <Field label={T('label.action')}><Textarea value={draft.action} onChange={(e) => onChange({ action: e.target.value })} rows={3} placeholder="Layla walks towards camera down the shuttered alley, keys in hand." /></Field>
      <fieldset>
        <legend className="label">{T('label.people')}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">{cast.map((c) => <Checkbox key={c.id} label={c.name} checked={draft.characterIds.includes(c.id)} onChange={(e) => onChange({ characterIds: e.target.checked ? [...draft.characterIds, c.id] : draft.characterIds.filter((x) => x !== c.id) })} />)}{cast.length === 0 && <span className="text-xs text-faint">{T('empty.cast')}</span>}</div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={T('label.framing')}><Select value={draft.framing} onChange={(e) => onChange({ framing: e.target.value as Framing })} options={FRAMINGS.map((f) => ({ value: f, label: words(f) }))} /></Field>
        <Field label={T('label.camera')}><Select value={draft.cameraMove} onChange={(e) => onChange({ cameraMove: e.target.value as CameraMove })} options={CAMERA_MOVES.map((f) => ({ value: f, label: words(f) }))} /></Field>
        <Field label={`${T('label.duration')} (${T('label.seconds')})`}><Input type="number" min={1} max={30} step={0.5} value={draft.durationSeconds} onChange={(e) => onChange({ durationSeconds: Number(e.target.value) || 1 })} /></Field>
      </div>
      <fieldset>
        <div className="mb-1.5 flex items-center justify-between"><legend className="label !mb-0">{T('label.dialogue')}</legend><Button size="xs" variant="ghost" icon={<IconPlus />} disabled={draft.characterIds.length === 0} onClick={() => onChange({ dialogue: [...draft.dialogue, { id: nid('d'), characterId: draft.characterIds[0], text: '' }] })}>{T('btn.addLine')}</Button></div>
        {draft.dialogue.length === 0 ? <p className="text-xs text-faint">{T('empty.dialogue')}</p> : (
          <ul className="space-y-1.5">
            {draft.dialogue.map((d) => (
              <li key={d.id} className="grid gap-1.5 sm:grid-cols-[9rem_1fr_auto]">
                <Select aria-label={T('label.role')} value={d.characterId} onChange={(e) => onChange({ dialogue: draft.dialogue.map((x) => (x.id === d.id ? { ...x, characterId: e.target.value } : x)) })} options={draft.characterIds.map((id) => ({ value: id, label: nameOf(id) }))} />
                <div className="grid gap-1.5">
                  <Input value={d.text} aria-label={T('label.dialogue')} onChange={(e) => onChange({ dialogue: draft.dialogue.map((x) => (x.id === d.id ? { ...x, text: e.target.value } : x)) })} />
                  {p.language === 'AR' && <Input value={d.textAr ?? ''} dir="rtl" aria-label={`${T('label.dialogue')} (${T('label.arabic')})`} onChange={(e) => onChange({ dialogue: draft.dialogue.map((x) => (x.id === d.id ? { ...x, textAr: e.target.value } : x)) })} />}
                </div>
                <Button variant="ghost" size="xs" aria-label={T('btn.remove')} icon={<IconDelete />} onClick={() => onChange({ dialogue: draft.dialogue.filter((x) => x.id !== d.id) })} />
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      <Details summary={T('shot.advanced')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={T('label.transition')}><Select value={draft.transition} onChange={(e) => onChange({ transition: e.target.value as Transition })} options={TRANSITIONS.map((t) => ({ value: t, label: words(t) }))} /></Field>
          {p.kind === 'MUSIC_VIDEO' && <Field label={`${T('label.songWindow')} (${T('label.seconds')})`}><div className="flex items-center gap-2"><Input type="number" min={0} value={draft.songWindow?.from ?? 0} aria-label="from" onChange={(e) => onChange({ songWindow: { from: Number(e.target.value), to: draft.songWindow?.to ?? Number(e.target.value) + draft.durationSeconds } })} /><span className="text-faint">–</span><Input type="number" min={0} value={draft.songWindow?.to ?? draft.durationSeconds} aria-label="to" onChange={(e) => onChange({ songWindow: { from: draft.songWindow?.from ?? 0, to: Number(e.target.value) } })} /></div></Field>}
          <Field label={T('label.notes')} className="sm:col-span-2"><Textarea value={draft.notes ?? ''} onChange={(e) => onChange({ notes: e.target.value })} rows={2} /></Field>
          <Field label={T('gen.editPrompt')} help={T('gen.editPrompt.hint')} className="sm:col-span-2"><Textarea value={draft.prompt ?? ''} onChange={(e) => onChange({ prompt: e.target.value || undefined })} rows={5} dir="ltr" placeholder="Written automatically from the setting, the people and the action when empty." /></Field>
        </div>
      </Details>
    </div>
  );
}
