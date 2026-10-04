'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import type { Show } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { artVars } from '@/studio/presentation';
import { useShell } from '@/components/shell/context';
import { useToast } from '@/components/ui/toast';
import { Frame, StartCard } from '@/components/media';
import { MenuButton, MenuItem, MenuSeparator, PanelCard, SectionHead, Segmented, useConfirm } from '@/components/ui/kit';
import { IconDelete, IconEdit, IconPlay, IconPlus, IconStory } from '@/components/ui/icons';
import { BIBLE_PARTS, ASPECT_LABEL, LANGUAGE_LABEL, STYLE_LABEL, castOfShow, episodeCard, episodesOfSeason, minutes, nameLang, showPicture, showPoster, showView, timeOf, waitingProductions, worldOfShow } from './model';
import { Backdrop, Caption } from './Backdrop';
import { BibleDialog, CanonDialog, EditShowDialog, NewEpisodeDialog, NewSeasonDialog } from './dialogs';
import { CastCard, EmptyLine, EpisodeTile, HeadLink, PlateTile } from './parts';
import { useQueryParam } from './url';
import { dialectLabel } from '@/lib/format';

/** ONE SHOW — a streaming title page. The key art in a rounded frame at Home's banner proportions with the words under
 *  it: the poster (when one was drawn), the slate, the title and the logline; Continue (the next episode's next step,
 *  into its production workspace) and Watch (the latest cut, in the Screening Room). Then the episodes of the chosen
 *  season as 16:9 stills with their number, title, two lines of synopsis and the stage meter; the cast as figures; the
 *  world as plates; the show bible; the details. New season and New episode open dialogs (`?new=`), as do the editors
 *  (`?edit=`), so every state has a URL. */

const dateWords = (t: string) => { const ms = timeOf(t); return ms ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(ms) : null; };

