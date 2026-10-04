'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useStudio } from '@/studio/store';
import { productionHref } from '@/studio/selectors';
import { EpisodeLobby } from '@/components/show/EpisodeLobby';
import { NotInStudio } from '@/components/show/NotInStudio';

/** /shows/[id]/seasons/[s]/episodes/[p] — the episode's lobby (src/components/show/EpisodeLobby.tsx). Its production
 *  workspace lives at …/production; an older link that names a workspace tab (`?tab=storyboard`) goes straight there. */
export default function Page() {
  const params = useParams<{ id: string; productionId: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const { state } = useStudio();
  const p = state.productions.find((x) => x.id === decodeURIComponent(params.productionId));
  const show = state.shows.find((s) => s.id === (p?.showId ?? decodeURIComponent(params.id)));
  const season = state.seasons.find((s) => s.id === p?.seasonId);
  const tab = sp.get('tab');
  useEffect(() => { if (p && tab) router.replace(`${productionHref(p)}/production?${sp.toString()}`); }, [p, tab, sp, router]);
  if (!p || !show) return <NotInStudio what="episode" back={show ? { href: `/shows/${encodeURIComponent(show.id)}`, label: `Back to ${show.title}` } : { href: '/shows', label: 'Back to Shows' }} />;
  if (tab) return null;
  return <EpisodeLobby show={show} season={season} p={p} />;
}
