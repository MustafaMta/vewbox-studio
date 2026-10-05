'use client';

import type { PersistentChange, Production, Scene, SceneStory } from '@/domain/types';
import { nid } from '@/domain/actions';
import { Button, Field, Input, Select } from '@/components/ui/kit';
import { IconDelete, IconPlus } from '@/components/ui/icons';

/** WHAT A SCENE CHANGES IN THE STORY (src/domain/types.ts SceneStory; cloud directive 2026-10-05 §4 "Story state"):
 *  the events it completes, what a character learns, the persistent changes to a person, a prop or the place, each
 *  taking effect at the end of the scene or at one of its shots. Every later shot's production context carries them
 *  (src/domain/production-context.ts) — the story's state lives in the studio, not in a model's memory. */

type Person = { id: string; name: string };
const at = (sc: Scene, shots: Production['shots']) => [{ value: '', label: 'From the end of the scene' }, ...shots.filter((s) => s.sceneId === sc.id).sort((a, b) => a.number - b.number).map((s) => ({ value: s.id, label: `From after shot ${sc.number}.${s.number}` }))];

export function SceneStoryEditor({ p, scene, cast, set }: { p: Production; scene: Scene; cast: Person[]; set: (patch: Partial<Scene>) => void }) {
  const story: SceneStory = scene.story ?? {};
  const put = (patch: Partial<SceneStory>) => set({ story: { ...story, ...patch } });
  const when = at(scene, p.shots);
  const subjectValue = (c: PersistentChange) => (c.subject.kind === 'CHARACTER' ? `c:${c.subject.characterId}` : c.subject.kind === 'LOCATION' ? 'place' : 'prop');
  const subjectOptions = [...cast.map((c) => ({ value: `c:${c.id}`, label: c.name })), ...(scene.locationId ? [{ value: 'place', label: 'The place' }] : []), { value: 'prop', label: 'A prop' }];
  const toSubject = (v: string, old?: PersistentChange['subject']): PersistentChange['subject'] => (v.startsWith('c:') ? { kind: 'CHARACTER', characterId: v.slice(2) } : v === 'place' && scene.locationId ? { kind: 'LOCATION', locationId: scene.locationId } : { kind: 'PROP', name: old?.kind === 'PROP' ? old.name : '' });
  const changes = story.changes ?? []; const events = story.events ?? []; const knowledge = story.knowledge ?? [];
  return (
    <fieldset className="ws-fieldset ws-scene-story">
      <legend className="t-label">What the scene changes</legend>
      <p className="t-meta">Kept by the studio and carried into every later shot: what happened, what someone now knows, and what stays changed.</p>

      <Field label="Events" help="What has happened once the scene is over.">
        <ul className="ws-lines" role="list">
          {events.map((e) => (
            <li key={e.id} className="ws-line">
              <Input value={e.text} dir="auto" aria-label="Event" onChange={(x) => put({ events: events.map((y) => (y.id === e.id ? { ...y, text: x.target.value } : y)) })} />
              <Button variant="quiet" size="sm" aria-label="Remove the event" icon={<IconDelete aria-hidden />} onClick={() => put({ events: events.filter((y) => y.id !== e.id) })} />
            </li>
          ))}
        </ul>
        <div><Button size="sm" variant="quiet" icon={<IconPlus aria-hidden />} onClick={() => put({ events: [...events, { id: nid('fact'), text: '' }] })}>Add an event</Button></div>
      </Field>

      <Field label="Persistent changes" help="A wound, wet clothes, a broken window, a cup left on the table — until a later scene changes it back.">
        <ul className="ws-lines" role="list">
          {changes.map((c) => (
            <li key={c.id} className="ws-line ws-story-change">
              <Select aria-label="Who or what changes" value={subjectValue(c)} options={subjectOptions} onChange={(x) => put({ changes: changes.map((y) => (y.id === c.id ? { ...y, subject: toSubject(x.target.value, y.subject) } : y)) })} />
              {c.subject.kind === 'PROP' && <Input value={c.subject.name} aria-label="Which prop" placeholder="Which prop" dir="auto" onChange={(x) => put({ changes: changes.map((y) => (y.id === c.id ? { ...y, subject: { kind: 'PROP', name: x.target.value } } : y)) })} />}
              <Input value={c.text} dir="auto" aria-label="The change" placeholder={c.cleared ? 'What ends (healed, dried, repaired)' : 'The change, as it should look'} onChange={(x) => put({ changes: changes.map((y) => (y.id === c.id ? { ...y, text: x.target.value } : y)) })} />
              <Select aria-label="From when" value={c.atShotId ?? ''} options={when} onChange={(x) => put({ changes: changes.map((y) => (y.id === c.id ? { ...y, atShotId: x.target.value || undefined } : y)) })} />
              <label className="ws-check"><input type="checkbox" checked={Boolean(c.cleared)} onChange={(x) => put({ changes: changes.map((y) => (y.id === c.id ? { ...y, cleared: x.target.checked || undefined } : y)) })} />Ends an earlier change</label>
              <Input value={c.key ?? ''} aria-label="Change key" placeholder="Key (e.g. arm), to replace or end it later" onChange={(x) => put({ changes: changes.map((y) => (y.id === c.id ? { ...y, key: x.target.value || undefined } : y)) })} />
              <Button variant="quiet" size="sm" aria-label="Remove the change" icon={<IconDelete aria-hidden />} onClick={() => put({ changes: changes.filter((y) => y.id !== c.id) })} />
            </li>
          ))}
        </ul>
        <div><Button size="sm" variant="quiet" icon={<IconPlus aria-hidden />} disabled={subjectOptions.length === 0} onClick={() => put({ changes: [...changes, { id: nid('fact'), text: '', subject: cast[0] ? { kind: 'CHARACTER', characterId: cast[0].id } : { kind: 'PROP', name: '' } }] })}>Add a change</Button></div>
      </Field>

      <Field label="What someone learns" help="The planner keeps a character from acting on what they cannot know yet.">
        <ul className="ws-lines" role="list">
          {knowledge.map((k) => (
            <li key={k.id} className="ws-line">
              <Select aria-label="Who learns it" value={k.characterId} options={cast.map((c) => ({ value: c.id, label: c.name }))} onChange={(x) => put({ knowledge: knowledge.map((y) => (y.id === k.id ? { ...y, characterId: x.target.value } : y)) })} />
              <Input value={k.text} dir="auto" aria-label="What they learn" onChange={(x) => put({ knowledge: knowledge.map((y) => (y.id === k.id ? { ...y, text: x.target.value } : y)) })} />
              <Select aria-label="From when" value={k.atShotId ?? ''} options={when} onChange={(x) => put({ knowledge: knowledge.map((y) => (y.id === k.id ? { ...y, atShotId: x.target.value || undefined } : y)) })} />
              <Button variant="quiet" size="sm" aria-label="Remove" icon={<IconDelete aria-hidden />} onClick={() => put({ knowledge: knowledge.filter((y) => y.id !== k.id) })} />
            </li>
          ))}
        </ul>
        <div><Button size="sm" variant="quiet" icon={<IconPlus aria-hidden />} disabled={cast.length === 0} onClick={() => put({ knowledge: [...knowledge, { id: nid('fact'), characterId: cast[0].id, text: '' }] })}>Add what someone learns</Button></div>
      </Field>
    </fieldset>
  );
}
