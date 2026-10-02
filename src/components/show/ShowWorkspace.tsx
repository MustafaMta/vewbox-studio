'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { Production, Season, Show } from '@/domain/types';
import { ASPECTS, DIALECTS, LANGUAGES, STYLES } from '@/domain/vocabulary';
import { useStudio } from '@/studio/store';
import { assetById, assetSrc, episodesOf, nextStep, productionHref, progressOf, seasonsOf } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { useTab } from '@/lib/hooks';
import { Button, ConfirmDelete, Field, Input, LinkButton, Menu, MenuItem, Modal, Select, Status, TabBar, Textarea, Thumb } from '@/components/ui/kit';
import { Art, Empty, Hero } from '@/components/ui/cinema';
import { FactList, ProgressBar, Section } from '@/components/ui/page';
import { CanonPicker } from '@/components/library/CanonPicker';
import { StageStatus } from '@/components/library/ProductionTile';
import { stageFraction } from '@/components/library/Cards';
import { IconArrowRight, IconAspect, IconChevronRight, IconDelete, IconDuration, IconEdit, IconLanguage, IconPlay, IconPlus, IconStyle } from '@/components/ui/icons';
import { VideoPlayer } from '@/components/players/VideoPlayer';
import { aspectLabel, aspectShort, dialectLabel, fmtAgo, fmtSeconds, ratioCss } from '@/lib/format';

/** ONE SHOW — a wide banner (the key art fading into the canvas, the title and premise on its lower edge) with one
 *  action, Add Episode, that always names the season it adds to; then five tabs: Overview · Seasons · Characters ·
 *  Locations · Settings. Seasons and episodes stay inside this page; the banner never leaves. */

const TABS = ['overview', 'seasons', 'episodes', 'characters', 'locations', 'settings'] as const;
const ALIAS: Record<string, (typeof TABS)[number]> = { gallery: 'overview', cast: 'characters', world: 'locations' };

