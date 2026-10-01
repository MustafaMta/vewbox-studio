'use client';

import { useRouter } from 'next/navigation';
import { useT } from '@/components/ui/locale';
import { Crumbs } from '@/components/ui/nav';
import { LibraryHeader } from '@/components/library/Library';
import { CharacterForm } from '@/components/character/CharacterForm';

export default function NewCharacterPage() {
  const T = useT();
  const router = useRouter();
  return (
    <div className="mx-auto max-w-3xl">
      <Crumbs items={[{ href: '/characters', label: T('nav.characters') }, { label: T('lib.addCharacter') }]} />
      <LibraryHeader title={T('lib.addCharacter')} />
      <CharacterForm onSaved={(id) => router.push(`/characters/${id}`)} onCancel={() => router.push('/characters')} />
    </div>
  );
}
