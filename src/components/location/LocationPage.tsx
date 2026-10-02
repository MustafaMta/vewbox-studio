'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Location } from '@/domain/types';
import { LOCATION_REF_ROLES, TIMES_OF_DAY, type LocationRefRole, type TimeOfDay } from '@/domain/vocabulary';
import { useStudio } from '@/studio/store';
import { assetById, productionHref } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { useTab } from '@/lib/hooks';
import { Button, Checkbox, ConfirmDelete, Input, KV, Modal, Select, TabBar } from '@/components/ui/kit';
import { Art, Block, Dots, Empty, Hero } from '@/components/ui/cinema';
import { JobButton } from '@/components/ui/jobs';
import { StageStatus } from '@/components/library/ProductionTile';
import { LocationForm } from './LocationForm';
import { IconCheck, IconDelete, IconEdit, IconGenerate, IconPlus, IconUpload } from '@/components/ui/icons';
import { words } from '@/lib/format';

const TABS = ['overview', 'views', 'lighting', 'props', 'used'] as const;

/** ONE LOCATION — a wide plate under a wide header, then Overview · Views · Lighting & Variations · Props · Used In.
 *  Pictures and camera views first; the words after; nothing technical in the way. */
export function LocationPage({ l }: { l: Location }) {
  const T = useT();
  const { state, act } = useStudio();
  const toast = useToast();
  const router = useRouter();
  const [tab] = useTab(TABS, 'overview');
  const master = assetById(state, l.masterAssetId);
  const usedBy = state.productions.filter((p) => p.locationIds.includes(l.id) || p.scenes.some((sc) => sc.locationId === l.id) || state.shows.find((s) => s.id === p.showId)?.locationIds.includes(l.id));
  const shows = state.shows.filter((s) => s.locationIds.includes(l.id));
  return (
    <>
      <Hero backdropSrc={master?.src} art={<Art src={master?.src} ratio="wide" title={l.name} sample={master?.sample} unavailable={master?.unavailable} />}
        eyebrow={<>{l.kind === 'INTERIOR' ? T('label.interior') : T('label.exterior')} · {T.dyn(`style.${l.style}`)}</>} title={l.name} titleAr={l.nameAr} description={l.description}
        meta={<Dots items={[l.lighting.map(words).join(', '), `${l.refs.length} ${T('tab.views').toLowerCase()}`, `${usedBy.length + shows.length} ${T('tab.usedIn').toLowerCase()}`]} />}
        actions={<><Modal title={`${T('btn.edit')}: ${l.name}`} size="lg" trigger={(open) => <Button variant="primary" icon={<IconEdit />} onClick={open}>{T('btn.edit')}</Button>}>{(close) => <LocationForm initial={l} onSaved={close} onCancel={close} />}</Modal><ConfirmDelete title={l.name} onDelete={() => { act('deleteLocation', l.id); toast.ok(T('toast.deleted')); router.push('/locations'); }} variant="ghost" icon={<IconDelete />}>{T('loc.deleteConfirm')}</ConfirmDelete></>}
        back={{ href: '/locations', label: T('nav.locations') }} />

      <TabBar ariaLabel={l.name} current={tab} hrefFor={(id) => `/locations/${l.id}?tab=${id}`} className="mb-6" tabs={[{ id: 'overview', label: T('tab.overview') }, { id: 'views', label: T('tab.views'), count: l.refs.filter((r) => r.role !== 'STATE').length }, { id: 'lighting', label: T('tab.lighting'), count: l.refs.filter((r) => r.role === 'STATE').length }, { id: 'props', label: T('tab.props'), count: l.props.length }, { id: 'used', label: T('tab.usedIn'), count: usedBy.length + shows.length }]} />

      <div role="tabpanel" className="fade-in" key={tab}>
        {tab === 'overview' && (
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div>
              <Art src={master?.src} ratio="wide" title={l.name} sample={master?.sample} unavailable={master?.unavailable} />
              <p className="mt-2 text-xs text-muted">{T('label.masterPlate')}</p>
              <p className="lead mt-6 max-w-3xl text-[1.05rem] text-body" dir="auto">{l.description || '—'}</p>
            </div>
            <aside className="space-y-8">
              <Block title={T('label.landmarks')}>{l.landmarks.length === 0 ? <p className="text-sm text-muted">—</p> : <ul className="space-y-1.5 text-sm">{l.landmarks.map((x) => <li key={x} className="flex gap-2" dir="auto"><span className="mt-2 size-1 flex-none rounded-full bg-accent" />{x}</li>)}</ul>}</Block>
              <KV rows={[[T('label.kind'), l.kind === 'INTERIOR' ? T('label.interior') : T('label.exterior')], [T('label.style'), T.dyn(`style.${l.style}`)], [T('label.lighting'), l.lighting.map(words).join(' · ') || '—']]} />
            </aside>
          </div>
        )}
        {tab === 'views' && <Views l={l} roles={['MASTER', 'VIEW']} title={T('loc.cameraViews')} />}
        {tab === 'lighting' && (
          <div className="space-y-10">
            <Block title={T('label.lighting')} description={T('loc.lighting.hint')}>
              <div className="flex flex-wrap gap-x-5 gap-y-2">{TIMES_OF_DAY.map((tod) => <Checkbox key={tod} label={words(tod)} checked={l.lighting.includes(tod)} onChange={(e) => act('updateLocation', l.id, { lighting: e.target.checked ? [...l.lighting, tod as TimeOfDay] : l.lighting.filter((x) => x !== tod) })} />)}</div>
            </Block>
            <Views l={l} roles={['STATE']} title={T('loc.states')} />
          </div>
        )}
        {tab === 'props' && <Props l={l} />}
        {tab === 'used' && (
          <Block title={T('tab.usedIn')} count={usedBy.length + shows.length}>
            {usedBy.length + shows.length === 0 ? <Empty title="—" /> : (
              <ul className="grid-posters">
                {shows.map((s) => { const a = assetById(state, s.posterAssetId) ?? assetById(state, s.coverAssetId); return <li key={s.id}><Link href={`/shows/${s.id}`} className="poster-link block"><Art src={a?.src} ratio="poster" title={s.title} sample={a?.sample} /><p className="poster-title" dir="auto">{s.title}</p><p className="poster-meta"><span>{T('kind.SHOW')}</span></p></Link></li>; })}
                {usedBy.map((p) => { const a = assetById(state, p.posterAssetId) ?? assetById(state, p.coverAssetId); return <li key={p.id}><Link href={productionHref(p)} className="poster-link block"><Art src={a?.src} ratio={p.kind === 'MUSIC_VIDEO' ? 'square' : 'poster'} title={p.title} sample={a?.sample} /><p className="poster-title" dir="auto">{p.title}</p><p className="poster-meta"><span>{T.dyn(`kind.${p.kind}`)}</span></p><div className="mt-1"><StageStatus p={p} /></div></Link></li>; })}
              </ul>
            )}
          </Block>
        )}
      </div>
    </>
  );
}

