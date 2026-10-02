'use client';

import { useState } from 'react';
import type { Beat, Line, Production, Scene } from '@/domain/types';
import { TIMES_OF_DAY, type TimeOfDay } from '@/domain/vocabulary';
import { useStudio } from '@/studio/store';
import { nid } from '@/domain/actions';
import { castOf, worldOf } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { useDraft, useUnsavedGuard } from '@/lib/hooks';
import { Block } from '@/components/ui/cinema';
import { Button, Checkbox, Field, Input, Menu, MenuItem, Modal, Notice, Select, Status, Textarea } from '@/components/ui/kit';
import { JobButton } from '@/components/ui/jobs';
import { IconAuto, IconDelete, IconGenerate, IconManual, IconPlus } from '@/components/ui/icons';
import { words } from '@/lib/format';

/** STORY — the brief it started from, the synopsis, and the script: scenes, beats and lines. For a music video the
 *  song sits here too. Every edit is yours; the story engine drafts on request (Develop the story / Write the script). */
export function StoryTab({ p }: { p: Production }) {
  const T = useT();
  const { state, act } = useStudio();
  const toast = useToast();
  const cast = castOf(state, p); const world = worldOf(state, p);
  const { draft, patch, dirty, reset } = useDraft({ logline: p.logline, synopsis: p.synopsis, briefText: p.brief.text });
  useUnsavedGuard(dirty, T('shot.leave'));
  const save = () => { act('updateProduction', p.id, { logline: draft.logline, synopsis: draft.synopsis, brief: { ...p.brief, text: draft.briefText } }); toast.ok(T('toast.saved')); };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-8">
        <section aria-labelledby="synopsis">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="synopsis" className="h2">{T('label.synopsis')}</h2>
            <div className="flex items-center gap-2">
              {dirty && <Status tone="warn">{T('shot.unsaved')}</Status>}
              {dirty && <Button size="sm" variant="ghost" onClick={reset}>{T('btn.discard')}</Button>}
              <Button size="sm" variant={dirty ? 'primary' : 'secondary'} disabled={!dirty} onClick={save}>{dirty ? T('btn.save') : T('btn.saved')}</Button>
            </div>
          </div>
          <div className="space-y-4">
            <Field label={T('label.logline')}><Input value={draft.logline} onChange={(e) => patch({ logline: e.target.value })} /></Field>
            <Field label={T('label.synopsis')} help={T('story.writeHint')}><Textarea value={draft.synopsis} onChange={(e) => patch({ synopsis: e.target.value })} rows={6} /></Field>
          </div>
        </section>

        <Block title={T('story.script')} count={p.scenes.length} actions={<div className="flex flex-wrap items-center gap-2">
          <JobButton type="DEVELOP_STORY" payload={{ productionId: p.id }} target={{ productionId: p.id }} size="sm" icon={<IconAuto />} title={T('gen.writeStory.hint')} confirm={p.scenes.some((sc) => sc.beats.length > 0) ? undefined : undefined}>{T('gen.writeStory')}</JobButton>
          <JobButton type="WRITE_SCRIPT" payload={{ productionId: p.id }} target={{ productionId: p.id }} size="sm" icon={<IconGenerate />} disabled={p.scenes.length === 0} title={p.scenes.length === 0 ? T('empty.scenes') : undefined}>{T('gen.writeScript')}</JobButton>
          <AddScene p={p} /></div>}>
          {p.scenes.length === 0 ? <Notice tone="info">{T('empty.scenes')}</Notice> : (
            <ol className="space-y-6">{p.scenes.map((sc) => <SceneEditor key={sc.id} p={p} scene={sc} cast={cast.map((c) => ({ id: c.id, name: c.name }))} locations={world.map((l) => ({ id: l.id, name: l.name }))} />)}</ol>
          )}
          {p.scenes.length > 0 && p.stage === 'STORY' && <div className="mt-4"><Button size="sm" onClick={() => { act('markStepDone', p.id, 'STORY'); toast.ok(T('toast.saved')); }}>{T('btn.markDone')}</Button></div>}
        </Block>
      </div>

      <aside className="space-y-6">
        <section className="panel p-4">
          <h2 className="h3 mb-2 flex items-center gap-2">{p.brief.mode === 'AUTO_IDEA' ? <IconAuto className="size-4 text-accent-text" /> : <IconManual className="size-4 text-accent-text" />}{T('story.brief')}</h2>
          <p className="mb-2 text-xs text-muted">{p.brief.mode === 'AUTO_IDEA' ? `${T('story.autoIdea')}${p.brief.ideaTitle ? `: ${p.brief.ideaTitle}` : ''}` : T('story.manual')}</p>
          <Textarea value={draft.briefText} onChange={(e) => patch({ briefText: e.target.value })} rows={5} aria-label={T('story.brief')} />
        </section>
      </aside>
    </div>
  );
}

function AddScene({ p }: { p: Production }) {
  const T = useT(); const { state, act } = useStudio(); const toast = useToast();
  const world = worldOf(state, p);
  const [title, setTitle] = useState(''); const [loc, setLoc] = useState(''); const [tod, setTod] = useState<TimeOfDay>('MIDDAY');
  return (
    <Modal title={T('btn.addScene')} trigger={(open) => <Button size="sm" variant="primary" icon={<IconPlus />} onClick={open}>{T('btn.addScene')}</Button>}>
      {(close) => (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!title.trim()) return; act('addScene', p.id, { title, locationId: loc || undefined, timeOfDay: tod }); toast.ok(T('toast.created')); setTitle(''); close(); }}>
          <Field label={T('label.title')} required><Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={T('label.location')}><Select value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="—" options={world.map((l) => ({ value: l.id, label: l.name }))} /></Field>
            <Field label={T('label.timeOfDay')}><Select value={tod} onChange={(e) => setTod(e.target.value as TimeOfDay)} options={TIMES_OF_DAY.map((t) => ({ value: t, label: words(t) }))} /></Field>
          </div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={close}>{T('btn.cancel')}</Button><Button type="submit" variant="primary">{T('btn.add')}</Button></div>
        </form>
      )}
    </Modal>
  );
}

