'use client';

import { notFound, useParams } from 'next/navigation';
import { useStudio } from '@/studio/store';
import { ShotEditor } from '@/components/workspace/ShotEditor';

export default function Page() {
  const params = useParams<{ productionId: string; shotId: string }>();
  const { state } = useStudio();
  const p = state.productions.find((x) => x.id === params.productionId);
  const shot = p?.shots.find((s) => s.id === params.shotId);
  if (!p || !shot) notFound();
  return <ShotEditor p={p} shot={shot} />;
}
