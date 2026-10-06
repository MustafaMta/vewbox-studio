'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ContinuityState, Production, Shot, ShotMotion } from '@/domain/types';
import { productionContextFor } from '@/domain/production-context';
import { useStudio } from '@/studio/store';
import { shotLabel } from '@/studio/selectors';
import { useToast } from '@/components/ui/toast';
import { Button, Checkbox, Field, Input, Segmented, Select, StateWord } from '@/components/ui/kit';

/** THE SHOT'S PRODUCTION CONTEXT on the shot page (cloud directive 2026-10-05 §4): the state of each person in the
 *  shot, kept by the studio and edited here (condition, emotion, how they start and end, which way they move), and
 *  the context the next take will be made from — what carries over from the shot before, the place as the story left
 *  it, what the people know, the constraints, the re-anchoring, and any gap the studio will not fill in by itself.
 *  Computed from the saved records by the same pure function the worker uses (src/domain/production-context.ts). */

type Person = ContinuityState['characters'][number];
const MOTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: 'Not set' }, { value: 'STILL', label: 'Still' }, { value: 'LEFT_TO_RIGHT', label: 'Left to right' }, { value: 'RIGHT_TO_LEFT', label: 'Right to left' },
  { value: 'TOWARD_CAMERA', label: 'Toward the camera' }, { value: 'AWAY_FROM_CAMERA', label: 'Away from the camera' },
];

/** A person's state with nothing empty in it: '' and an unset direction are the same as absent (QA m1). */
const clean = (x: Person): Person => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, w]) => w !== '' && w !== undefined)) : v]).filter(([, v]) => v !== '' && v !== undefined && !(Array.isArray(v) && v.length === 0) && !(typeof v === 'object' && v && !Array.isArray(v) && Object.keys(v).length === 0))) as unknown as Person;
const same = (a: Record<string, Person>, b: Record<string, Person>) => JSON.stringify(Object.keys(a).sort().map((k) => [k, clean(a[k])])) === JSON.stringify(Object.keys(b).sort().map((k) => [k, clean(b[k])]));

