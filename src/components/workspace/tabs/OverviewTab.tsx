'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Production } from '@/domain/types';
import { ASPECTS, DIALECTS, LANGUAGES, STYLES } from '@/domain/vocabulary';
import { useStudio } from '@/demo/store';
import { deleteProduction, duplicateProduction, markStepDone, updateProduction } from '@/demo/actions';
import { assetById, assetSrc, castOf, nextStep, productionHref, progressOf, shotHref, worldOf } from '@/demo/selectors';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { Button, ConfirmDelete, Field, Input, KV, Modal, Select, Textarea } from '@/components/ui/kit';
import { Art, Block } from '@/components/ui/cinema';
import { IconDelete, IconDuplicate, IconEdit } from '@/components/ui/icons';
import { aspectLabel, dialectLabel, fmtAgo, fmtSeconds } from '@/lib/format';

/** OVERVIEW — the state of the production in four numbers that are links, the first shots as a strip, who is in it,
 *  and the details behind Edit. The header above already carries the art and the synopsis. */
export function OverviewTab({ p }: { p: Production }) {
  const T = useT();
  const { state, update } = useStudio();
  const toast = useToast();
  const router = useRouter();
  const pr = progressOf(p);
  const cast = castOf(state, p); const world = worldOf(state, p);
  const next = nextStep(p);
  const base = productionHref(p);
  const isMusic = p.kind === 'MUSIC_VIDEO';
  const tabOf = (t: string) => (isMusic ? (t === 'story' ? 'song' : t === 'cast' ? 'performers' : t) : t === 'cast' ? 'characters' : t);
  const firstShots = p.shots.slice(0, 6);
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-10">
        <section>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[[T('label.scenes'), pr.scenes, 'story'], [T('label.shots'), pr.shots, 'storyboard'], [T('label.frames'), `${pr.framed}/${pr.shots}`, 'storyboard'], [T('label.takes'), `${pr.chosen}/${pr.shots}`, 'produce']].map(([k, v, tab]) => (
              <Link key={String(k)} href={`${base}?tab=${tabOf(String(tab))}`} className="panel px-4 py-3 transition hover:border-line-strong hover:bg-raised-2"><dt className="text-xs text-muted">{k}</dt><dd className="display mt-1 text-2xl">{v}</dd></Link>
            ))}
          </dl>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link href={`${base}?tab=${tabOf(next.tab)}`} className="btn btn-primary btn-sm">{T.dyn(next.key)}</Link>
            {p.stage !== 'COMPLETE' && <Button size="sm" variant="ghost" onClick={() => { update((s) => markStepDone(s, p.id, p.stage)); toast.ok(T('toast.saved')); }}>{T('btn.markDone')}: {T.dyn(`stage.${p.stage}`)}</Button>}
            <span className="text-sm text-muted">{T('label.runtime')}: <span className="num text-fg">{fmtSeconds(pr.runtime)}</span> {T('misc.of')} {fmtSeconds(p.targetSeconds)} · {T('label.updated')} {fmtAgo(p.updatedAt, T.locale)}</span>
          </div>
        </section>
        {firstShots.length > 0 && (
          <Block title={T('tab.storyboard')} count={pr.shots} actions={<Link href={`${base}?tab=storyboard`} className="text-sm text-muted hover:text-fg">{T('btn.open')} →</Link>}>
            <ul className="filmstrip -mx-4 px-4 sm:mx-0 sm:px-0">{firstShots.map((sh) => { const f = assetById(state, sh.openingFrameAssetId); return <li key={sh.id} className="w-40 sm:w-52"><Link href={shotHref(p, sh.id)} className="poster-link block"><Art src={f?.src} ratio={p.aspect === 'VERTICAL_9_16' ? 'vertical' : 'wide'} title={sh.purpose} sample={f?.sample} className="!rounded-lg" /><span className="mt-1.5 block truncate text-xs text-muted" dir="auto">{sh.purpose || sh.action}</span></Link></li>; })}</ul>
            <div className="strip-rail mt-1" aria-hidden />
          </Block>
        )}
        {p.synopsis && <Block title={T('label.synopsis')}><p className="max-w-3xl text-[0.95rem] leading-relaxed text-muted" dir="auto">{p.synopsis}</p></Block>}
      </div>
      <aside className="space-y-8">
        <Block title={isMusic ? T('tab.performers') : T('tab.characters')} count={cast.length} actions={<Link href={`${base}?tab=${tabOf('cast')}`} className="text-sm text-muted hover:text-fg">{T('btn.edit')}</Link>}>
          {cast.length === 0 ? <p className="text-sm text-muted">{T('empty.cast')}</p> : <ul className="grid grid-cols-3 gap-3">{cast.slice(0, 6).map((c) => <li key={c.id}><Link href={`/characters/${c.id}`} className="poster-link block"><Art src={assetSrc(state, c.portraitAssetId)} ratio="portrait" title={c.name} className="!rounded-lg" /><span className="mt-1.5 block truncate text-xs" dir="auto">{c.name}</span></Link></li>)}</ul>}
        </Block>
        <Block title={T('tab.locations')} count={world.length} actions={<Link href={`${base}?tab=${isMusic ? 'visual' : 'locations'}`} className="text-sm text-muted hover:text-fg">{T('btn.edit')}</Link>}>
          {world.length === 0 ? <p className="text-sm text-muted">{T('empty.locationsIn')}</p> : <ul className="grid grid-cols-2 gap-3">{world.slice(0, 4).map((l) => <li key={l.id}><Link href={`/locations/${l.id}`} className="poster-link block"><Art src={assetSrc(state, l.masterAssetId)} ratio="wide" title={l.name} className="!rounded-lg" /><span className="mt-1.5 block truncate text-xs" dir="auto">{l.name}</span></Link></li>)}</ul>}
        </Block>
        <KV rows={[[T('label.style'), T.dyn(`style.${p.style}`)], [T('label.language'), `${p.language}${p.dialect ? ` · ${dialectLabel(p.dialect, T.locale)}` : ''}`], [T('label.aspect'), aspectLabel(p.aspect)], [T('label.target'), fmtSeconds(p.targetSeconds)], [T('label.created'), fmtAgo(p.createdAt, T.locale)]]} />
        <div className="flex flex-wrap items-center gap-2">
          <EditDetails p={p} />
          <Button size="sm" icon={<IconDuplicate />} onClick={() => { let href = base; update((s) => { const r = duplicateProduction(s, p.id); if (r.production) href = productionHref(r.production); return r.state; }); toast.ok(T('toast.created')); router.push(href); }}>{T('btn.duplicate')}</Button>
          <ConfirmDelete title={p.title} onDelete={() => { const back = p.kind === 'SHORT' ? '/shorts' : p.kind === 'MUSIC_VIDEO' ? '/music-videos' : `/shows/${p.showId}?tab=seasons`; update((s) => deleteProduction(s, p.id)); toast.ok(T('toast.deleted')); router.push(back); }} variant="ghost" icon={<IconDelete />} />
        </div>
      </aside>
    </div>
  );
}

