'use client';

import { useRouter } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import type { Location, LocationRef } from '@/domain/types';
import type { LocationRefRole } from '@/domain/vocabulary';
import { isActiveStatus } from '@/domain/jobs';
import { useJobsFor, useStudio } from '@/studio/store';
import { artVars } from '@/studio/presentation';
import { assetById, productionHref } from '@/studio/selectors';
import { posterOf } from '@/studio/selectors/poster';
import { useToast } from '@/components/ui/toast';
import { useStartJob } from '@/components/ui/jobs';
import { Button, Dialog, Input, MenuButton, MenuItem, MenuSeparator, Segmented, Skeleton, SkeletonRegion, StateWord, useConfirm } from '@/components/ui/kit';
import { Frame, MediaTile, PosterCard } from '@/components/media';
import { IconCheck, IconDelete, IconEdit, IconGenerate, IconPlus, IconUpload } from '@/components/ui/icons';
import { BackLink, CardHead, CastSection, nameLang, usable } from '@/components/character/parts';
import { LocationForm, STYLE_WORDS, timeWord } from './LocationForm';

const ROLE_WORD: Record<LocationRefRole, string> = { MASTER: 'Master plate', VIEW: 'View', STATE: 'Lighting state' };

/** The plate shown for a time of day: a master or lighting state drawn for that time; the master stands for its own
 *  time (or the first time, when it does not say). */
function platesByTime(l: Location): Map<string, LocationRef> {
  const out = new Map<string, LocationRef>();
  const lit = l.refs.filter((r) => r.role === 'MASTER' || r.role === 'STATE');
  for (const r of lit) if (r.timeOfDay && !out.has(r.timeOfDay)) out.set(r.timeOfDay, r);
  const master = l.refs.find((r) => r.assetId === l.masterAssetId) ?? l.refs.find((r) => r.role === 'MASTER');
  if (master && !master.timeOfDay && l.lighting[0] && !out.has(l.lighting[0])) out.set(l.lighting[0], master);
  return out;
}

/** ONE LOCATION (v5 §8.13; v5.1 §2 C7) — the plate hero at 2.39:1 with nothing over it, and under it the lighting
 *  switch (crossfading the plates drawn for each time of day), the slate, the name and the actions; then what the place
 *  is, its plates (master and views; make one the master, remove, upload, draw), its landmarks and props, and the
 *  productions it appears in. Destructive actions sit behind More. Every write goes through the store's commands and
 *  the LOCATION_PLATES job, as before. */
