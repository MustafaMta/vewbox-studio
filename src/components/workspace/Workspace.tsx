'use client';

import { notFound } from 'next/navigation';
import type { Production } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { ProductionWorkspace } from './ProductionWorkspace';
import { ShotWorkspace } from './ShotWorkspace';

/** The routes' entry points: a production (or one of its shots) by id, or the 404 page. `Workspace` stays exported for
 *  the production pages that still render the workspace at the production's own address until their title pages land. */
export function Workspace({ p }: { p: Production }) {
  return <ProductionWorkspace p={p} />;
}

export function ProductionRoute({ id }: { id: string | undefined }) {
  const { state } = useStudio();
  const p = state.productions.find((x) => x.id === id);
  if (!p) notFound();
  return <ProductionWorkspace p={p} />;
}

export function ShotRoute({ id, shotId }: { id: string | undefined; shotId: string | undefined }) {
  const { state } = useStudio();
  const p = state.productions.find((x) => x.id === id);
  const shot = p?.shots.find((s) => s.id === shotId);
  if (!p || !shot) notFound();
  return <ShotWorkspace key={shot.id} p={p} shot={shot} />;
}
