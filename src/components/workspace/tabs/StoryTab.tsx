'use client';

import { useState } from 'react';
import type { Beat, Line, Production, Scene } from '@/domain/types';
import { TIMES_OF_DAY, type TimeOfDay } from '@/domain/vocabulary';
import { useStudio } from '@/studio/store';
import { nid } from '@/domain/actions';
import { castOf, worldOf } from '@/studio/selectors';
import { useToast } from '@/components/ui/toast';
import { useDraft, useUnsavedGuard } from '@/lib/hooks';
import { Button, Checkbox, Field, Input, Menu, MenuItem, Modal, SectionHead, Select, StateWord, Textarea } from '@/components/ui/kit';
import { IconAuto, IconDelete, IconGenerate, IconPlus } from '@/components/ui/icons';
import { ApprovalGate, useGate } from '../Decide';
import { GenButton, type StudioGate } from '../gate';
import { vocab } from '../model';

/** STORY AND SCENE PLANNING (docs/DESIGN-SYSTEM-V5.md §8.10) — the logline and the synopsis, the brief the story
 *  started from, then the script by scene, beat and line. Each scene carries its settings (where, when, who is in it,
 *  what it is for). A line in an Arabic production is written in Arabic (Iraqi dialect when the production says so),
 *  isolated and right-to-left inside the English page, with its English beside it for review. The story engine drafts
 *  on request; every edit is the producer's. */
export function StoryTab({ p, gate }: { p: Production; gate: StudioGate }) {
  const { state, act } = useStudio();
  const toast = useToast();
  const cast = castOf(state, p); const world = worldOf(state, p);
  const dev = p.brief.development;
  const approved = useGate(p, 'STORY').approved;
  const { draft, patch, dirty, reset } = useDraft({ logline: p.logline, synopsis: p.synopsis, briefText: p.brief.text, hook: dev?.hook ?? '', ending: dev?.ending ?? '' });
  useUnsavedGuard(dirty, 'You have unsaved changes. Leave anyway?');
  // D23: the hook and the ending of an Auto Idea travel into every later prompt as the story's promise
  const save = () => { act('updateProduction', p.id, { logline: draft.logline, synopsis: draft.synopsis, brief: { ...p.brief, text: draft.briefText, ...(dev ? { development: { ...dev, hook: draft.hook.trim(), ending: draft.ending.trim() } } : {}) } }); toast.ok('Saved.'); };
  const origin = p.brief.mode === 'AUTO_IDEA' ? (p.brief.fromSampleProposal ? 'Started from Auto Idea (the written example)' : 'Started from Auto Idea') : 'Started from your brief';
  const lines = p.scenes.reduce((a, sc) => a + sc.beats.reduce((b, bt) => b + bt.lines.length, 0), 0);

  return (
    <div className="ws-main ws-story-pane">
      <div className="ws-pane-head">
        <h1 className="t-section">Story</h1>
        <span className="ws-pane-state">{approved === null ? null : approved ? <StateWord tone="done">You approved the story</StateWord> : <StateWord tone="waiting">Waits for your approval</StateWord>}</span>
      </div>
      <div className="ws-split">
        <div className="ws-split-main">
          <section className="ws-sec-tight" aria-labelledby="ws-syn-h">
            <SectionHead id="ws-syn-h" title="Logline and synopsis" level={2} action={<span className="ws-actions">
              {dirty && <Button size="sm" variant="quiet" onClick={reset}>Discard</Button>}
              <Button size="sm" variant={dirty ? 'primary' : 'secondary'} disabled={!dirty} onClick={save}>{dirty ? 'Save' : 'Saved'}</Button>
            </span>} />
            <div className="ws-form">
              <Field label="Logline"><Input value={draft.logline} onChange={(e) => patch({ logline: e.target.value })} dir="auto" /></Field>
              <Field label="Synopsis" help="Write the story in your own words, or let “Develop the story” draft it from the brief; every edit is yours."><Textarea value={draft.synopsis} onChange={(e) => patch({ synopsis: e.target.value })} rows={6} dir="auto" /></Field>
            </div>
          </section>

          <section className="ws-sec" aria-labelledby="ws-script-h">
            <SectionHead id="ws-script-h" title="Script" count={p.scenes.length || null} description={`${p.scenes.length} ${p.scenes.length === 1 ? 'scene' : 'scenes'} · ${lines} ${lines === 1 ? 'line' : 'lines'} of dialogue${p.language === 'AR' ? ' · in Arabic, with English for review' : ''}`} action={<AddScene p={p} />} />
            <div className="ws-gen-row">
              <GenButton gate={gate} engine="story" type="DEVELOP_STORY" payload={{ productionId: p.id }} target={{ productionId: p.id }} icon={<IconAuto aria-hidden />}>Develop the story</GenButton>
              <GenButton gate={gate} engine="story" type="WRITE_SCRIPT" payload={{ productionId: p.id }} target={{ productionId: p.id }} icon={<IconGenerate aria-hidden />} disabled={p.scenes.length === 0} reason="Add a scene first.">Write the script</GenButton>
            </div>
            {p.scenes.length === 0 ? <p className="t-body ws-empty">No scenes yet. Add one, or develop the story from the brief.</p> : (
              <ol className="ws-scenes" role="list">{p.scenes.map((sc) => <SceneEditor key={sc.id} p={p} scene={sc} cast={cast.map((c) => ({ id: c.id, name: c.name, nameAr: c.nameAr }))} locations={world.map((l) => ({ id: l.id, name: l.name }))} />)}</ol>
            )}
            {p.scenes.length > 0 && p.stage === 'STORY' && <div className="ws-gen-row"><Button size="sm" onClick={() => { act('markStepDone', p.id, 'STORY'); toast.ok('Saved.'); }}>Mark the story done</Button></div>}
          </section>
        </div>

        <aside className="ws-split-side" aria-labelledby="ws-brief-h">
          {p.scenes.length > 0 && <ApprovalGate p={p} stage="STORY" what="story" />}
          <div className="card ws-side-card">
            <h2 id="ws-brief-h" className="t-title">The brief</h2>
            <p className="t-meta">{origin}{p.brief.mode === 'AUTO_IDEA' && p.brief.ideaTitle ? `: ${p.brief.ideaTitle}` : ''}</p>
            <Textarea value={draft.briefText} onChange={(e) => patch({ briefText: e.target.value })} rows={5} aria-label="The brief" dir="auto" />
            {dev && (
              <>
                <p className="t-meta">The story’s promise: how it opens and how it ends. Every later step of the story keeps to it.</p>
                <Field label="The opening"><Textarea value={draft.hook} onChange={(e) => patch({ hook: e.target.value })} rows={3} dir="auto" /></Field>
                <Field label="The ending"><Textarea value={draft.ending} onChange={(e) => patch({ ending: e.target.value })} rows={3} dir="auto" /></Field>
              </>
            )}
            {dirty && <Button size="sm" variant="primary" onClick={save}>Save</Button>}
          </div>
        </aside>
      </div>
    </div>
  );
}