export function ShowWorkspace({ show }: { show: Show }) {
  const T = useT();
  const { state, act } = useStudio();
  const toast = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const [rawTab] = useTab([...TABS, 'gallery', 'cast', 'world'] as const, 'overview');
  const tab = ALIAS[rawTab] ?? (rawTab as (typeof TABS)[number]);
  const seasons = seasonsOf(state, show.id);
  const episodes = state.productions.filter((p) => p.showId === show.id);
  const cover = assetById(state, show.coverAssetId) ?? assetById(state, show.posterAssetId);
  // the preview: the latest finished cut of any episode (a real one, never a bundled sample clip)
  const preview = [...episodes].filter((p) => p.cutAssetId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((p) => ({ p, cut: assetById(state, p.cutAssetId) })).find((x) => x.cut && !x.cut.sample && !x.cut.unavailable);
  const [showPreview, setShowPreview] = useState(false);
  const selectedSeason = seasons.find((s) => s.id === sp.get('season')) ?? seasons[seasons.length - 1];
  const hrefFor = (id: string) => `/shows/${show.id}?tab=${id}${id === 'seasons' && selectedSeason ? `&season=${selectedSeason.id}` : ''}`;
  const primary = seasons.length === 0
    ? <AddSeason showId={show.id} variant="primary" />
    : <LinkButton href={`/new/episode?show=${show.id}&season=${selectedSeason!.id}`} variant="primary" icon={<IconPlus />} title={`${T('kind.SEASON')} ${selectedSeason!.number}${selectedSeason!.title ? ` · ${selectedSeason!.title}` : ''}`}>{T('btn.addEpisode')} <span className="num opacity-80">· {T('kind.SEASON')} {selectedSeason!.number}</span></LinkButton>;

  return (
    <>
      <Hero layout="wide" backdropSrc={cover && !cover.unavailable ? cover.src : undefined} back={{ href: '/shows', label: T('nav.shows') }}
        eyebrow={<>{T('kind.SHOW')}{show.genre ? ` · ${show.genre}` : ''} · {seasons.length} {T(seasons.length === 1 ? 'meta.season' : 'meta.seasons')} · {episodes.length} {T(episodes.length === 1 ? 'meta.episode' : 'meta.episodes')}{cover?.sample ? ` · ${T('label.sample')}` : ''}</>}
        title={show.title} titleAr={show.titleAr} description={show.synopsis || show.logline}
        actions={<>{primary}{preview && <Button variant="secondary" icon={<IconPlay />} onClick={() => setShowPreview((v) => !v)} aria-expanded={showPreview}>{T('show.preview')}</Button>}</>}>
        {preview && showPreview && (
          <div className="mt-6 max-w-3xl fade-in">
            <VideoPlayer src={preview.cut!.src} poster={preview.cut!.poster} title={`${show.title} — ${preview.p.title}`} aspect={ratioCss(show.aspect)} />
            <p className="mt-2 text-[12px] text-muted" dir="auto">{T('show.preview.hint')} · <Link href={productionHref(preview.p)} className="hover:text-fg">{preview.p.title}</Link></p>
          </div>
        )}
      </Hero>

      <TabBar ariaLabel={show.title} current={tab} hrefFor={hrefFor} className="mb-8" sticky tabs={[
        { id: 'overview', label: T('tab.overview') }, { id: 'seasons', label: T('tab.seasons'), count: seasons.length }, { id: 'episodes', label: T('tab.episodes'), count: episodes.length }, { id: 'characters', label: T('tab.showCast'), count: show.castIds.length },
        { id: 'locations', label: T('show.world'), count: show.locationIds.length }, { id: 'settings', label: T('tab.settings') },
      ]} />

      <div role="tabpanel" className="fade-in" key={tab}>
        {tab === 'overview' && <Overview show={show} seasons={seasons} episodes={episodes} />}
        {tab === 'seasons' && <Seasons show={show} seasons={seasons} selected={selectedSeason} />}
        {tab === 'episodes' && <AllEpisodes show={show} seasons={seasons} episodes={episodes} />}
        {tab === 'characters' && <div className="space-y-4"><p className="max-w-2xl text-[13.5px] text-muted">{T('show.canonHint')}</p><CanonPicker only="cast" castIds={show.castIds} locationIds={show.locationIds} style={show.style} onChange={(patch) => { act('updateShow', show.id, patch); toast.ok(T('toast.saved')); }} /></div>}
        {tab === 'locations' && <div className="space-y-4"><p className="max-w-2xl text-[13.5px] text-muted">{T('show.worldHint')}</p><CanonPicker only="locations" castIds={show.castIds} locationIds={show.locationIds} style={show.style} onChange={(patch) => { act('updateShow', show.id, patch); toast.ok(T('toast.saved')); }} /></div>}
        {tab === 'settings' && <ShowSettings show={show} onDeleted={() => { act('deleteShow', show.id); toast.ok(T('toast.deleted')); router.push('/shows'); }} />}
      </div>
    </>
  );
}

/** WORLD BIBLE — the durable facts of the fictional world, kept with the show and handed to the story engine on every
 *  episode: rules of the world, who is what to whom, what has happened so far, and the art direction. Edited by hand
 *  here; the cast (locked appearances, voices) and the places (plates, layout) live in the library and are linked. */
function WorldBible({ show }: { show: Show }) {
  const T = useT();
  const { act } = useStudio();
  const toast = useToast();
  const b = show.bible ?? {};
  const current = { worldRules: (b.worldRules ?? []).join('\n'), relationships: (b.relationships ?? []).join('\n'), timeline: (b.timeline ?? []).join('\n'), unresolved: (b.unresolved ?? []).join('\n'), styleNotes: b.styleNotes ?? '' };
  const [draft, setDraft] = useState(current);
  const lines = (s: string) => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const dirty = JSON.stringify(draft) !== JSON.stringify(current);
  const save = () => { act('updateShow', show.id, { bible: { worldRules: lines(draft.worldRules), relationships: lines(draft.relationships), timeline: lines(draft.timeline), unresolved: lines(draft.unresolved), styleNotes: draft.styleNotes.trim() || undefined } }); toast.ok(T('toast.saved')); };
  const fields: Array<[keyof typeof draft, string, string]> = [['worldRules', T('bible.rules'), T('bible.rules.hint')], ['relationships', T('bible.relationships'), T('bible.relationships.hint')], ['timeline', T('bible.timeline'), T('bible.timeline.hint')], ['unresolved', T('bible.unresolved'), T('bible.unresolved.hint')], ['styleNotes', T('bible.style'), T('bible.style.hint')]];
  return (
    <Section title={T('bible.title')} description={T('bible.hint')} action={<div className="flex items-center gap-2">{dirty && <Status tone="warn">{T('shot.unsaved')}</Status>}<Button size="sm" variant={dirty ? 'primary' : 'secondary'} disabled={!dirty} onClick={save}>{dirty ? T('btn.save') : T('btn.saved')}</Button></div>}>
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map(([key, label, hint]) => <Field key={key} label={label} help={hint}><Textarea value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} rows={4} dir="auto" /></Field>)}
      </div>
    </Section>
  );
}

