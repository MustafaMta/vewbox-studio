'use client';

import { Suspense } from 'react';
import { CreateCharacter } from '@/components/character/create/CreateCharacter';
import { CreateCharacterSkeleton } from '@/components/character/create/CreateCharacterSkeleton';

/** A NEW CHARACTER — see src/components/character/create/CreateCharacter.tsx. `?production=` / `?show=` puts the
 *  character into that world. The fallback is the page's own skeleton (the route's, too: route-skeletons.tsx). */
export default function NewCharacterPage() {
  return <Suspense fallback={<CreateCharacterSkeleton />}><CreateCharacter /></Suspense>;
}
