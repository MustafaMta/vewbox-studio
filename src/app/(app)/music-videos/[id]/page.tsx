'use client';

import { notFound, useParams } from 'next/navigation';
import { useStudio } from '@/studio/store';
import { Workspace } from '@/components/workspace/Workspace';

export default function Page() {
  const params = useParams<{ id: string }>();
  const { state } = useStudio();
  const p = state.productions.find((x) => x.id === params.id);
  if (!p) notFound();
  return <Workspace p={p} />;
}
