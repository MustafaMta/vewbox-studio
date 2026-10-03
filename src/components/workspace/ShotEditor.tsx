'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Production, Shot } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { assetById, assetSrc, castOf, locationById, primaryImageSrc, productionHref, seasonById, shotHref, shotLabel, showById } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { useDraft, useUnsavedGuard } from '@/lib/hooks';
import { Crumbs } from '@/components/ui/nav';
import { Button, ConfirmButton, Details, Input, LinkButton, Menu, MenuItem, Segmented, Status, Thumb } from '@/components/ui/kit';
import { JobButton } from '@/components/ui/jobs';
import { TakeProvenance } from './tabs/ProduceTab';
import { VideoPlaceholder, VideoPlayer } from '@/components/players/VideoPlayer';
import { ShotFields, type ShotDraft } from './ShotForm';
import { IconCheck, IconChevronLeft, IconChevronRight, IconDelete, IconDuplicate, IconFrame, IconTake } from '@/components/ui/icons';
import { fmtSeconds, ratioClass, words, ratioCss } from '@/lib/format';

/** THE SHOT EDITOR — one shot, full width: the picture large on the start side (the chosen take, or the opening
 *  frame), its takes and frames beneath; what happens in it on the end side. Save is explicit; leaving with edits asks. */
