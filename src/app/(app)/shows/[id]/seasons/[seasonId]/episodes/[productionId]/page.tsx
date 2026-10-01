'use client';

import { notFound, useParams } from 'next/navigation';
import { useStudio } from '@/demo/store';
import { Workspace } from '@/components/workspace/Workspace';

export default function Page() {
  const params = useParams<{ productionId: string }>();
  const { state } = useStudio();
  const p = state.productions.find((x) => x.id === params.productionId);
  if (!p) notFound();
  return <Workspace p={p} />;
}