function Views({ l, roles, title }: { l: Location; roles: LocationRefRole[]; title: string }) {
  const T = useT();
  const { state, act, addFile } = useStudio();
  const toast = useToast();
  const [role, setRole] = useState<LocationRefRole>(roles.includes('VIEW') ? 'VIEW' : roles[0]);
  const refs = l.refs.filter((r) => roles.includes(r.role));
  const onFile = async (file: File) => {
    const r = await addFile(file, { label: `${l.name} — ${words(role)}`, tags: ['location'] });
    if (!r.ok) { toast.bad(r.error); return; }
    act('updateLocation', l.id, { refs: [...l.refs, { id: `ref-${r.asset.id}`, role, assetId: r.asset.id, label: words(role) }], masterAssetId: l.masterAssetId ?? r.asset.id });
    toast.ok(T('media.added'));
  };
  const actions = (
    <div className="flex items-center gap-2">
      <Select aria-label={T('loc.views')} value={role} onChange={(e) => setRole(e.target.value as LocationRefRole)} options={LOCATION_REF_ROLES.filter((r) => roles.includes(r)).map((r) => ({ value: r, label: words(r) }))} className="w-auto" />
      <label className="btn btn-secondary btn-sm cursor-pointer"><IconUpload aria-hidden />{T('btn.upload')}<input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} /></label>
      <JobButton type="LOCATION_PLATES" payload={{ locationId: l.id }} target={{ locationId: l.id }} size="sm" icon={<IconGenerate />}>{T('gen.plates')}</JobButton>
    </div>
  );
  return (
    <Block title={title} count={refs.length} actions={actions}>
      {refs.length === 0 ? <Empty title={T('empty.references')} /> : (
        <ul className="grid-wide">
          {refs.map((r) => {
            const a = assetById(state, r.assetId);
            return (
              <li key={r.id} className="group">
                <Art src={a?.src} ratio="wide" title={r.label} sample={a?.sample} unavailable={a?.unavailable}>
                  <span className="card-tools absolute end-2 bottom-2 flex gap-1">
                    {l.masterAssetId !== r.assetId && <button type="button" className="btn btn-secondary btn-xs" onClick={() => act('updateLocation', l.id, { masterAssetId: r.assetId })}><IconCheck />{T('label.masterPlate')}</button>}
                    <button type="button" className="btn btn-secondary btn-xs btn-icon" aria-label={`${T('btn.remove')} ${r.label}`} onClick={() => act('updateLocation', l.id, { refs: l.refs.filter((x) => x.id !== r.id) })}><IconDelete /></button>
                  </span>
                </Art>
                <p className="poster-title text-sm">{r.label}</p>
                <p className="poster-meta"><span>{words(r.role)}</span>{l.masterAssetId === r.assetId && <span className="text-accent">{T('label.masterPlate')}</span>}</p>
              </li>
            );
          })}
        </ul>
      )}
    </Block>
  );
}

function Props({ l }: { l: Location }) {
  const T = useT();
  const { act } = useStudio();
  const [draft, setDraft] = useState('');
  const add = () => { const v = draft.trim(); if (!v) return; act('updateLocation', l.id, { props: [...l.props, v] }); setDraft(''); };
  return (
    <Block title={T('tab.props')} count={l.props.length} description={T('loc.props.hint')}>
      <form className="mb-4 flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={T('loc.addProp')} aria-label={T('loc.addProp')} />
        <Button type="submit" variant="primary" icon={<IconPlus />} disabled={!draft.trim()}>{T('btn.add')}</Button>
      </form>
      {l.props.length === 0 ? <Empty title={T('tab.props')} hint={T('loc.props.hint')} /> : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {l.props.map((p) => <li key={p} className="panel flex items-center justify-between gap-3 px-4 py-3 text-sm"><span dir="auto">{p}</span><Button variant="ghost" size="xs" icon={<IconDelete />} aria-label={`${T('btn.remove')} ${p}`} onClick={() => act('updateLocation', l.id, { props: l.props.filter((x) => x !== p) })} /></li>)}
        </ul>
      )}
    </Block>
  );
}