export function LocationPage({ l }: { l: Location }) {
  const { state, act } = useStudio();
  const toast = useToast();
  const router = useRouter();
  const confirm = useConfirm();
  const { start, busy } = useStartJob();
  const running = useJobsFor({ locationId: l.id, type: 'LOCATION_PLATES' }).find((j) => isActiveStatus(j.status));
  const byTime = useMemo(() => platesByTime(l), [l]);
  const times = [...new Set([...l.lighting, ...byTime.keys()])];
  const firstLit = times.find((t) => byTime.has(t));
  const [time, setTime] = useState<string | undefined>(firstLit);
  const on = time && byTime.has(time) ? time : firstLit;
  const master = assetById(state, l.masterAssetId);
  const [edit, setEdit] = useState(false);
  const formId = useId();
  const lang = nameLang(l.name);
  const missing = times.filter((t) => !byTime.has(t));
  const draw = (force = false) => void start('LOCATION_PLATES', { locationId: l.id, ...(force ? { force: true } : {}) }, { quiet: true });
  const redraw = async () => { if (await confirm({ title: `Redraw ${l.name}?`, body: 'A new master plate is drawn from the description. The current plates stay in the studio’s files.', confirmLabel: 'Redraw the place', tone: 'default' })) draw(true); };
  const remove = async () => {
    if (!(await confirm({ title: `Delete ${l.name}?`, body: 'The place is removed from the studio. Finished shots keep their pictures.', confirmLabel: `Delete ${l.name}`, tone: 'danger' }))) return;
    try { act('deleteLocation', l.id); toast.ok(`${l.name} was deleted.`); router.push('/locations'); } catch (e) { toast.bad((e as Error).message); }
  };
  const layers = [...new Map([...byTime.entries()].map(([t, r]) => [r.assetId, t])).entries()];

  return (
    <article className="pc-page" aria-labelledby="loc-name">
      <BackLink href="/locations" label="Locations" />
      <header className="loc-hero">
        <div className="loc-hero-plate" style={artVars(master) as React.CSSProperties}>
          {layers.length > 0 ? layers.map(([assetId, t]) => {
            const a = assetById(state, assetId);
            return <div key={assetId} className="loc-layer" data-on={byTime.get(on ?? '')?.assetId === assetId || undefined}><Frame asset={usable(a) ? a : undefined} ratio="2.39/1" fit="cover" radius="none" alt={`${l.name}, ${timeWord(t).toLowerCase()}`} art={artVars(a)} title={l.name} titleLang={lang} priority /></div>;
          }) : <div className="loc-layer" data-on><Frame ratio="2.39/1" radius="none" alt="" title={l.name} titleLang={lang} titleState="noImage" state={running ? 'drawing' : undefined} phase={running?.progress?.message} decorative /></div>}
        </div>
        {times.length > 0 && (
          <div className="loc-switch">
            <Segmented label="Lighting" value={on ?? ''} onChange={setTime} options={times.map((t) => ({ value: t, label: timeWord(t), disabled: !byTime.has(t) }))} />
            {missing.length > 0 && <span className="t-meta">{missing.map(timeWord).join(', ')}: not drawn yet</span>}
          </div>
        )}
        <div className="loc-hero-caption">
          <div className="loc-hero-words">
            <p className="t-meta char-slate"><span>{l.kind === 'INTERIOR' ? 'Interior' : 'Exterior'}</span><span>{STYLE_WORDS[l.style]}</span><span>{l.refs.length === 1 ? '1 plate' : `${l.refs.length} plates`}</span></p>
            <h1 id="loc-name" className="t-hero"><bdi lang={lang}>{l.name}</bdi></h1>
            {l.nameAr && <p className="t-body char-alt"><bdi lang="ar">{l.nameAr}</bdi></p>}
            {running && <StateWord tone="running">{running.progress?.message || 'Drawing the plates'}</StateWord>}
          </div>
          <div className="loc-hero-acts">
            <Button variant="secondary" icon={<IconEdit />} onClick={() => setEdit(true)}>Edit</Button>
            <Button variant={l.refs.length ? 'secondary' : 'primary'} icon={<IconGenerate />} loading={busy} disabled={Boolean(running)} onClick={() => draw()}>{l.refs.length ? 'Draw more plates' : 'Draw the plates'}</Button>
            <MenuButton label={`More for ${l.name}`} iconOnly variant="secondary" align="end">
              <MenuItem icon={<IconGenerate aria-hidden />} disabled={!l.masterAssetId || Boolean(running)} onClick={() => void redraw()} description="A fresh master plate from the description">Redraw the place</MenuItem>
              <MenuSeparator />
              <MenuItem icon={<IconDelete aria-hidden />} tone="danger" onClick={() => void remove()}>Delete {l.name}</MenuItem>
            </MenuButton>
          </div>
        </div>
      </header>

      <CastSection id="about" title="The place">
        {l.description ? <p className="t-prose char-prose" dir="auto">{l.description}</p> : <p className="t-body pc-empty-line">No description yet.</p>}
      </CastSection>
      <Plates l={l} />
      <section className="pc-section loc-cols" aria-label="Landmarks and props">
        <div className="card char-card">
          <CardHead title="Landmarks" count={l.landmarks.length || undefined} action={<Button size="sm" variant="secondary" icon={<IconEdit />} onClick={() => setEdit(true)}>Edit</Button>} />
          {l.landmarks.length === 0 ? <p className="t-body char-card-line">None written yet.</p> : <ul className="loc-list">{l.landmarks.map((x) => <li key={x}><span className="loc-list-text" dir="auto">{x}</span></li>)}</ul>}
        </div>
        <Props l={l} />
      </section>
      <AppearsIn l={l} />

      <Dialog open={edit} onClose={() => setEdit(false)} size="lg" title={`Edit ${l.name}`} description="Saving does not change the plates: draw again to apply a new description."
        footer={<><Button variant="quiet" onClick={() => setEdit(false)}>Cancel</Button><Button type="submit" form={formId} variant="primary">Save</Button></>}>
        {edit && <LocationForm initial={l} formId={formId} footer={false} onSaved={() => setEdit(false)} />}
      </Dialog>
    </article>
  );
}

