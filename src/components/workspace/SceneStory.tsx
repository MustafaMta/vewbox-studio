'use client';

import { useState } from 'react';
import type { PersistentChange, Production, Scene, SceneStory } from '@/domain/types';
import { nid } from '@/domain/actions';
import { Button, Checkbox, Field, Input, Select } from '@/components/ui/kit';
import { IconDelete, IconPlus } from '@/components/ui/icons';

/** WHAT A SCENE CHANGES IN THE STORY (src/domain/types.ts SceneStory; cloud directive 2026-10-05 §4 "Story state"):
 *  the events it completes, what a character learns, the persistent changes to a person, a prop or the place, each
 *  taking effect at the end of the scene or at one of its shots. Every later shot's production context carries them
 *  (src/domain/production-context.ts) — the story's state lives in the studio, not in a model's memory.
 *
 *  A fact is saved only once it has words (the studio refuses a fact without them; an ending change is the one
 *  exception): a new row, or a row whose words were cleared, stays a draft on this page until it has text again. */

type Person = { id: string; name: string };
type Event = NonNullable<SceneStory['events']>[number];
type Knowledge = NonNullable<SceneStory['knowledge']>[number];
type Kind = 'events' | 'changes' | 'knowledge';
type Row = Event | PersistentChange | Knowledge;

const at = (sc: Scene, shots: Production['shots']) => [{ value: '', label: 'From the end of the scene' }, ...shots.filter((s) => s.sceneId === sc.id).sort((a, b) => a.number - b.number).map((s) => ({ value: s.id, label: `From after shot ${sc.number}.${s.number}` }))];
/** a fact the studio will keep: it has words (an ending change may have none) */
export const factReady = (kind: Kind, r: Row): boolean => r.text.trim() !== '' || (kind === 'changes' && Boolean((r as PersistentChange).cleared));

