'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import type { Season, Show } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { useShell } from '@/components/shell/context';
import { useToast } from '@/components/ui/toast';
import { MenuButton, MenuItem, MenuSeparator, Skeleton, SkeletonRegion, useConfirm } from '@/components/ui/kit';
import { IconChevronLeft, IconDelete, IconEdit, IconPlus } from '@/components/ui/icons';
import { episodeCard, episodesOfSeason, nameLang, plural, seasonsOfShow, timeOf, waitingProductions } from './model';
import { EditSeasonDialog, NewEpisodeDialog } from './dialogs';
import { StartCard } from '@/components/media';
import { EpisodeTile } from './parts';
import { EpisodeGridSkeleton } from './ShowPage';
import { useQueryParam } from './url';

/** ONE SEASON — the season's title page: the other seasons as chips, the season's name and arc, its episodes as 16:9
 *  stills (number, title, two lines, the stage meter) ending with New episode. Edit and Delete sit behind More. */
export function SeasonPage({ show, season }: { show: Show; season: Season }) {
  const { state, act } = useStudio();
  const { decisions } = useShell();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const waiting = useMemo(() => waitingProductions(decisions.items), [decisions]);
  const seasons = seasonsOfShow(state, show.id);
  const eps = episodesOfSeason(state, season.id);
  const cards = eps.map((p) => episodeCard(state, p, waiting));
  const [dialog, setDialog, hrefWith] = useQueryParam('new');
  const [edit, setEdit] = useQueryParam('edit');
  const showHref = `/shows/${encodeURIComponent(show.id)}`;
  const finished = eps.filter((p) => p.stage === 'COMPLETE').length;
  const started = timeOf(season.createdAt);
  const slate = [plural(eps.length, 'episode'), eps.length ? `${finished} finished` : null, started ? `Started ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(started)}` : null].filter(Boolean) as string[];
  const named = season.title && season.title !== `Season ${season.number}`;
  const remove = async () => {
    if (!(await confirm({ title: `Delete Season ${season.number}?`, body: eps.length ? `Its ${eps.length === 1 ? 'episode is' : `${eps.length} episodes are`} deleted with it.` : 'It has no episodes.', keep: 'The show, its cast and its world stay.', confirmLabel: `Delete Season ${season.number}` }))) return;
    act('deleteSeason', season.id);
    toast.ok(`Season ${season.number} deleted`);
    router.push(showHref);
  };
  return (
    <div className="shows season-page">
      <Link className="page-back" href={showHref}><IconChevronLeft aria-hidden /><bdi lang={nameLang(show.title)}>{show.title}</bdi></Link>
      {seasons.length > 1 && (
        <nav className="shows-chips season-chips" aria-label="Seasons">
          {seasons.map((s) => <Link key={s.id} className="chip" aria-current={s.id === season.id ? 'true' : undefined} href={`${showHref}/seasons/${encodeURIComponent(s.id)}`}>Season {s.number}<span className="count">{episodesOfSeason(state, s.id).length}</span></Link>)}
        </nav>
      )}
      <header className="shows-page-head">
        <div className="shows-page-title">
          <p className="t-label">Season {season.number}</p>
          <h1 className="t-page"><bdi lang={nameLang(season.title)}>{named ? season.title : `Season ${season.number}`}</bdi></h1>
          {season.arc && <p className="t-lead" dir="auto">{season.arc}</p>}
          <p className="t-meta t-facts">{slate.map((s, i) => <span key={i}>{s}</span>)}</p>
        </div>
        <div className="shows-page-acts">
          <MenuButton label={`More for Season ${season.number}`} iconOnly variant="secondary" align="end">
            <MenuItem icon={<IconEdit aria-hidden />} onClick={() => setEdit('season')}>Edit the season</MenuItem>
            <MenuSeparator />
            <MenuItem icon={<IconDelete aria-hidden />} tone="danger" onClick={() => void remove()}>Delete the season</MenuItem>
          </MenuButton>
          <Link className="btn btn-primary" href={hrefWith('episode')} scroll={false}><IconPlus aria-hidden />New episode</Link>
        </div>
      </header>
      <section className="shows-section shows-section-first" aria-label={`Season ${season.number} episodes`}>
        <ul className="shows-grid" role="list">
          {cards.map((e, i) => <li key={e.id}><EpisodeTile e={e} priority={i < 3} /></li>)}
          <li><StartCard onClick={() => setDialog('episode')} title="New episode" line={`Episode ${cards.length + 1} of Season ${season.number}`} /></li>
        </ul>
      </section>
      <NewEpisodeDialog show={show} seasonId={season.id} open={dialog === 'episode'} onClose={() => setDialog(null)} />
      <EditSeasonDialog season={season} open={edit === 'season'} onClose={() => setEdit(null)} />
    </div>
  );
}

/** A season page while the studio's first snapshot loads: the back link, the head and a row of episode tiles. */
export function SeasonSkeleton() {
  return (
    <SkeletonRegion label="Opening the season…" className="shows season-page shows-skeleton">
      <div className="page-back"><Skeleton.Line width="8rem" /></div>
      <div className="shows-page-head">
        <div className="shows-page-title">
          <div className="t-label"><Skeleton.Line width="4rem" /></div>
          <div className="t-page"><Skeleton.Line size="title" width="14rem" /></div>
          <div className="t-meta"><Skeleton.Line width="12rem" /></div>
        </div>
        <div className="shows-page-acts"><Skeleton.Block width={40} height={40} radius="pill" /><Skeleton.Block width={136} height={40} radius="pill" /></div>
      </div>
      <div className="shows-section shows-section-first"><EpisodeGridSkeleton /></div>
    </SkeletonRegion>
  );
}