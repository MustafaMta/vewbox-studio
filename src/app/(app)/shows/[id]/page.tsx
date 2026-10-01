'use client';

import { notFound, useParams } from 'next/navigation';
import { useStudio } from '@/studio/store';
import { ShowWorkspace } from '@/components/show/ShowWorkspace';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const { state } = useStudio();
  const show = state.shows.find((s) => s.id === id);
  if (!show) notFound();
  return <ShowWorkspace show={show} />;
}
