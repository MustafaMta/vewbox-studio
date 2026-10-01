'use client';

import Link from 'next/link';
import type { Production } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { assetSrc, worldOf } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { useDraft, useUnsavedGuard } from '@/lib/hooks';
import { Button, ChoiceCards, Field, Input, Status, Textarea } from '@/components/ui/kit';
import { Art, Block } from '@/components/ui/cinema';
import { Picker } from '@/components/library/CanonPicker';
import { IconMusicVideos, IconStory, IconVersions } from '@/components/ui/icons';

/** VISUAL STORY — how the song is seen: a performance, a story under it, or both; then the idea in words, and
 *  where it happens. */
export function VisualStoryTab({ p }: { p: Production }) {
  const T = useT();
  const { state, act } = useStudio();
  const toast = useToast();
  const world = worldOf(state, p);
  const { draft, patch, dirty, reset } = useDraft({ logline: p.logline, synopsis: p.synopsis, mood: p.mood ?? '', genre: p.genre ?? '' });
  useUnsavedGuard(dirty, T('shot.leave'));
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-8">
        <Block title={T('wizard.concept')} description={T('mv.visual.hint')}>
          <ChoiceCards name="concept" columns={3} value={p.concept ?? 'PERFORMANCE'} onChange={(v) => { act('updateProduction', p.id, { concept: v }); toast.ok(T('toast.saved')); }} options={[
            { value: 'PERFORMANCE', label: T('mv.concept.PERFORMANCE'), hint: T('mv.concept.PERFORMANCE.hint'), icon: <IconMusicVideos /> },
            { value: 'NARRATIVE', label: T('mv.concept.NARRATIVE'), hint: T('mv.concept.NARRATIVE.hint'), icon: <IconStory /> },
            { value: 'MIXED', label: T('mv.concept.MIXED'), hint: T('mv.concept.MIXED.hint'), icon: <IconVersions /> },
          ]} />
        </Block>
        <Block title={T('label.synopsis')} actions={<div className="flex items-center gap-2">{dirty && <Status tone="warn">{T('shot.unsaved')}</Status>}{dirty && <Button size="sm" variant="ghost" onClick={reset}>{T('btn.discard')}</Button>}<Button size="sm" variant={dirty ? 'primary' : 'secondary'} disabled={!dirty} onClick={() => { act('updateProduction', p.id, { logline: draft.logline, synopsis: draft.synopsis, mood: draft.mood || undefined, genre: draft.genre || undefined }); toast.ok(T('toast.saved')); }}>{dirty ? T('btn.save') : T('btn.saved')}</Button></div>}>
          <div className="space-y-4">
            <Field label={T('label.logline')}><Input value={draft.logline} onChange={(e) => patch({ logline: e.target.value })} /></Field>
            <Field label={T('label.synopsis')}><Textarea value={draft.synopsis} onChange={(e) => patch({ synopsis: e.target.value })} rows={5} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={T('label.genre')}><Input value={draft.genre} onChange={(e) => patch({ genre: e.target.value })} placeholder="Ballad" /></Field>
              <Field label="Mood"><Input value={draft.mood} onChange={(e) => patch({ mood: e.target.value })} placeholder="Dusk, warm, unhurried" /></Field>
            </div>
          </div>
        </Block>
      </div>
      <aside>
        <Block title={T('tab.locations')} count={world.length} actions={<Picker kind="locations" style={p.style} selected={p.locationIds} onChange={(ids) => { act('updateProduction', p.id, { locationIds: ids }); toast.ok(T('toast.saved')); }} />}>
          {world.length === 0 ? <p className="text-sm text-muted">{T('empty.locationsIn')}</p> : (
            <ul className="space-y-3">{world.map((l) => <li key={l.id}><Link href={`/locations/${l.id}`} className="poster-link block"><Art src={assetSrc(state, l.masterAssetId)} ratio="wide" title={l.name} /><span className="mt-1.5 block truncate text-sm" dir="auto">{l.name}</span></Link></li>)}</ul>
          )}
        </Block>
      </aside>
    </div>
  );
}
