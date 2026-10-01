'use client';

import { notFound, useParams } from 'next/navigation';
import { useStudio } from '@/demo/store';
import { ShotEditor } from '@/components/workspace/ShotEditor';

export default function Page() {
  const params = useParams<{ id: string; shotId: string }>();
  const { state } = useStudio();
  const p = state.productions.find((x) => x.id === params.id);
  const shot = p?.shots.find((s) => s.id === params.shotId);
  if (!p || !shot) notFound();
  return <ShotEditor p={p} shot={shot} />;
}