export function AddScene({ p }: { p: Production }) {
  const { state, act } = useStudio(); const toast = useToast();
  const world = worldOf(state, p);
  const [title, setTitle] = useState(''); const [loc, setLoc] = useState(''); const [tod, setTod] = useState<TimeOfDay>('MIDDAY');
  return (
    <Modal title="Add a scene" trigger={(open) => <Button size="sm" icon={<IconPlus aria-hidden />} onClick={open}>Add a scene</Button>}>
      {(close) => (
        <form className="ws-form" onSubmit={(e) => { e.preventDefault(); if (!title.trim()) return; act('addScene', p.id, { title, locationId: loc || undefined, timeOfDay: tod }); toast.ok('Scene added.'); setTitle(''); close(); }}>
          <Field label="Title" required><Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required dir="auto" /></Field>
          <div className="ws-form-grid">
            <Field label="Location"><Select value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="—" options={world.map((l) => ({ value: l.id, label: l.name }))} /></Field>
            <Field label="Time of day"><Select value={tod} onChange={(e) => setTod(e.target.value as TimeOfDay)} options={TIMES_OF_DAY.map((t) => ({ value: t, label: vocab(t) }))} /></Field>
          </div>
          <div className="ws-form-foot"><Button variant="quiet" onClick={close}>Cancel</Button><Button type="submit" variant="primary">Add</Button></div>
        </form>
      )}
    </Modal>
  );
}

type Person = { id: string; name: string; nameAr?: string };

