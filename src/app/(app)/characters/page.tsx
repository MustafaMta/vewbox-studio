'use client';

import { Suspense } from 'react';
import { CastDirectory, CharactersSkeleton } from '@/components/character/CastDirectory';

/** CHARACTERS — the casting directory: src/components/character/CastDirectory.tsx. Search and filters live in the URL
 *  (useCatalogueParams), so the directory needs a Suspense boundary; its fallback is the page's own skeleton. */
export default function CharactersPage() {
  return <Suspense fallback={<CharactersSkeleton />}><CastDirectory /></Suspense>;
}