export function ShotEditor({ p, shot }: { p: Production; shot: Shot }) {
  const T = useT();
  const { state, act, addFile } = useStudio();
  const toast = useToast();
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  // a producer's own footage becomes a take like any other (provider UPLOAD), with the same usage consequences
  const uploadTake = async (file: File) => {
    setUploading(true);
    try {
      const r = await addFile(file, { label: `${shotLabel(p, shot)} — ${file.name}`, tags: ['take', 'upload'], expect: 'VIDEO' });
      if (!r.ok) { toast.bad(r.error); return; }
      act('addTake', p.id, shot.id, { assetId: r.asset.id, provider: 'UPLOAD', label: file.name.replace(/\.[^.]+$/, ''), width: r.asset.width, height: r.asset.height, durationSeconds: r.asset.durationSeconds, fps: r.asset.fps });
      toast.ok(T('take.uploaded'));
    } finally { setUploading(false); }
  };
  const base = productionHref(p);
  const idx = p.shots.findIndex((s) => s.id === shot.id);
  const prev = p.shots[idx - 1]; const next = p.shots[idx + 1];
  const scene = p.scenes.find((sc) => sc.id === shot.sceneId);
  const loc = locationById(state, scene?.locationId);
  const show = showById(state, p.showId); const season = seasonById(state, p.seasonId);
  const { draft, patch, dirty, reset } = useDraft<ShotDraft>({ sceneId: shot.sceneId, purpose: shot.purpose, action: shot.action, framing: shot.framing, cameraMove: shot.cameraMove, durationSeconds: shot.durationSeconds, characterIds: shot.characterIds, dialogue: shot.dialogue, transition: shot.transition, openingFrameAssetId: shot.openingFrameAssetId, endingFrameAssetId: shot.endingFrameAssetId, songWindow: shot.songWindow, notes: shot.notes });
  useUnsavedGuard(dirty, T('shot.leave'));
  const save = () => { act('updateShot', p.id, shot.id, draft); toast.ok(T('toast.saved')); };

  const [view, setView] = useState<'take' | 'frame'>(shot.selectedTakeId ? 'take' : 'frame');
  const [previewTake, setPreviewTake] = useState<string | null>(null);
  const shownTake = shot.takes.find((t) => t.id === (previewTake ?? shot.selectedTakeId));
  const takeAsset = assetById(state, shownTake?.assetId);
  const opening = assetById(state, shot.openingFrameAssetId); const ending = assetById(state, shot.endingFrameAssetId);
  const [frameSide, setFrameSide] = useState<'a' | 'b'>('a');
  const frameShown = frameSide === 'b' && ending ? ending : opening;
  const ratio = ratioClass(p.aspect);
  const vertical = p.aspect === 'VERTICAL_9_16';
  const cast = castOf(state, p).filter((c) => draft.characterIds.includes(c.id));

  const crumbs = [
    ...(p.kind === 'SHORT' ? [{ href: '/shorts', label: T('nav.shorts') }] : p.kind === 'MUSIC_VIDEO' ? [{ href: '/music-videos', label: T('nav.musicVideos') }] : [{ href: '/shows', label: T('nav.shows') }, ...(show ? [{ href: `/shows/${show.id}`, label: show.title }] : []), ...(season && show ? [{ href: `/shows/${show.id}/seasons/${season.id}`, label: `${T('kind.SEASON')} ${season.number}` }] : [])]),
    { href: `${base}?tab=storyboard`, label: p.title }, { label: `${T('label.shot')} ${shotLabel(p, shot)}` },
  ];

  return (
    <>
      <Crumbs items={crumbs} />
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="h1 font-latin">{T('label.shot')} {shotLabel(p, shot)}</h1>
          <span className="hidden text-sm text-muted sm:inline" dir="auto">{scene ? `${T('label.scene')} ${scene.number} · ${scene.title}` : ''}{loc ? ` · ${loc.name}` : ''}</span>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <Status tone="warn">{T('shot.unsaved')}</Status>}
          <LinkButton href={prev ? shotHref(p, prev.id) : '#'} aria-disabled={!prev} size="sm" variant="ghost" icon={<IconChevronLeft className="rtl:rotate-180" />} aria-label={T('shot.previous')} className={prev ? '' : 'pointer-events-none opacity-40'} />
          <LinkButton href={next ? shotHref(p, next.id) : '#'} aria-disabled={!next} size="sm" variant="ghost" icon={<IconChevronRight className="rtl:rotate-180" />} aria-label={T('shot.nextShot')} className={next ? '' : 'pointer-events-none opacity-40'} />
          <Menu label={T('nav.more')}>
            <MenuItem icon={<IconDuplicate />} onClick={() => { act('duplicateShot', p.id, shot.id); toast.ok(T('toast.created')); router.push(`${base}?tab=storyboard`); }}>{T('btn.duplicate')}</MenuItem>
            <MenuItem icon={<IconDelete />} tone="danger" onClick={() => { if (window.confirm(T('shot.deleteConfirm'))) { act('deleteShot', p.id, shot.id); toast.ok(T('toast.deleted')); router.push(`${base}?tab=storyboard`); } }}>{T('btn.delete')}</MenuItem>
          </Menu>
        </div>
      </header>

      <div className={`grid gap-8 ${vertical ? 'lg:grid-cols-[minmax(0,22rem)_1fr]' : 'lg:grid-cols-[minmax(0,1.3fr)_minmax(22rem,1fr)]'}`}>
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-2">
            <Segmented label={T('btn.view')} value={view} onChange={setView} options={[{ value: 'take', label: T('label.takes'), icon: <IconTake className="size-3.5" /> }, { value: 'frame', label: T('label.frames'), icon: <IconFrame className="size-3.5" /> }]} />
            {view === 'frame' && ending && <Segmented label={T('label.frames')} value={frameSide} onChange={setFrameSide} options={[{ value: 'a', label: T('shot.opening') }, { value: 'b', label: T('shot.ending') }]} size="sm" />}
          </div>
          {view === 'take' && takeAsset ? <VideoPlayer src={takeAsset.src} poster={takeAsset.poster} title={shownTake?.label} aspect={ratioCss(p.aspect)} className={vertical ? 'mx-auto max-w-[22rem]' : ''} />
            : view === 'take' ? <VideoPlaceholder ratio={ratioCss(p.aspect)} posterSrc={opening?.src} className={vertical ? 'mx-auto max-w-[22rem]' : ''} title={T('empty.takes')} hint={T('player.noTake.hint')} action={<JobButton type="GENERATE_TAKE" payload={{ productionId: p.id, shotId: shot.id }} target={{ productionId: p.id, shotId: shot.id }} size="sm" icon={<IconTake />}>{T('gen.take')}</JobButton>} />
            : <Thumb src={frameShown?.src} alt={frameSide === 'b' ? T('shot.ending') : T('shot.opening')} ratio={ratio} sample={frameShown?.sample} className="rounded-2xl" empty={T('board.noFrame')} />}

          <section aria-labelledby="takes">
            <div className="mb-2 flex items-center justify-between gap-2"><h2 id="takes" className="h3">{T('label.takes')}<span className="ms-2 text-sm font-normal text-faint num">{shot.takes.length}</span></h2><div className="flex items-center gap-2"><label className="btn btn-ghost btn-xs cursor-pointer" title={T('take.upload.hint')} aria-disabled={uploading}>{uploading ? '…' : T('take.upload')}<input type="file" accept="video/mp4,video/quicktime,video/webm" className="sr-only" aria-label={T('take.upload')} disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadTake(f); e.target.value = ''; }} /></label><JobButton type="GENERATE_TAKE" payload={{ productionId: p.id, shotId: shot.id }} target={{ productionId: p.id, shotId: shot.id }} size="xs" icon={<IconTake />}>{shot.takes.length ? T('gen.anotherTake') : T('gen.take')}</JobButton></div></div>
            {shot.takes.length === 0 ? <p className="text-sm text-muted">{T('produce.noTakes')}</p> : (
              <ul className="flex gap-3 overflow-x-auto pb-1" role="radiogroup" aria-label={T('label.takes')}>
                {shot.takes.map((t) => {
                  const a = assetById(state, t.assetId); const on = shot.selectedTakeId === t.id; const showing = (previewTake ?? shot.selectedTakeId) === t.id;
                  return (
                    <li key={t.id} className="w-32 flex-none sm:w-36">
                      <button type="button" role="radio" aria-checked={on} onClick={() => { setPreviewTake(t.id); setView('take'); }} className={`relative block w-full overflow-hidden rounded-lg border-2 transition ${on ? 'border-ok' : showing ? 'border-accent' : 'border-transparent hover:border-line-strong'}`} aria-label={`${t.label}${on ? ` (${T('btn.selected')})` : ''}`}>
                        <Thumb src={a?.poster ?? a?.src} alt="" ratio={ratio} className="rounded-none" />
                        {on && <span className="absolute end-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-ok text-white"><IconCheck className="size-3.5" /></span>}
                      </button>
                      <div className="mt-1 flex items-center justify-between gap-1 text-xs"><span className="font-medium">{t.label}</span>{on ? <span className="text-ok">{T('btn.selected')}</span> : <button type="button" className="font-medium text-accent-text hover:underline" onClick={() => { act('selectTake', p.id, shot.id, t.id); toast.ok(T('toast.takeSelected')); }}>{T('btn.select')}</button>}</div>
                      <Input value={t.note ?? ''} placeholder={T('label.notes')} aria-label={`${t.label} ${T('label.notes')}`} onChange={(e) => act('noteTake', p.id, shot.id, t.id, e.target.value)} className="mt-1 !h-7 text-xs" />
                      <div className="mt-1 flex flex-wrap gap-x-2 text-[11px]">
                        {t.status === 'REJECTED' ? <span className="text-bad" title={t.rejectionReason}>{T('gen.rejected')}</span> : <button type="button" className="text-faint hover:text-warn" onClick={() => { const why = window.prompt(T('gen.rejectReason'), ''); if (why !== null) act('rejectTake', p.id, shot.id, t.id, why.trim() || 'rejected by the producer'); }}>{T('gen.rejectTake')}</button>}
                        <button type="button" className="text-faint hover:text-bad" onClick={() => { if (window.confirm(`${T('btn.remove')} ${t.label}?`)) act('removeTake', p.id, shot.id, t.id); }}>{T('btn.remove')}</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="frames">
            <div className="mb-2 flex items-center justify-between gap-2"><h2 id="frames" className="h3">{T('label.frames')}</h2><JobButton type="SHOT_FRAMES" payload={{ productionId: p.id, shotId: shot.id, ending: true }} target={{ productionId: p.id, shotId: shot.id }} size="xs" icon={<IconFrame />}>{T('gen.frames')}</JobButton></div>
            <div className="flex gap-3">
              {[{ k: 'a' as const, a: opening, label: T('shot.opening') }, { k: 'b' as const, a: ending, label: T('shot.ending') }].map(({ k, a, label }) => (
                <button key={k} type="button" onClick={() => { setFrameSide(k); setView('frame'); }} className={`w-32 text-start sm:w-36 ${!a ? 'opacity-70' : ''}`}><Thumb src={a?.src} alt={label} ratio={ratio} className={`rounded-lg ${view === 'frame' && frameSide === k ? 'ring-2 ring-[var(--ring)]' : ''}`} empty="—" /><span className="mt-1 block text-xs text-muted">{label}</span></button>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="panel p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-2"><h2 className="h2">{T('shot.whatHappens')}</h2><span className="num text-xs text-muted">{fmtSeconds(draft.durationSeconds)} · {words(draft.framing)}</span></div>
            <ShotFields p={p} draft={draft} onChange={patch} showScene={p.scenes.length > 1} />
          </section>
          {shownTake && shownTake.provider !== 'SAMPLE' && <section className="panel p-4 sm:p-5"><TakeProvenance take={shownTake} /></section>}
          <Details summary={`${T('shot.references')} · ${cast.length + (loc ? 1 : 0)}`} open={cast.length > 0}>
            <div className="flex flex-wrap gap-3">
              {cast.map((c) => <Link key={c.id} href={`/characters/${c.id}`} className="w-20 text-center"><Thumb src={primaryImageSrc(state, c)} alt="" ratio="aspect-[4/5]" className="rounded-lg [&_img]:object-top" /><span className="mt-1 block truncate text-xs" dir="auto">{c.name}</span></Link>)}
              {loc && <Link href={`/locations/${loc.id}`} className="w-32 text-center"><Thumb src={assetSrc(state, loc.masterAssetId)} alt="" ratio="aspect-[4/5]" className="rounded-lg" /><span className="mt-1 block truncate text-xs" dir="auto">{loc.name}</span></Link>}
              {cast.length === 0 && !loc && <p className="text-sm text-muted">{T('empty.references')}</p>}
            </div>
          </Details>
        </div>
      </div>

      <div className={`sticky bottom-4 z-20 mt-8 flex items-center justify-between gap-3 rounded-xl border p-3 shadow-[var(--shadow-2)] backdrop-blur transition lg:bottom-4 ${dirty ? 'border-[color:var(--warn)] bg-elev/95' : 'border-line bg-elev/95'}`}>
        <Link href={`${base}?tab=storyboard`} className="text-sm text-muted hover:text-fg">← {T('shot.backToBoard')}</Link>
        <div className="flex items-center gap-2">
          {dirty && <Button variant="ghost" onClick={reset}>{T('btn.discard')}</Button>}
          <Button variant="primary" disabled={!dirty} onClick={save}>{dirty ? T('btn.save') : T('btn.saved')}</Button>
          {!dirty && <ConfirmButton variant="ghost" label="" icon={<IconDelete />} aria-label={T('btn.delete')} title={T('shot.deleteConfirm')} onConfirm={() => { act('deleteShot', p.id, shot.id); toast.ok(T('toast.deleted')); router.push(`${base}?tab=storyboard`); }} />}
        </div>
      </div>
    </>
  );
}