export function ShowPage({ show }: { show: Show }) {
  const { state, act } = useStudio();
  const { decisions } = useShell();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const waiting = useMemo(() => waitingProductions(decisions.items), [decisions]);
  const view = useMemo(() => showView(state, show), [state, show]);
  const picture = useMemo(() => showPicture(state, show), [state, show]);
  const poster = useMemo(() => showPoster(state, show), [state, show]);
  const cast = useMemo(() => castOfShow(state, show.castIds), [state, show]);
  const world = useMemo(() => worldOfShow(state, show.locationIds), [state, show]);
  const [seasonParam, setSeason, hrefWith] = useQueryParam('season');
  const [dialog, setDialog] = useQueryParam('new');
  const [edit, setEdit] = useQueryParam('edit');
  const season = view.seasons.find((s) => s.id === seasonParam) ?? view.seasons.find((s) => s.id === view.continue?.episode.seasonId) ?? view.seasons[0];
  const episodes = season ? episodesOfSeason(state, season.id).map((p) => episodeCard(state, p, waiting)) : [];
  const lang = nameLang(show.title);
  const remove = async () => {
    const n = view.episodes.length;
    if (!(await confirm({ title: <>Delete <bdi>{show.title}</bdi>?</>, body: `Its ${view.seasons.length === 1 ? 'season' : `${view.seasons.length} seasons`} and ${n === 1 ? 'its episode' : `${n} episodes`} are deleted with it.`, keep: 'Characters and locations stay in the studio.', confirmLabel: `Delete ${show.title}` }))) return;
    act('deleteShow', show.id);
    toast.ok(`${show.title} deleted`);
    router.push('/shows');
  };

  // one primary: Continue; else the first thing to make; else Watch
  const primary = view.continue ? <Link className="btn btn-primary" href={view.continue.href}>{view.continue.label}</Link>
    : !season ? <Link className="btn btn-primary" href={hrefWith('season', { new: 'season' })} scroll={false}><IconPlus aria-hidden />New season</Link>
      : view.watch ? <Link className="btn btn-primary" href={view.watch.href}><IconPlay aria-hidden />{view.watch.label}</Link>
        : <Link className="btn btn-primary" href={hrefWith(season.id, { new: 'episode' })} scroll={false}><IconPlus aria-hidden />New episode</Link>;
  const secondary = view.continue && view.watch ? <Link className="btn btn-secondary" href={view.watch.href}><IconPlay aria-hidden />{view.watch.label}</Link>
    : !view.continue && view.watch && season ? <Link className="btn btn-secondary" href={hrefWith(season.id, { new: 'episode' })} scroll={false}><IconPlus aria-hidden />New episode</Link> : null;

  return (
    <div className="shows show-page" data-state={view.episodes.length ? 'episodes' : view.seasons.length ? 'no-episodes' : 'no-seasons'}>
      <section className="show-hero" aria-labelledby="show-title">
        <Backdrop picture={picture} title={show.title} lang={lang} label={`Key art for ${show.title}`} />
        <Caption
          poster={poster ? <Frame asset={poster.asset} src={poster.src} ratio="2/3" fit="cover" alt={`Poster of ${show.title}`} art={artVars(poster.asset)} /> : undefined}
          actions={<>
            {secondary}
            {primary}
            <MenuButton label={`More for ${show.title}`} iconOnly variant="secondary" align="end">
              <MenuItem icon={<IconEdit aria-hidden />} onClick={() => setEdit('details')}>Edit the show</MenuItem>
              <MenuItem icon={<IconStory aria-hidden />} onClick={() => setEdit('bible')}>Edit the bible</MenuItem>
              <MenuSeparator />
              <MenuItem icon={<IconDelete aria-hidden />} tone="danger" onClick={() => void remove()}>Delete the show</MenuItem>
            </MenuButton>
          </>}>
          <p className="t-meta t-facts show-slate">{view.slate.map((s, i) => <span key={i}>{s}</span>)}</p>
          <h1 id="show-title" className="t-hero show-title"><bdi lang={lang}>{show.title}</bdi></h1>
          {view.lead && <p className="t-lead show-lead" dir="auto">{view.lead}</p>}
        </Caption>
      </section>

      <section className="shows-section" id="episodes" aria-labelledby="show-episodes-h">
        <SectionHead id="show-episodes-h" title="Episodes" count={view.episodes.length || null}
          action={season && <Link className="btn btn-secondary btn-sm" href={hrefWith(season.id, { new: 'season' })} scroll={false}><IconPlus aria-hidden />New season</Link>} />
        {season && (
          <div className="show-seasons">
            {view.seasons.length > 1
              ? <Segmented label="Season" value={season.id} onChange={(id) => setSeason(id)} options={view.seasons.map((s) => ({ value: s.id, label: `Season ${s.number}` }))} />
              : <p className="t-title">Season {season.number}{season.title && season.title !== `Season ${season.number}` ? <> · <bdi lang={nameLang(season.title)}>{season.title}</bdi></> : null}</p>}
            <HeadLink href={`/shows/${encodeURIComponent(show.id)}/seasons/${encodeURIComponent(season.id)}`}>Open Season {season.number}</HeadLink>
          </div>
        )}
        {season?.arc && <p className="t-body show-arc" dir="auto">{season.arc}</p>}
        <ul className="shows-grid" role="list" aria-label={season ? `Season ${season.number} episodes` : 'Episodes'}>
          {episodes.map((e, i) => <li key={e.id}><EpisodeTile e={e} priority={i < 3} /></li>)}
          <li>{season
            ? <StartCard onClick={() => setDialog('episode', { season: season.id })} title="New episode" line={`Episode ${episodes.length + 1} of Season ${season.number}`} />
            : <StartCard onClick={() => setDialog('season')} title="Season 1" line="Start the first season" />}</li>
        </ul>
      </section>

      <section className="shows-section" id="cast" aria-labelledby="show-cast-h">
        {cast.length === 0 ? <>
          <SectionHead id="show-cast-h" title="Cast" description="Every episode uses their canonical look and voice." />
          <EmptyLine action={<Link className="btn btn-secondary btn-sm" href={hrefWith(seasonParam, { edit: 'cast' })} scroll={false}>Choose the cast</Link>}>No characters belong to this show yet.</EmptyLine>
        </> : <>
          <SectionHead id="show-cast-h" title="Cast" count={cast.length} description="Every episode uses their canonical look and voice."
            action={<HeadLink href={hrefWith(seasonParam, { edit: 'cast' })}>Change the cast</HeadLink>} />
          <ul className="show-figures" role="list">{cast.map((f) => <li key={f.id}><CastCard f={f} /></li>)}</ul>
        </>}
      </section>

      <section className="shows-section" id="world" aria-labelledby="show-world-h">
        <SectionHead id="show-world-h" title="World" count={world.length || null} description="The places every episode can film in."
          action={world.length > 0 && <HeadLink href={hrefWith(seasonParam, { edit: 'world' })}>Change the world</HeadLink>} />
        {world.length === 0 ? <EmptyLine action={<Link className="btn btn-secondary btn-sm" href={hrefWith(seasonParam, { edit: 'world' })} scroll={false}>Choose places</Link>}>No locations belong to this show yet.</EmptyLine> : (
          <ul className="show-plates" role="list">{world.map((p) => <li key={p.id}><PlateTile p={p} /></li>)}</ul>
        )}
      </section>

      <section className="shows-section" id="bible" aria-labelledby="show-bible-h">
        <SectionHead id="show-bible-h" title="Show bible" description="The facts every episode must respect."
          action={<HeadLink href={hrefWith(seasonParam, { edit: 'bible' })}>Edit the bible</HeadLink>} />
        <div className="show-bible">
          {BIBLE_PARTS.map((p) => {
            const items = show.bible?.[p.key] ?? [];
            return (
              <article key={p.key} className="card show-bible-card" aria-labelledby={`bible-${p.key}`}>
                <h3 id={`bible-${p.key}`} className="t-title">{p.title}</h3>
                {items.length ? <ul className="show-bible-list" role="list">{items.map((x, i) => <li key={i} className="t-body content-para" dir="auto">{x}</li>)}</ul>
                  : <p className="t-body show-bible-none">Nothing written yet. {p.hint}</p>}
              </article>
            );
          })}
        </div>
      </section>

      <section className="shows-section" aria-labelledby="show-details-h">
        <SectionHead id="show-details-h" title="Details" action={<HeadLink href={hrefWith(seasonParam, { edit: 'details' })}>Edit</HeadLink>} />
        <PanelCard columns={3} labelledBy="show-details-h" facts={[
          { label: 'Style', value: STYLE_LABEL[show.style] ?? show.style },
          { label: 'Language', value: LANGUAGE_LABEL[show.language] ?? show.language, sub: show.language === 'AR' && show.dialect ? dialectLabel(show.dialect) : undefined },
          { label: 'Picture shape', value: ASPECT_LABEL[show.aspect] ?? show.aspect },
          { label: 'Episode length', value: view.episodes.length ? `About ${minutes(Math.round(view.episodes.reduce((a, p) => a + p.targetSeconds, 0) / view.episodes.length))}` : 'Set per episode' },
          { label: 'Art direction', value: <span dir="auto">{show.bible?.styleNotes || 'Not written yet'}</span> },
          { label: 'Created', value: dateWords(show.createdAt) ?? '—' },
        ]} />
      </section>

      <NewSeasonDialog show={show} open={dialog === 'season'} onClose={() => setDialog(null)} />
      <NewEpisodeDialog show={show} seasonId={season?.id} open={dialog === 'episode' && Boolean(season)} onClose={() => setDialog(null)} />
      <EditShowDialog show={show} open={edit === 'details'} onClose={() => setEdit(null)} />
      <CanonDialog show={show} kind="cast" open={edit === 'cast'} onClose={() => setEdit(null)} />
      <CanonDialog show={show} kind="world" open={edit === 'world'} onClose={() => setEdit(null)} />
      <BibleDialog show={show} open={edit === 'bible'} onClose={() => setEdit(null)} />
    </div>
  );
}

/** The show page's skeletons live in ./skeletons (drawn synchronously by the shell); re-exported for the page. */
export { EpisodeGridSkeleton, ShowSkeleton } from './skeletons';
