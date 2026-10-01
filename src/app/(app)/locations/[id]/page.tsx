'use client';

import { notFound, useParams } from 'next/navigation';
import { useStudio } from '@/studio/store';
import { LocationPage } from '@/components/location/LocationPage';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const { state } = useStudio();
  const l = state.locations.find((x) => x.id === id);
  if (!l) notFound();
  return <LocationPage l={l} />;
}
