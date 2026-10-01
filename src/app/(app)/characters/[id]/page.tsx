'use client';

import { notFound, useParams } from 'next/navigation';
import { useStudio } from '@/studio/store';
import { CharacterPage } from '@/components/character/CharacterPage';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const { state } = useStudio();
  const c = state.characters.find((x) => x.id === id);
  if (!c) notFound();
  return <CharacterPage c={c} />;
}