export function SceneStoryEditor({ p, scene, cast, set }: { p: Production; scene: Scene; cast: Person[]; set: (patch: Partial<Scene>) => void }) {
  const story: SceneStory = scene.story ?? {};
  // drafts: rows not ready to save (new, or emptied), by kind and id; a saved row with a draft shows the draft
  const [drafts, setDrafts] = useState<Record<Kind, Record<string, Row>>>({ events: {}, changes: {}, knowledge: {} });
  const saved = { events: story.events ?? [], changes: story.changes ?? [], knowledge: story.knowledge ?? [] } as Record<Kind, Row[]>;
  const rows = <T extends Row>(kind: Kind): T[] => [...saved[kind].map((r) => (drafts[kind][r.id] ?? r) as T), ...(Object.values(drafts[kind]).filter((d) => !saved[kind].some((r) => r.id === d.id)) as T[])];
  const draft = (kind: Kind, id: string, r?: Row) => setDrafts((d) => { const next = { ...d[kind] }; if (r) next[id] = r; else delete next[id]; return { ...d, [kind]: next }; });
  const update = (kind: Kind, r: Row) => {
    if (!factReady(kind, r)) { draft(kind, r.id, r); return; }
    draft(kind, r.id);
    const list = saved[kind];
    set({ story: { ...story, [kind]: list.some((x) => x.id === r.id) ? list.map((x) => (x.id === r.id ? r : x)) : [...list, r] } });
  };
  const remove = (kind: Kind, id: string) => { draft(kind, id); if (saved[kind].some((x) => x.id === id)) set({ story: { ...story, [kind]: saved[kind].filter((x) => x.id !== id) } }); };
  const when = at(scene, p.shots);
  const subjectValue = (c: PersistentChange) => (c.subject.kind === 'CHARACTER' ? `c:${c.subject.characterId}` : c.subject.kind === 'LOCATION' ? 'place' : 'prop');
  const subjectOptions = [...cast.map((c) => ({ value: `c:${c.id}`, label: c.name })), ...(scene.locationId ? [{ value: 'place', label: 'The place' }] : []), { value: 'prop', label: 'A prop' }];
  const toSubject = (v: string, old?: PersistentChange['subject']): PersistentChange['subject'] => (v.startsWith('c:') ? { kind: 'CHARACTER', characterId: v.slice(2) } : v === 'place' && scene.locationId ? { kind: 'LOCATION', locationId: scene.locationId } : { kind: 'PROP', name: old?.kind === 'PROP' ? old.name : '' });
  const events = rows<Event>('events'); const changes = rows<PersistentChange>('changes'); const knowledge = rows<Knowledge>('knowledge');
  const unsaved = (kind: Kind, id: string) => Boolean(drafts[kind][id]);
  const Note = ({ kind, id }: { kind: Kind; id: string }) => (unsaved(kind, id) ? <span className="t-meta ws-fact-note">Not saved until it has words.</span> : null);
  return (
    <fieldset className="ws-fieldset ws-scene-story">
      <legend className="t-label">What the scene changes</legend>
      <p className="t-meta">Kept by the studio and carried into every later shot: what happened, what someone now knows, and what stays changed.</p>

      <Field label="Events" help="What has happened once the scene is over.">
        <ul className="ws-facts" role="list">
          {events.map((e, i) => (
            <li key={e.id} className="ws-fact ws-fact-event">
              <Input value={e.text} dir="auto" aria-label={`Event ${i + 1}`} placeholder="What has happened" autoFocus={unsaved('events', e.id) && !e.text} onChange={(x) => update('events', { ...e, text: x.target.value })} />
              <Button variant="quiet" size="sm" className="ws-fact-x" aria-label={`Remove event ${i + 1}`} icon={<IconDelete aria-hidden />} onClick={() => remove('events', e.id)} />
              <Note kind="events" id={e.id} />
            </li>
          ))}
        </ul>
        <div><Button size="sm" variant="quiet" icon={<IconPlus aria-hidden />} onClick={() => { const id = nid('fact'); draft('events', id, { id, text: '' }); }}>Add an event</Button></div>
      </Field>

      <Field label="Persistent changes" help="A wound, wet clothes, a broken window, a cup left on the table — until a later scene changes it back.">
        <ul className="ws-facts" role="list">
          {changes.map((c, i) => (
            <li key={c.id} className="ws-fact ws-fact-change">
              <span className="ws-fact-who">
                <Select aria-label={`Change ${i + 1}: who or what changes`} value={subjectValue(c)} options={subjectOptions} onChange={(x) => update('changes', { ...c, subject: toSubject(x.target.value, c.subject) })} />
                {c.subject.kind === 'PROP' && <Input value={c.subject.name} aria-label={`Change ${i + 1}: which prop`} placeholder="Which prop" dir="auto" onChange={(x) => update('changes', { ...c, subject: { kind: 'PROP', name: x.target.value } })} />}
              </span>
              <Input className="ws-fact-text" value={c.text} dir="auto" aria-label={`Change ${i + 1}: the change`} placeholder={c.cleared ? 'What ends (healed, dried, repaired)' : 'The change, as it should look'} autoFocus={unsaved('changes', c.id) && !c.text} onChange={(x) => update('changes', { ...c, text: x.target.value })} />
              <Select className="ws-fact-when" aria-label={`Change ${i + 1}: from when`} value={c.atShotId ?? ''} options={when} onChange={(x) => update('changes', { ...c, atShotId: x.target.value || undefined })} />
              <Input className="ws-fact-key" value={c.key ?? ''} aria-label={`Change ${i + 1}: key`} placeholder="Key, e.g. arm (to replace or end it later)" onChange={(x) => update('changes', { ...c, key: x.target.value || undefined })} />
              <span className="ws-fact-foot">
                <Checkbox label="Ends an earlier change" checked={Boolean(c.cleared)} onChange={(x) => update('changes', { ...c, cleared: x.target.checked || undefined })} />
                <Note kind="changes" id={c.id} />
                <Button variant="quiet" size="sm" className="ws-fact-x" aria-label={`Remove change ${i + 1}`} icon={<IconDelete aria-hidden />} onClick={() => remove('changes', c.id)} />
              </span>
            </li>
          ))}
        </ul>
        <div><Button size="sm" variant="quiet" icon={<IconPlus aria-hidden />} disabled={subjectOptions.length === 0} onClick={() => { const id = nid('fact'); draft('changes', id, { id, text: '', subject: cast[0] ? { kind: 'CHARACTER', characterId: cast[0].id } : { kind: 'PROP', name: '' } }); }}>Add a change</Button></div>
      </Field>

      <Field label="What someone learns" help="The planner keeps a character from acting on what they cannot know yet.">
        <ul className="ws-facts" role="list">
          {knowledge.map((k, i) => (
            <li key={k.id} className="ws-fact ws-fact-know">
              <Select className="ws-fact-who" aria-label={`Learning ${i + 1}: who learns it`} value={k.characterId} options={cast.map((c) => ({ value: c.id, label: c.name }))} onChange={(x) => update('knowledge', { ...k, characterId: x.target.value })} />
              <Input className="ws-fact-text" value={k.text} dir="auto" aria-label={`Learning ${i + 1}: what they learn`} placeholder="What they now know" autoFocus={unsaved('knowledge', k.id) && !k.text} onChange={(x) => update('knowledge', { ...k, text: x.target.value })} />
              <Select className="ws-fact-when" aria-label={`Learning ${i + 1}: from when`} value={k.atShotId ?? ''} options={when} onChange={(x) => update('knowledge', { ...k, atShotId: x.target.value || undefined })} />
              <Button variant="quiet" size="sm" className="ws-fact-x" aria-label={`Remove learning ${i + 1}`} icon={<IconDelete aria-hidden />} onClick={() => remove('knowledge', k.id)} />
              <Note kind="knowledge" id={k.id} />
            </li>
          ))}
        </ul>
        <div><Button size="sm" variant="quiet" icon={<IconPlus aria-hidden />} disabled={cast.length === 0} onClick={() => { const id = nid('fact'); draft('knowledge', id, { id, characterId: cast[0].id, text: '' }); }}>Add what someone learns</Button></div>
      </Field>
    </fieldset>
  );
}