function Plates({ l }: { l: Location }) {
  const { state, act, addFile } = useStudio();
  const toast = useToast();
  const [role, setRole] = useState<LocationRefRole>('VIEW');
  const [uploading, setUploading] = useState(false);
  const onFile = async (file: File) => {
    setUploading(true);
    try {
      const r = await addFile(file, { label: `${l.name} — ${ROLE_WORD[role]}`, tags: ['location'] });
      if (!r.ok) { toast.bad(r.error); return; }
      act('updateLocation', l.id, { refs: [...l.refs, { id: `ref-${r.asset.id}`, role, assetId: r.asset.id, label: ROLE_WORD[role] }], masterAssetId: l.masterAssetId ?? r.asset.id });
      toast.ok('Plate added.');
    } finally { setUploading(false); }
  };
  return (
    <CastSection id="plates" title="Plates" count={l.refs.length || undefined} description="The master plate sets the place; views and lighting states follow it.">
      <div className="char-form-acts loc-upload">
        <Segmented label="Upload as" value={role} onChange={setRole} options={[{ value: 'VIEW' as LocationRefRole, label: 'View' }, { value: 'STATE' as LocationRefRole, label: 'Lighting' }, { value: 'MASTER' as LocationRefRole, label: 'Master' }]} />
        <label className="btn btn-secondary btn-sm" aria-busy={uploading || undefined}><IconUpload aria-hidden />Upload<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} /></label>
      </div>
      {l.refs.length === 0 ? <p className="t-body pc-empty-line">No plates yet. Draw them from the description, or upload one.</p> : (
        <ul className="pc-plates loc-plates" role="list">
          {l.refs.map((r) => {
            const a = assetById(state, r.assetId);
            const isMaster = l.masterAssetId === r.assetId;
            return (
              <li key={r.id}>
                <MediaTile title={r.label || ROLE_WORD[r.role]} ratio="16/9" asset={usable(a) ? a : undefined} frameState={a?.unavailable ? 'unavailable' : undefined}
                  meta={[isMaster ? (r.label === 'Master plate' ? null : 'Master plate') : ROLE_WORD[r.role], r.timeOfDay ? timeWord(r.timeOfDay) : null]} />
                <div className="loc-tile-tools">
                  {!isMaster && <Button size="sm" variant="secondary" icon={<IconCheck />} onClick={() => act('updateLocation', l.id, { masterAssetId: r.assetId })}>Make master</Button>}
                  <Button size="sm" variant="quiet" icon={<IconDelete />} aria-label={`Remove ${r.label}`} onClick={() => act('updateLocation', l.id, { refs: l.refs.filter((x) => x.id !== r.id), masterAssetId: isMaster ? l.refs.find((x) => x.id !== r.id)?.assetId : l.masterAssetId })}>Remove</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </CastSection>
  );
}

function Props({ l }: { l: Location }) {
  const { act } = useStudio();
  const [draft, setDraft] = useState('');
  const add = () => { const v = draft.trim(); if (!v || l.props.includes(v)) return; act('updateLocation', l.id, { props: [...l.props, v] }); setDraft(''); };
  return (
    <div className="card char-card">
      <CardHead title="Props" count={l.props.length || undefined} />
      {l.props.length === 0 ? <p className="t-body char-card-line">None yet.</p> : (
        <ul className="loc-list">{l.props.map((p) => <li key={p}><span className="loc-list-text" dir="auto">{p}</span><Button size="sm" variant="quiet" aria-label={`Remove ${p}`} icon={<IconDelete />} onClick={() => act('updateLocation', l.id, { props: l.props.filter((x) => x !== p) })} /></li>)}</ul>
      )}
      <form className="loc-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a prop" aria-label="Add a prop" maxLength={200} />
        <Button type="submit" variant="secondary" icon={<IconPlus />} disabled={!draft.trim()}>Add</Button>
      </form>
    </div>
  );
}

function AppearsIn({ l }: { l: Location }) {
  const { state } = useStudio();
  const productions = state.productions.filter((p) => p.locationIds.includes(l.id) || p.scenes.some((sc) => sc.locationId === l.id) || state.shows.find((s) => s.id === p.showId)?.locationIds.includes(l.id));
  const shows = state.shows.filter((s) => s.locationIds.includes(l.id));
  const kind = (k: string) => (k === 'SHORT' ? 'Short' : k === 'MUSIC_VIDEO' ? 'Music video' : 'Episode');
  return (
    <CastSection id="appears" title="Appears in" count={productions.length + shows.length || undefined}>
      {productions.length + shows.length === 0 ? <p className="t-body pc-empty-line">Not in a production yet.</p> : (
        <ul className="char-posters" role="list">
          {shows.map((s) => { const a = assetById(state, s.posterAssetId ?? s.coverAssetId); return <li key={s.id}><PosterCard href={`/shows/${s.id}`} asset={usable(a) ? a : undefined} title={s.title} meta="Show" /></li>; })}
          {productions.map((p) => {
            const a = posterOf(p, state.assets)?.asset;
            const scenes = p.scenes.filter((sc) => sc.locationId === l.id).length;
            return <li key={p.id}><PosterCard href={productionHref(p)} asset={usable(a) ? a : undefined} title={p.title} meta={`${kind(p.kind)}${scenes ? ` · ${scenes === 1 ? '1 scene' : `${scenes} scenes`}` : ''}`} /></li>;
          })}
        </ul>
      )}
    </CastSection>
  );
}

/** The location page while the studio's first snapshot loads: the 2.39:1 plate, the switch, the caption and the
 *  actions at their real sizes. */
export function LocationSkeleton() {
  return (
    <SkeletonRegion label="Opening the location…" className="pc-page pc-skeleton">
      <span className="pc-back"><Skeleton.Line width="6rem" /></span>
      <div className="loc-hero">
        <Skeleton.Media ratio="2.39/1" className="loc-hero-plate" />
        <div className="loc-switch"><Skeleton.Block width={96} height={36} radius="md" /></div>
        <div className="loc-hero-caption">
          <div className="loc-hero-words">
            <div className="t-meta char-slate"><Skeleton.Line width="12rem" /></div>
            <div className="t-hero"><Skeleton.Line size="title" width="16rem" /></div>
          </div>
          <div className="loc-hero-acts"><Skeleton.Block width={88} height={40} radius="pill" /><Skeleton.Block width={168} height={40} radius="pill" /><Skeleton.Block width={40} height={40} radius="pill" /></div>
        </div>
      </div>
    </SkeletonRegion>
  );
}