function SceneEditor({ p, scene, cast, locations }: { p: Production; scene: Scene; cast: Array<{ id: string; name: string }>; locations: Array<{ id: string; name: string }> }) {
  const T = useT(); const { act } = useStudio(); const toast = useToast();
  const set = (patch: Partial<Scene>) => act('updateScene', p.id, scene.id, patch);
  const setBeat = (id: string, patch: Partial<Beat>) => set({ beats: scene.beats.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  const setLine = (bid: string, lid: string, patch: Partial<Line>) => setBeat(bid, { lines: scene.beats.find((b) => b.id === bid)!.lines.map((l) => (l.id === lid ? { ...l, ...patch } : l)) });
  const nameOf = (id: string) => cast.find((c) => c.id === id)?.name ?? '?';
  return (
    <li className="panel p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="badge badge-accent">{T('label.scene')} {scene.number}</span>
        <Input value={scene.title} onChange={(e) => set({ title: e.target.value })} aria-label={`${T('label.scene')} ${scene.number} ${T('label.title')}`} className="min-w-0 flex-1 basis-40 font-medium" />
        <Select aria-label={T('label.location')} value={scene.locationId ?? ''} onChange={(e) => set({ locationId: e.target.value || undefined })} placeholder="—" options={locations.map((l) => ({ value: l.id, label: l.name }))} className="w-auto" />
        <Select aria-label={T('label.timeOfDay')} value={scene.timeOfDay} onChange={(e) => set({ timeOfDay: e.target.value as TimeOfDay })} options={TIMES_OF_DAY.map((t) => ({ value: t, label: words(t) }))} className="w-auto" />
        <Menu label={`${T('label.scene')} ${scene.number}`}><MenuItem icon={<IconDelete />} tone="danger" onClick={() => { if (window.confirm(`${T('btn.delete')} ${T('label.scene')} ${scene.number}?`)) { act('deleteScene', p.id, scene.id); toast.ok(T('toast.deleted')); } }}>{T('btn.delete')}</MenuItem></Menu>
      </div>
      <fieldset className="mb-4">
        <legend className="mb-1.5 text-xs font-medium text-muted">{T('story.present')}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">{cast.map((c) => <Checkbox key={c.id} label={c.name} checked={scene.characterIds.includes(c.id)} onChange={(e) => set({ characterIds: e.target.checked ? [...scene.characterIds, c.id] : scene.characterIds.filter((x) => x !== c.id) })} />)}{cast.length === 0 && <span className="text-xs text-faint">{T('empty.cast')}</span>}</div>
      </fieldset>
      <ol className="space-y-3">
        {scene.beats.map((b, bi) => (
          <li key={b.id} className="rounded-lg bg-surface-2 p-3">
            <div className="flex items-start gap-2">
              <span className="mono mt-2 text-faint">{bi + 1}</span>
              <Textarea value={b.action} onChange={(e) => setBeat(b.id, { action: e.target.value })} rows={2} aria-label={`${T('label.action')} ${scene.number}.${bi + 1}`} className="min-h-0 bg-elev" />
              <Button variant="ghost" size="xs" aria-label={`${T('btn.remove')} ${bi + 1}`} icon={<IconDelete />} onClick={() => set({ beats: scene.beats.filter((x) => x.id !== b.id) })} />
            </div>
            {b.lines.length > 0 && (
              <ul className="mt-2 space-y-1.5 ps-6">
                {b.lines.map((l) => (
                  <li key={l.id} className="grid gap-1.5 sm:grid-cols-[9rem_1fr_auto]">
                    <Select aria-label={T('label.role')} value={l.characterId} onChange={(e) => setLine(b.id, l.id, { characterId: e.target.value })} options={[...(scene.characterIds.length ? scene.characterIds : cast.map((c) => c.id)).map((id) => ({ value: id, label: nameOf(id) }))]} />
                    <div className="grid gap-1.5">
                      <Input value={l.text} onChange={(e) => setLine(b.id, l.id, { text: e.target.value })} placeholder={p.language === 'AR' ? 'English (for review)' : T('label.dialogue')} aria-label={T('label.dialogue')} />
                      {p.language === 'AR' && <Input value={l.textAr ?? ''} dir="rtl" onChange={(e) => setLine(b.id, l.id, { textAr: e.target.value })} placeholder="النص العربي" aria-label={`${T('label.dialogue')} (${T('label.arabic')})`} />}
                    </div>
                    <Button variant="ghost" size="xs" aria-label={T('btn.remove')} icon={<IconDelete />} onClick={() => setBeat(b.id, { lines: b.lines.filter((x) => x.id !== l.id) })} />
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 ps-6"><Button size="xs" variant="ghost" icon={<IconPlus />} disabled={cast.length === 0} onClick={() => setBeat(b.id, { lines: [...b.lines, { id: nid('line'), characterId: scene.characterIds[0] ?? cast[0]?.id ?? '', text: '' }] })}>{T('btn.addLine')}</Button></div>
          </li>
        ))}
      </ol>
      <div className="mt-3"><Button size="sm" icon={<IconPlus />} onClick={() => set({ beats: [...scene.beats, { id: nid('beat'), action: '', lines: [] }] })}>{T('btn.addBeat')}</Button></div>
    </li>
  );
}