function EditDetails({ p }: { p: Production }) {
  const T = useT(); const { update } = useStudio(); const toast = useToast();
  const [d, setD] = useState({ title: p.title, titleAr: p.titleAr ?? '', logline: p.logline, style: p.style, language: p.language, dialect: p.dialect ?? 'IRAQI_BAGHDADI', aspect: p.aspect, targetSeconds: p.targetSeconds, artist: p.artist ?? '', genre: p.genre ?? '' });
  const set = (x: Partial<typeof d>) => setD((y) => ({ ...y, ...x }));
  return (
    <Modal title={T('misc.details')} trigger={(open) => <Button size="sm" icon={<IconEdit />} onClick={open}>{T('btn.edit')}</Button>}>
      {(close) => (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!d.title.trim()) return; update((s) => updateProduction(s, p.id, { ...d, titleAr: d.titleAr || undefined, dialect: d.language === 'AR' ? d.dialect : undefined, targetSeconds: Number(d.targetSeconds) || p.targetSeconds, artist: d.artist || undefined, genre: d.genre || undefined })); toast.ok(T('toast.saved')); close(); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={T('label.title')} required><Input value={d.title} onChange={(e) => set({ title: e.target.value })} required /></Field>
            <Field label={T('label.titleAr')}><Input value={d.titleAr} dir="rtl" onChange={(e) => set({ titleAr: e.target.value })} /></Field>
            {p.kind === 'MUSIC_VIDEO' && <Field label={T('meta.artist')}><Input value={d.artist} onChange={(e) => set({ artist: e.target.value })} /></Field>}
            <Field label={T('label.genre')}><Input value={d.genre} onChange={(e) => set({ genre: e.target.value })} /></Field>
          </div>
          <Field label={T('label.logline')}><Textarea value={d.logline} onChange={(e) => set({ logline: e.target.value })} rows={2} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={T('label.style')}><Select value={d.style} onChange={(e) => set({ style: e.target.value as typeof d.style })} options={STYLES.map((s) => ({ value: s, label: T.dyn(`style.${s}`) }))} /></Field>
            <Field label={T('label.aspect')}><Select value={d.aspect} onChange={(e) => set({ aspect: e.target.value as typeof d.aspect })} options={ASPECTS.map((a) => ({ value: a, label: aspectLabel(a) }))} /></Field>
            <Field label={T('label.language')}><Select value={d.language} onChange={(e) => set({ language: e.target.value as typeof d.language })} options={LANGUAGES.map((l) => ({ value: l, label: l === 'EN' ? T('label.english') : T('label.arabic') }))} /></Field>
            {d.language === 'AR' && <Field label={T('label.dialect')}><Select value={d.dialect} onChange={(e) => set({ dialect: e.target.value as typeof d.dialect })} options={DIALECTS.map((x) => ({ value: x, label: dialectLabel(x, T.locale) }))} /></Field>}
            <Field label={`${T('label.target')} (${T('label.seconds')})`}><Input type="number" min={5} max={3600} value={d.targetSeconds} onChange={(e) => set({ targetSeconds: Number(e.target.value) })} /></Field>
          </div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={close}>{T('btn.cancel')}</Button><Button type="submit" variant="primary">{T('btn.save')}</Button></div>
        </form>
      )}
    </Modal>
  );
}