/** One scene of the script: its settings, then its beats, each beat's action and its lines. */
export function SceneEditor({ p, scene, cast, locations }: { p: Production; scene: Scene; cast: Person[]; locations: Array<{ id: string; name: string }> }) {
  const { act } = useStudio(); const toast = useToast();
  const set = (patch: Partial<Scene>) => act('updateScene', p.id, scene.id, patch);
  const setBeat = (id: string, patch: Partial<Beat>) => set({ beats: scene.beats.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  const setLine = (bid: string, lid: string, patch: Partial<Line>) => setBeat(bid, { lines: scene.beats.find((b) => b.id === bid)!.lines.map((l) => (l.id === lid ? { ...l, ...patch } : l)) });
  const speakers = scene.characterIds.length ? cast.filter((c) => scene.characterIds.includes(c.id)) : cast;
  const arabic = p.language === 'AR';
  return (
    <li className="card ws-scene-card" aria-labelledby={`ws-sc-${scene.id}`}>
      <div className="ws-scene-card-head">
        <span id={`ws-sc-${scene.id}`} className="t-label">Scene {scene.number}</span>
        <Input value={scene.title} onChange={(e) => set({ title: e.target.value })} aria-label={`Scene ${scene.number} title`} dir="auto" className="ws-scene-title-input" />
        <Menu label={`Scene ${scene.number}: more`}><MenuItem icon={<IconDelete aria-hidden />} tone="danger" onClick={() => { if (window.confirm(`Delete scene ${scene.number}?`)) { act('deleteScene', p.id, scene.id); toast.ok('Deleted.'); } }}>Delete the scene</MenuItem></Menu>
      </div>
      <div className="ws-form-grid">
        <Field label="Location"><Select value={scene.locationId ?? ''} onChange={(e) => set({ locationId: e.target.value || undefined })} placeholder="—" options={locations.map((l) => ({ value: l.id, label: l.name }))} /></Field>
        <Field label="Time of day"><Select value={scene.timeOfDay} onChange={(e) => set({ timeOfDay: e.target.value as TimeOfDay })} options={TIMES_OF_DAY.map((t) => ({ value: t, label: vocab(t) }))} /></Field>
      </div>
      <div className="ws-scene-establish">
        <Checkbox label="Establish this place here" disabled={!scene.locationId} checked={Boolean(scene.establishLocation)} onChange={(e) => set({ establishLocation: e.target.checked })} />
        <span className="t-meta">{scene.locationId ? 'This scene is the place’s first appearance: its shots are filmed from the place’s description, and the first accepted take becomes its master plate.' : 'Choose the scene’s location first.'}</span>
      </div>
      <Field label="What the scene is for" help="The script writer and the shot planner read it."><Textarea value={scene.purpose ?? ''} onChange={(e) => set({ purpose: e.target.value })} rows={2} dir="auto" /></Field>
      <fieldset className="ws-fieldset">
        <legend className="t-label">In the scene</legend>
        <div className="ws-checks">{cast.map((c) => <Checkbox key={c.id} label={<bdi>{c.name}</bdi>} checked={scene.characterIds.includes(c.id)} onChange={(e) => set({ characterIds: e.target.checked ? [...scene.characterIds, c.id] : scene.characterIds.filter((x) => x !== c.id) })} />)}{cast.length === 0 && <span className="t-meta">No cast yet.</span>}</div>
      </fieldset>
      <ol className="ws-beats" role="list">
        {scene.beats.map((b, bi) => (
          <li key={b.id} className="ws-beat">
            <div className="ws-beat-head">
              <span className="ws-ro ws-beat-n">{scene.number}.{bi + 1}</span>
              <Textarea value={b.action} onChange={(e) => setBeat(b.id, { action: e.target.value })} rows={2} aria-label={`Beat ${scene.number}.${bi + 1}: what happens`} dir="auto" />
              <Button variant="quiet" size="sm" aria-label={`Remove beat ${scene.number}.${bi + 1}`} icon={<IconDelete aria-hidden />} onClick={() => set({ beats: scene.beats.filter((x) => x.id !== b.id) })} />
            </div>
            {b.lines.length > 0 && (
              <ul className="ws-lines" role="list">
                {b.lines.map((l) => {
                  const who = cast.find((c) => c.id === l.characterId);
                  return (
                    <li key={l.id} className="ws-line">
                      <Select aria-label="Who speaks" value={l.characterId} onChange={(e) => setLine(b.id, l.id, { characterId: e.target.value })} options={speakers.map((c) => ({ value: c.id, label: c.name }))} />
                      <div className="ws-line-texts">
                        {arabic && <Input value={l.textAr ?? ''} dir="rtl" lang="ar" onChange={(e) => setLine(b.id, l.id, { textAr: e.target.value })} placeholder="The line in Arabic" aria-label={`${who?.name ?? 'Line'}: the line in Arabic`} className="ws-line-ar" />}
                        <Input value={l.text} onChange={(e) => setLine(b.id, l.id, { text: e.target.value })} placeholder={arabic ? 'English, for review' : 'The line'} aria-label={`${who?.name ?? 'Line'}: ${arabic ? 'English, for review' : 'the line'}`} dir="auto" />
                      </div>
                      <Button variant="quiet" size="sm" aria-label="Remove the line" icon={<IconDelete aria-hidden />} onClick={() => setBeat(b.id, { lines: b.lines.filter((x) => x.id !== l.id) })} />
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="ws-beat-foot"><Button size="sm" variant="quiet" icon={<IconPlus aria-hidden />} disabled={cast.length === 0} onClick={() => setBeat(b.id, { lines: [...b.lines, { id: nid('line'), characterId: scene.characterIds[0] ?? cast[0]?.id ?? '', text: '' }] })}>Add a line</Button></div>
          </li>
        ))}
      </ol>
      <div><Button size="sm" icon={<IconPlus aria-hidden />} onClick={() => set({ beats: [...scene.beats, { id: nid('beat'), action: '', lines: [] }] })}>Add a beat</Button></div>
    </li>
  );
}
