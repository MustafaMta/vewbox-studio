'use client';

import { notFound, useParams } from 'next/navigation';
import { CreateFlow } from '@/components/wizard/CreateFlow';
import { isCreateKind } from '@/components/wizard/model';

/** NEW SHOW · SEASON · EPISODE · SHORT · MUSIC VIDEO — src/components/wizard/CreateFlow.tsx (`?mode=auto|manual`,
 *  `?show=`, `?season=`, `?idea=`). */
export default function NewKindPage() {
  const { kind } = useParams<{ kind: string }>();
  if (!isCreateKind(kind)) notFound();
  return <CreateFlow key={kind} kind={kind} />;
}
