'use client';

import { WorldBiblePanel } from '../WorldBible';
import Link from 'next/link';
import type { Production } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { artVars } from '@/studio/presentation';
import { assetById, castOf, worldOf } from '@/studio/selectors';
import { useToast } from '@/components/ui/toast';
import { useDraft, useUnsavedGuard } from '@/lib/hooks';
import { Button, ChoiceCards, Field, Input, SectionHead, Textarea } from '@/components/ui/kit';
import { Frame } from '@/components/media/Frame';
import { Picker } from '@/components/library/CanonPicker';
import { IconAuto, IconGenerate, IconMusicVideos, IconStory, IconVersions } from '@/components/ui/icons';
import { GenButton, type StudioGate } from '../gate';
import { AddScene, SceneEditor } from './StoryTab';

/** VISUAL STORY — how the song is seen: a performance, a story under it, or both; then the idea in words, the scenes
 *  that map onto the song's sections (developed and scripted by the story engine, or written by hand), and where it
 *  happens. */
export function VisualStoryTab({ p, gate }: { p: Production; gate: StudioGate }) {
  const { state, act } = useStudio();
  const toast = useToast();
  const world = worldOf(state, p);
  const cast = castOf(state, p);
  const { draft, patch, dirty, reset } = useDraft({ logline: p.logline, synopsis: p.synopsis, mood: p.mood ?? '', genre: p.genre ?? '' });
  useUnsavedGuard(dirty, 'You have unsaved changes. Leave anyway?');
  return (
    <div className="ws-main">
      <div className="ws-pane-head"><h1 className="t-section">Visual story</h1></div>
      <div className="ws-split">
        <div className="ws-split-main">
          <section className="ws-sec-tight" aria-labelledby="ws-treat-h">
            <SectionHead id="ws-treat-h" title="Treatment" description="How the song is seen: the performer on camera, a story under the song, or both." />
            <ChoiceCards name="concept" columns={3} value={p.concept ?? 'PERFORMANCE'} onChange={(v) => { act('updateProduction', p.id, { concept: v }); toast.ok('Saved.'); }} options={[
              { value: 'PERFORMANCE', label: 'Performance', hint: 'The singer on camera, in the location, for the whole song.', icon: <IconMusicVideos /> },
              { value: 'NARRATIVE', label: 'Narrative', hint: 'A story told under the song; the singer may never appear.', icon: <IconStory /> },
              { value: 'MIXED', label: 'Mixed', hint: 'Performance cut with story; the chorus returns to the singer.', icon: <IconVersions /> },
            ]} />
          </section>
          <section className="ws-sec" aria-labelledby="ws-vsyn-h">
            <SectionHead id="ws-vsyn-h" title="Logline and synopsis" action={<span className="ws-actions">{dirty && <Button size="sm" variant="quiet" onClick={reset}>Discard</Button>}<Button size="sm" variant={dirty ? 'primary' : 'secondary'} disabled={!dirty} onClick={() => { act('updateProduction', p.id, { logline: draft.logline, synopsis: draft.synopsis, mood: draft.mood || undefined, genre: draft.genre || undefined }); toast.ok('Saved.'); }}>{dirty ? 'Save' : 'Saved'}</Button></span>} />
            <div className="ws-form">
              <Field label="Logline"><Input value={draft.logline} onChange={(e) => patch({ logline: e.target.value })} dir="auto" /></Field>
              <Field label="Synopsis"><Textarea value={draft.synopsis} onChange={(e) => patch({ synopsis: e.target.value })} rows={5} dir="auto" /></Field>
              <div className="ws-form-grid">
                <Field label="Genre"><Input value={draft.genre} onChange={(e) => patch({ genre: e.target.value })} placeholder="Ballad" /></Field>
                <Field label="Mood"><Input value={draft.mood} onChange={(e) => patch({ mood: e.target.value })} placeholder="Dusk, warm, unhurried" /></Field>
              </div>
            </div>
          </section>
          <section className="ws-sec" aria-labelledby="ws-vscript-h">
            <SectionHead id="ws-vscript-h" title="Script" count={p.scenes.length || null} action={<AddScene p={p} />} />
            <div className="ws-gen-row">
              <GenButton gate={gate} engine="story" type="DEVELOP_STORY" payload={{ productionId: p.id }} target={{ productionId: p.id }} icon={<IconAuto aria-hidden />}>Develop the story</GenButton>
              <GenButton gate={gate} engine="story" type="WRITE_SCRIPT" payload={{ productionId: p.id }} target={{ productionId: p.id }} icon={<IconGenerate aria-hidden />} disabled={p.scenes.length === 0} reason="Add a scene first.">Write the script</GenButton>
            </div>
            {p.scenes.length === 0 ? <p className="t-body ws-empty">No scenes yet.</p> : (
              <ol className="ws-scenes" role="list">{p.scenes.map((sc) => <SceneEditor key={sc.id} p={p} scene={sc} cast={cast.map((c) => ({ id: c.id, name: c.name, nameAr: c.nameAr }))} locations={world.map((l) => ({ id: l.id, name: l.name }))} />)}</ol>
            )}
            {p.scenes.length > 0 && p.stage === 'STORY' && <div className="ws-gen-row"><Button size="sm" onClick={() => { act('markStepDone', p.id, 'STORY'); toast.ok('Saved.'); }}>Mark the story done</Button></div>}
          </section>
        </div>
        <aside className="ws-split-side" aria-labelledby="ws-vloc-h">
          <SectionHead id="ws-vloc-h" title="Locations" level={3} count={world.length || null} action={<Picker kind="locations" style={p.style} selected={p.locationIds} onChange={(ids) => { act('updateProduction', p.id, { locationIds: ids }); toast.ok('Saved.'); }} />} />
          {world.length === 0 ? <p className="t-body ws-empty">No locations chosen yet.</p> : (
            <ul className="ws-plates" role="list">{world.map((l) => { const a = assetById(state, l.masterAssetId); return <li key={l.id}><Link href={`/locations/${l.id}`} className="ws-plate"><Frame asset={a} ratio="16/9" fit="cover" alt="" decorative art={artVars(a)} title={l.name} /><span className="ws-plate-name name"><bdi>{l.name}</bdi></span></Link></li>; })}</ul>
          )}
        </aside>
      </div>
      <WorldBiblePanel p={p} />
    </div>
  );
}
