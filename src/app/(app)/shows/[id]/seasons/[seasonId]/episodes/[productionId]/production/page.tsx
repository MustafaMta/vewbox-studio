'use client';

import { useParams } from 'next/navigation';
import { ProductionRoute } from '@/components/workspace/Workspace';

/** The production workspace: the map and the stage tabs (src/components/workspace/ProductionWorkspace.tsx). */
export default function Page() {
  const params = useParams<{ productionId: string }>();
  return <ProductionRoute id={params.productionId} />;
}