/** The overview: the seasons as cards, then the shared cast and world with room to breathe; beside them the
 *  show's progress, its facts, and the episode to pick up next. */
function Overview({ show, seasons, episodes }: { show: Show; seasons: Season[]; episodes: Production[] }) {
  const T = useT();
  const { state } = useStudio();
  const overall = episodes.length ? episodes.reduce((a, p) => a + stageFraction(p), 0) / episodes.length : 0;
  const cast = state.characters.filter((c) => show.castIds.includes(c.id));
  const world = state.locations.filter((l) => show.locationIds.includes(l.id));
  const addSeason = <AddSeason showId={show.id} variant={seasons.length ? 'secondary' : 'primary'} />;
  const recent = [...episodes].filter((p) => p.stage !== 'COMPLETE').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-10">
        <Section title={T('tab.seasons')} description={`${seasons.length} ${T(seasons.length === 1 ? 'meta.season' : 'meta.seasons')} · ${episodes.length} ${T(episodes.length === 1 ? 'meta.episode' : 'meta.episodes')}`} action={seasons.length ? addSeason : undefined}>
          {seasons.length === 0 ? <Empty compact title={T('empty.seasons')} hint={T('show.firstSeason')} action={addSeason} /> : (
            <ol className="space-y-3">
              {seasons.map((season) => {
                const eps = episodesOf(state, season.id);
                const progress = eps.length ? eps.reduce((a, p) => a + stageFraction(p), 0) / eps.length : 0;
                return (
                  <li key={season.id}>
                    <Link href={`/shows/${show.id}?tab=seasons&season=${season.id}`} className="card card-hover flex gap-4 p-4 sm:gap-5 sm:p-5">
                      <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-raised-2 text-center"><span><span className="block text-[10px] uppercase tracking-wider text-faint">{T('kind.SEASON')}</span><span className="num block text-[20px] font-semibold leading-none text-fg">{season.number}</span></span></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[16px] font-semibold text-fg" dir="auto">{season.title || `${T('kind.SEASON')} ${season.number}`}</span>
                          <span className="badge num">{eps.length} {T(eps.length === 1 ? 'meta.episode' : 'meta.episodes')}</span>
                        </span>
                        <span className="mt-1.5 line-clamp-2 block text-[13px] leading-relaxed text-faint" dir="auto">{season.arc || '—'}</span>
                        <span className="mt-3 flex items-center gap-3"><ProgressBar value={progress} label={`${T('kind.SEASON')} ${season.number}: ${T('meta.progress')}`} /><span className="num shrink-0 text-[12px] text-faint">{Math.round(progress * 100)}%</span></span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </Section>

        <Section title={T('tab.characters')} count={cast.length} description={T('show.canonHint')} action={<Link href={`/shows/${show.id}?tab=characters`} className="btn btn-subtle btn-sm">{T('btn.edit')}</Link>}>
          {cast.length === 0 ? <Empty compact title={T('empty.cast')} action={<LinkButton href={`/shows/${show.id}?tab=characters`} size="sm" icon={<IconPlus />}>{T('lib.addCharacter')}</LinkButton>} /> : (
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {cast.slice(0, 6).map((c) => <li key={c.id}><Link href={`/characters/${c.id}`} className="poster-link block"><Art src={assetSrc(state, c.portraitAssetId)} ratio="portrait" title={c.name} /><span className="mt-1.5 block truncate text-[13px] font-medium text-fg" dir="auto">{c.name}</span><span className="block truncate text-[11.5px] text-faint" dir="auto">{c.role}</span></Link></li>)}
            </ul>
          )}
        </Section>

        <Section title={T('show.world')} count={world.length} description={T('show.worldHint')} action={<Link href={`/shows/${show.id}?tab=locations`} className="btn btn-subtle btn-sm">{T('btn.edit')}</Link>}>
          {world.length === 0 ? <Empty compact title={T('show.noWorld')} action={<LinkButton href={`/shows/${show.id}?tab=locations`} size="sm" icon={<IconPlus />}>{T('lib.addLocation')}</LinkButton>} /> : (
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {world.slice(0, 6).map((l) => <li key={l.id}><Link href={`/locations/${l.id}`} className="poster-link block"><Art src={assetSrc(state, l.masterAssetId)} ratio="wide" title={l.name} /><span className="mt-1.5 block truncate text-[13px] font-medium text-fg" dir="auto">{l.name}</span><span className="block truncate text-[11.5px] text-faint">{l.kind === 'INTERIOR' ? T('label.interior') : T('label.exterior')}</span></Link></li>)}
            </ul>
          )}
        </Section>

        <WorldBible show={show} />
      </div>

      <aside className="grid content-start gap-5 sm:grid-cols-2 xl:grid-cols-1">
        <div className="card p-5">
          <div className="kicker mb-3">{T('show.overallProgress')}</div>
          <div className="mb-2 flex items-end justify-between"><span className="num text-[26px] font-semibold text-fg">{Math.round(overall * 100)}%</span><span className="text-[12px] text-faint">{episodes.length} {T(episodes.length === 1 ? 'meta.episode' : 'meta.episodes')}</span></div>
          <ProgressBar value={overall} label={`${show.title}: ${T('meta.progress')}`} />
          {recent && (
            <Link href={`${productionHref(recent)}?tab=${nextStep(recent).tab === 'cast' ? 'characters' : nextStep(recent).tab}`} className="group mt-4 flex items-center gap-3 rounded-xl border border-line bg-input p-2.5 transition-colors hover:border-line-strong">
              <div className="w-16 flex-none"><Thumb src={assetSrc(state, recent.coverAssetId)} alt="" ratio="aspect-video" className="rounded-md" /></div>
              <div className="min-w-0 flex-1"><p className="text-[11px] text-faint">{T('home.continue')} · {fmtAgo(recent.updatedAt, T.locale)}</p><p className="truncate text-[13px] font-semibold text-fg" dir="auto">{recent.title}</p><p className="mt-0.5 flex items-center gap-1 text-[12px] text-muted group-hover:text-fg">{T.dyn(nextStep(recent).key)}<IconArrowRight aria-hidden className="size-3.5 rtl:rotate-180" /></p></div>
            </Link>
          )}
        </div>
        <div className="card p-5">
          <div className="kicker mb-3">{T('show.styleFormat')}</div>
          <div className="text-[15px] font-semibold text-fg">{T.dyn(`style.${show.style}`)}{show.genre ? ` · ${show.genre}` : ''}</div>
          <div className="divider my-4" />
          <FactList items={[
            { label: T('label.aspect'), value: aspectLabel(show.aspect), icon: <IconAspect /> },
            { label: T('label.language'), value: `${show.language === 'EN' ? T('label.english') : T('label.arabic')}${show.dialect ? ` · ${dialectLabel(show.dialect, T.locale)}` : ''}`, icon: <IconLanguage /> },
            { label: T('label.style'), value: T.dyn(`style.${show.style}`), icon: <IconStyle /> },
            { label: T('show.episodeLength'), value: episodes.length ? fmtSeconds(Math.round(episodes.reduce((a, p) => a + p.targetSeconds, 0) / episodes.length)) : '—', icon: <IconDuration /> },
          ]} />
        </div>
      </aside>
    </div>
  );
}

/** A season's episodes as rows: landscape thumbnail, number, title, duration, status. The one Add Episode button
 *  is the banner's; this tab only names the season it goes to. */
function Seasons({ show, seasons, selected }: { show: Show; seasons: Season[]; selected?: Season }) {
  const T = useT();
  const { state, act } = useStudio();
  const toast = useToast();
  const router = useRouter();
  if (seasons.length === 0 || !selected) return <Empty title={T('empty.seasons')} hint={T('show.firstSeason')} action={<AddSeason showId={show.id} variant="primary" />} />;
  const eps = episodesOf(state, selected.id);
  return (
    <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)] xl:gap-8">
      <nav aria-label={T('show.selectSeason')} className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0 xl:flex-col xl:overflow-visible">
        {seasons.map((s) => { const on = s.id === selected.id; return (
          <Link key={s.id} href={`/shows/${show.id}?tab=seasons&season=${s.id}`} aria-current={on ? 'page' : undefined} aria-label={`${T('kind.SEASON')} ${s.number}`} scroll={false}
            className={`flex min-w-[10.5rem] flex-none items-center gap-3 rounded-xl border px-3.5 py-3 text-start transition-colors ${on ? 'border-primary bg-primary/[0.08]' : 'border-line hover:border-line-strong hover:bg-raised'}`}>
            <span className={`num grid size-8 shrink-0 place-items-center rounded-lg text-[13px] font-semibold ${on ? 'bg-primary text-on-primary' : 'bg-raised-2 text-fg'}`}>{s.number}</span>
            <span className="min-w-0"><span className="block truncate text-[13px] font-semibold text-fg" dir="auto">{s.title || `${T('kind.SEASON')} ${s.number}`}</span><span className="block text-[11.5px] text-faint">{episodesOf(state, s.id).length} {T('meta.episodes')}</span></span>
          </Link>
        ); })}
        <AddSeason showId={show.id} variant="ghost" />
      </nav>
      <div className="min-w-0">
        <Section title={<span className="bi"><span>{selected.title || `${T('kind.SEASON')} ${selected.number}`}</span><span className="text-[13px] font-medium text-faint">{T('kind.SEASON')} {selected.number} · {eps.length} {T(eps.length === 1 ? 'meta.episode' : 'meta.episodes')}</span></span>} description={selected.arc || undefined}
          action={<Menu label={`${T('kind.SEASON')} ${selected.number}: ${T('nav.more')}`}>
            <EditSeasonItem season={selected} />
            <MenuItem icon={<IconDelete />} tone="danger" onClick={() => { if (window.confirm(`${T('btn.delete')} ${T('kind.SEASON')} ${selected.number}?`)) { act('deleteSeason', selected.id); toast.ok(T('toast.deleted')); router.replace(`/shows/${show.id}?tab=seasons`); } }}>{T('btn.delete')}</MenuItem>
          </Menu>}>
          {eps.length === 0 ? <Empty compact title={T('show.noEpisodes')} hint={`${T('btn.addEpisode')} · ${T('kind.SEASON')} ${selected.number}`} action={<LinkButton href={`/new/episode?show=${show.id}&season=${selected.id}`} variant="primary" icon={<IconPlus />}>{T('btn.addEpisode')}</LinkButton>} /> : (
            <ol className="card divide-y divide-line/70">{eps.map((p) => <EpisodeRow key={p.id} p={p} seasons={seasons} />)}</ol>
          )}
        </Section>
      </div>
    </div>
  );
}

/** Every episode of the show, grouped by season, newest season first. */
function AllEpisodes({ show, seasons, episodes }: { show: Show; seasons: Season[]; episodes: Production[] }) {
  const T = useT();
  if (episodes.length === 0) return <Empty title={T('show.noEpisodes')} action={seasons.length ? <LinkButton href={`/new/episode?show=${show.id}&season=${seasons[seasons.length - 1].id}`} variant="primary" icon={<IconPlus />}>{T('btn.addEpisode')}</LinkButton> : <AddSeason showId={show.id} variant="primary" />} />;
  const ordered = [...seasons].sort((a, b) => b.number - a.number);
  return (
    <div className="space-y-8">
      <p className="text-[13px] text-muted">{T('show.allEpisodes')}</p>
      {ordered.map((season) => { const eps = episodes.filter((p) => p.seasonId === season.id).sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0)); if (!eps.length) return null; return (
        <Section key={season.id} title={<span className="bi"><span>{season.title || `${T('kind.SEASON')} ${season.number}`}</span><span className="text-[13px] font-medium text-faint">{T('kind.SEASON')} {season.number}</span></span>} count={eps.length} action={<LinkButton href={`/new/episode?show=${show.id}&season=${season.id}`} size="sm" icon={<IconPlus />}>{T('btn.addEpisode')}</LinkButton>}>
          <ol className="card divide-y divide-line/70">{eps.map((p) => <EpisodeRow key={p.id} p={p} seasons={seasons} />)}</ol>
        </Section>
      ); })}
    </div>
  );
}

export function EpisodeRow({ p, seasons, showSeason }: { p: Production; seasons: Season[]; showSeason?: boolean }) {
  const T = useT();
  const { state } = useStudio();
  const cover = assetById(state, p.coverAssetId);
  const pr = progressOf(p);
  const season = seasons.find((s) => s.id === p.seasonId);
  return (
    <li>
      <Link href={productionHref(p)} className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-input sm:gap-4 sm:px-4">
        <div className="w-24 flex-none sm:w-40"><Thumb src={cover?.src} alt="" ratio="aspect-video" className="rounded-md" empty={T('misc.noArtwork')} unavailable={cover?.unavailable} /></div>
        <div className="min-w-0 flex-1">
          <p className="num text-[11.5px] text-faint">{showSeason && season ? `S${season.number} · ` : ''}{T('misc.episodeOf')} {p.episodeNumber}</p>
          <p className="bi mt-0.5 truncate text-[15px] font-semibold text-fg" dir="auto"><span>{p.title}</span>{p.titleAr && <span className="bi-ar" dir="rtl">{p.titleAr}</span>}</p>
          {p.logline && <p className="mt-0.5 hidden truncate text-[13px] text-faint sm:block" dir="auto">{p.logline}</p>}
          <div className="mt-1 md:hidden"><StageStatus p={p} /></div>
        </div>
        <span className="num hidden w-16 flex-none text-end text-[13px] text-muted sm:block">{fmtSeconds(pr.runtime || p.targetSeconds)}</span>
        <span className="hidden w-28 flex-none md:block"><StageStatus p={p} /></span>
        <IconChevronRight className="size-4 flex-none text-ink-500 rtl:rotate-180" aria-hidden />
      </Link>
    </li>
  );
}

function ShowSettings({ show, onDeleted }: { show: Show; onDeleted: () => void }) {
  const T = useT(); const { act } = useStudio(); const toast = useToast();
  const initial = { title: show.title, titleAr: show.titleAr ?? '', logline: show.logline, synopsis: show.synopsis ?? '', genre: show.genre, style: show.style, language: show.language, dialect: show.dialect ?? 'IRAQI_BAGHDADI', aspect: show.aspect };
  const [d, setD] = useState(initial);
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,40rem)_1fr]">
      <form className="card space-y-5 p-5 sm:p-6" onSubmit={(e) => { e.preventDefault(); if (!d.title.trim()) return; act('updateShow', show.id, { ...d, titleAr: d.titleAr || undefined, dialect: d.language === 'AR' ? d.dialect : undefined }); toast.ok(T('toast.saved')); }}>
        <p className="text-[13px] text-muted">{T('show.settings.hint')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={T('label.title')} required><Input value={d.title} onChange={(e) => set({ title: e.target.value })} required /></Field>
          <Field label={T('label.titleAr')}><Input value={d.titleAr} dir="rtl" onChange={(e) => set({ titleAr: e.target.value })} /></Field>
        </div>
        <Field label={T('label.logline')}><Input value={d.logline} onChange={(e) => set({ logline: e.target.value })} /></Field>
        <Field label={T('label.synopsis')}><Textarea value={d.synopsis} onChange={(e) => set({ synopsis: e.target.value })} rows={4} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={T('label.genre')}><Input value={d.genre} onChange={(e) => set({ genre: e.target.value })} /></Field>
          <Field label={T('label.style')}><Select value={d.style} onChange={(e) => set({ style: e.target.value as typeof d.style })} options={STYLES.map((s) => ({ value: s, label: T.dyn(`style.${s}`) }))} /></Field>
          <Field label={T('label.language')}><Select value={d.language} onChange={(e) => set({ language: e.target.value as typeof d.language })} options={LANGUAGES.map((l) => ({ value: l, label: l === 'EN' ? T('label.english') : T('label.arabic') }))} /></Field>
          {d.language === 'AR' && <Field label={T('label.dialect')}><Select value={d.dialect} onChange={(e) => set({ dialect: e.target.value as typeof d.dialect })} options={DIALECTS.map((x) => ({ value: x, label: dialectLabel(x, T.locale) }))} /></Field>}
          <Field label={T('label.aspect')}><Select value={d.aspect} onChange={(e) => set({ aspect: e.target.value as typeof d.aspect })} options={ASPECTS.map((a) => ({ value: a, label: aspectShort(a) }))} /></Field>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-line/70 pt-4">{dirty && <Status tone="warn">{T('shot.unsaved')}</Status>}<Button type="submit" variant="primary" disabled={!dirty}>{dirty ? T('btn.save') : T('btn.saved')}</Button></div>
      </form>
      <div className="card h-fit p-5">
        <h3 className="h3">{T('show.deleteShow')}</h3>
        <p className="mt-1 mb-4 text-[13px] text-muted">{T('show.delete.hint')}</p>
        <ConfirmDelete title={show.title} onDelete={onDeleted} icon={<IconDelete />} variant="secondary" />
      </div>
    </div>
  );
}

