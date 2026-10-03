'use client';

import { notFound, useParams } from 'next/navigation';
import { useStudio } from '@/studio/store';
import { ShortPage } from '@/components/film/ShortPage';

/** A SHORT'S TITLE PAGE: src/components/film/ShortPage.tsx. The production workspace (making and changing the film)
 *  lives at /shorts/[id]/production. */
export default function Page() {
  const params = useParams<{ id: string }>();
  const { state } = useStudio();
  const p = state.productions.find((x) => x.id === params.id && x.kind === 'SHORT');
  if (!p) notFound();
  return <ShortPage p={p} />;
}
