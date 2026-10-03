'use client';

import { useParams } from 'next/navigation';
import { useStudio } from '@/studio/store';
import { SeasonPage } from '@/components/show/SeasonPage';
import { NotInStudio } from '@/components/show/NotInStudio';

/** /shows/[id]/seasons/[seasonId] — one season's title page (src/components/show/SeasonPage.tsx). */
export default function Page() {
  const { id, seasonId } = useParams<{ id: string; seasonId: string }>();
  const { state } = useStudio();
  const show = state.shows.find((s) => s.id === decodeURIComponent(id));
  const season = state.seasons.find((s) => s.id === decodeURIComponent(seasonId) && s.showId === show?.id);
  if (!show) return <NotInStudio what="show" back={{ href: '/shows', label: 'Back to Shows' }} />;
  if (!season) return <NotInStudio what="season" back={{ href: `/shows/${encodeURIComponent(show.id)}`, label: `Back to ${show.title}` }} />;
  return <SeasonPage show={show} season={season} />;
}