/** A new season starts in the wizard (Auto: the agents continue the show; Manual: a title or a line). */
export function AddSeason({ showId, variant = 'secondary' }: { showId: string; variant?: 'primary' | 'secondary' | 'ghost' }) {
  const T = useT();
  return <LinkButton href={`/new/season?show=${showId}`} size={variant === 'primary' ? undefined : 'sm'} variant={variant} icon={<IconPlus />} className={variant === 'ghost' ? 'flex-none xl:justify-start' : ''}>{T('btn.addSeason')}</LinkButton>;
}

function EditSeasonItem({ season }: { season: Season }) {
  const T = useT(); const { act } = useStudio(); const toast = useToast();
  const [title, setTitle] = useState(season.title); const [arc, setArc] = useState(season.arc);
  return (
    <Modal title={`${T('kind.SEASON')} ${season.number}`} trigger={(open) => <MenuItem icon={<IconEdit />} onClick={(e) => { e.stopPropagation(); open(); }}>{T('btn.edit')}</MenuItem>}>
      {(close) => (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); act('updateSeason', season.id, { title: title.trim() || `Season ${season.number}`, arc }); toast.ok(T('toast.saved')); close(); }}>
          <Field label={T('label.title')}><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label={T('label.arc')}><Textarea value={arc} onChange={(e) => setArc(e.target.value)} rows={3} /></Field>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={close}>{T('btn.cancel')}</Button><Button type="submit" variant="primary">{T('btn.save')}</Button></div>
        </form>
      )}
    </Modal>
  );
}
