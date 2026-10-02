'use client';

import { Suspense } from 'react';
import { CreateCharacter } from '@/components/character/create/CreateCharacter';

/** A NEW CHARACTER — see src/components/character/create/CreateCharacter.tsx. `?production=` / `?show=` puts the
 *  character into that world. */
export default function NewCharacterPage() {
  return <Suspense><CreateCharacter /></Suspense>;
}
