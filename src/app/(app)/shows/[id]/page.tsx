'use client';

import { useParams } from 'next/navigation';
import { useStudio } from '@/studio/store';
import { ShowPage } from '@/components/show/ShowPage';
import { NotInStudio } from '@/components/show/NotInStudio';

/** /shows/[id] — one show's title page (src/components/show/ShowPage.tsx). */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const { state } = useStudio();
  const show = state.shows.find((s) => s.id === decodeURIComponent(id));
  if (!show) return <NotInStudio what="show" back={{ href: '/shows', label: 'Back to Shows' }} />;
  return <ShowPage show={show} />;
}
