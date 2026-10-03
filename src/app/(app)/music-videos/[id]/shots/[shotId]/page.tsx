'use client';

import { useParams } from 'next/navigation';
import { ShotRoute } from '@/components/workspace/Workspace';

/** One shot's workspace (src/components/workspace/ShotWorkspace.tsx). */
export default function Page() {
  const params = useParams<{ id: string; shotId: string }>();
  return <ShotRoute id={params.id} shotId={params.shotId} />;
}
