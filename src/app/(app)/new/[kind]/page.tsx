'use client';

import { notFound, useParams, useSearchParams } from 'next/navigation';
import { CreateWizard, type WizardKind } from '@/components/wizard/CreateWizard';

const KINDS: WizardKind[] = ['show', 'episode', 'short', 'music-video'];

export default function NewPage() {
  const { kind } = useParams<{ kind: string }>();
  const sp = useSearchParams();
  if (!KINDS.includes(kind as WizardKind)) notFound();
  return <CreateWizard key={kind} kind={kind as WizardKind} showId={sp.get('show') ?? undefined} seasonId={sp.get('season') ?? undefined} />;
}