export function ShotContext({ p, shot, onDirty }: { p: Production; shot: Shot; /** the inspector counts these edits as unsaved (its guard and its footer) */ onDirty?: (dirty: boolean) => void }) {
  const { state, act } = useStudio();
  const toast = useToast();
  const people = shot.characterIds.map((id) => state.characters.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const initial = useMemo(() => Object.fromEntries(people.map((c) => [c.id, { ...(shot.continuity?.characters.find((x) => x.characterId === c.id) ?? { characterId: c.id }) }])) as Record<string, Person>, [shot.continuity, people]);
  const [draft, setDraft] = useState<Record<string, Person>>(initial);
  // the camera crossing the 180° line on purpose (camera.crossesLine): the log then does not flag the swapped sides
  const lineInitial = Boolean(shot.continuity?.camera?.crossesLine);
  const [crosses, setCrosses] = useState(lineInitial);
  const dirty = !same(draft, initial) || crosses !== lineInitial;
  useEffect(() => { onDirty?.(dirty); }, [dirty, onDirty]);
  useEffect(() => () => onDirty?.(false), [onDirty]);
  const set = (id: string, patch: Partial<Person>) => setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  const save = () => {
    const base = shot.continuity ?? { version: 0, characters: [], props: [], environment: {}, camera: {} };
    const others = base.characters.filter((x) => !shot.characterIds.includes(x.characterId));
    if (!dirty) return; // a save with nothing changed would only move the continuity's version on (QA m1)
    const { version: _v, ...rest } = base;
    try { act('setShotContinuity', p.id, shot.id, { ...rest, camera: { ...(rest.camera ?? {}), crossesLine: crosses || undefined }, characters: [...others, ...shot.characterIds.map((id) => clean(draft[id] ?? { characterId: id }))] }); toast.ok('The people’s state is saved.'); } catch (e) { toast.bad((e as Error).message); }
  };
  const ctx = useMemo(() => productionContextFor(state, p, shot), [state, p, shot]);
  const name = (id: string) => state.characters.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="ws-context">
      {people.length === 0 ? <p className="t-meta">Nobody is in this shot.</p> : people.map((c) => {
        const x = draft[c.id] ?? { characterId: c.id };
        const carried = ctx.characters.find((k) => k.characterId === c.id);
        return (
          <fieldset key={c.id} className="ws-fieldset ws-context-person">
            <legend className="t-label"><bdi>{c.name}</bdi></legend>
            <Field label="Condition" help={carried?.condition.filter((k) => k.source.kind !== 'SHOT').length ? `Carried from the story: ${carried.condition.filter((k) => k.source.kind !== 'SHOT').map((k) => k.text).join('; ')}` : 'What must show and persist: wet, injured, out of breath'}>
              <Input value={x.condition ?? ''} onChange={(e) => set(c.id, { condition: e.target.value })} dir="auto" placeholder="Not set" />
            </Field>
            <Field label="Emotion"><Input value={x.emotion ?? ''} onChange={(e) => set(c.id, { emotion: e.target.value })} dir="auto" placeholder={carried?.emotion && !x.emotion ? `${carried.emotion} (from the shot before)` : 'Not set'} /></Field>
            <Field label="Starts" help={carried?.startPose?.source.kind === 'PREVIOUS_SHOT' && !x.startPose ? `As the shot before ended: ${carried.startPose.text}` : undefined}>
              <Input value={x.startPose ?? ''} onChange={(e) => set(c.id, { startPose: e.target.value })} dir="auto" placeholder="Where and how they are at the first frame" />
            </Field>
            <Field label="Ends" help="A continuous next shot starts from this."><Input value={x.endPose ?? ''} onChange={(e) => set(c.id, { endPose: e.target.value })} dir="auto" placeholder="Where and how they are at the last frame" /></Field>
            <Field label="Side of frame" help="Where they stand on screen. Across a cut, people keep their sides unless the camera crosses the line.">
              <Segmented<string> label={`: side of frame`} size="sm" value={x.frameSide ?? ''} onChange={(v) => set(c.id, { frameSide: (v || undefined) as Person['frameSide'] })} options={[{ value: '', label: 'Not set' }, { value: 'LEFT', label: 'Left' }, { value: 'CENTER', label: 'Centre' }, { value: 'RIGHT', label: 'Right' }]} />
            </Field>
            <Field label="Moves">
              <Select value={x.motion?.direction ?? ''} options={MOTIONS} onChange={(e) => set(c.id, { motion: { ...(x.motion ?? {}), direction: (e.target.value || undefined) as ShotMotion['direction'] } })} aria-label={`${c.name} moves`} />
            </Field>
            {people.length > 1 && (
              <Field label="With">
                <div className="ws-ref-chips">
                  {people.filter((o) => o.id !== c.id).map((o) => {
                    const on = (x.interactingWith ?? []).includes(o.id);
                    return <button key={o.id} type="button" className="chip" aria-pressed={on} onClick={() => set(c.id, { interactingWith: on ? (x.interactingWith ?? []).filter((y) => y !== o.id) : [...(x.interactingWith ?? []), o.id] })}><bdi>{o.name}</bdi></button>;
                  })}
                </div>
              </Field>
            )}
          </fieldset>
        );
      })}
      {people.length > 1 && <Checkbox label="This shot crosses the line" help="The camera moves to the other side of the action on purpose, so left and right swap. The continuity log stops flagging the swap." checked={crosses} onChange={(e) => setCrosses(e.target.checked)} />}
      {people.length > 0 && <div className="ws-actions"><Button size="sm" variant="primary" disabled={!dirty} onClick={save}>Save the people’s state</Button>{dirty && <Button size="sm" variant="quiet" onClick={() => { setDraft(initial); setCrosses(lineInitial); }}>Discard</Button>}</div>}

      <div className="ws-context-next">
        <span className="t-label">What the next take is made from</span>
        <dl className="ws-dl">
          <div><dt className="t-label">Join</dt><dd>{ctx.shot.boundary === 'continuous' ? `continues shot ${(() => { const prev = ctx.shot.previous ? p.shots.find((s) => s.id === ctx.shot.previous!.shotId) : undefined; return prev ? shotLabel(p, prev) : ''; })()}${ctx.shot.previous?.takeId ? '' : ' (no chosen take yet)'}` : ctx.shot.boundary === 'cut' ? 'a new camera on the same moment' : 'a new place or time'}</dd></div>
          {ctx.location && <div><dt className="t-label">Place</dt><dd dir="auto"><bdi>{ctx.location.name}</bdi> · identity v{ctx.location.identity.version}{ctx.location.changes.length ? ` · as the story left it: ${ctx.location.changes.map((k) => k.text).join('; ')}` : ''}</dd></div>}
          {ctx.story.sceneObjective && <div><dt className="t-label">Scene objective</dt><dd dir="auto">{ctx.story.sceneObjective}</dd></div>}
          {ctx.story.eventsCompleted.length > 0 && <div><dt className="t-label">Already happened</dt><dd dir="auto">{ctx.story.eventsCompleted.slice(-3).map((e) => e.text).join(' · ')}{ctx.story.eventsCompleted.length > 3 ? ` (+${ctx.story.eventsCompleted.length - 3} earlier)` : ''}</dd></div>}
          {Object.entries(ctx.story.knowledge).map(([id, ks]) => <div key={id}><dt className="t-label"><bdi>{name(id)}</bdi> knows</dt><dd dir="auto">{ks.map((k) => k.text).join('; ')}</dd></div>)}
          {ctx.shot.constraints.length > 0 && <div><dt className="t-label">Must hold</dt><dd dir="auto">{ctx.shot.constraints.join('; ')}</dd></div>}
          {ctx.shot.dialogue.length > 0 && <div><dt className="t-label">Lines</dt><dd>{ctx.shot.dialogue.map((d) => `${d.durationSeconds?.toFixed(1) ?? '?'} s ${d.source === 'RECORDED' ? 'recorded' : 'estimated'}`).join(' · ')}</dd></div>}
          {ctx.anchoring.chainLength > 1 && <div><dt className="t-label">Continuous chain</dt><dd>{ctx.anchoring.chainLength} shots in a row{ctx.anchoring.reanchor ? ' · re-anchors on the characters’ own images (shortest guide)' : ''}</dd></div>}
        </dl>
        {ctx.gaps.length > 0 && (
          <ul className="ws-files" role="list" aria-label="Not stated yet">
            {ctx.gaps.map((g) => <li key={g}><span className="ws-file-words"><span className="t-meta" dir="auto">{g}</span></span><StateWord tone="idle">Not stated</StateWord></li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
