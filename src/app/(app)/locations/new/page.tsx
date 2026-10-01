'use client';

import { useRouter } from 'next/navigation';
import { useT } from '@/components/ui/locale';
import { Crumbs } from '@/components/ui/nav';
import { LibraryHeader } from '@/components/library/Library';
import { LocationForm } from '@/components/location/LocationForm';

export default function NewLocationPage() {
  const T = useT();
  const router = useRouter();
  return (
    <div className="mx-auto max-w-3xl">
      <Crumbs items={[{ href: '/locations', label: T('nav.locations') }, { label: T('lib.addLocation') }]} />
      <LibraryHeader title={T('lib.addLocation')} />
      <LocationForm onSaved={(id) => router.push(`/locations/${id}`)} onCancel={() => router.push('/locations')} />
    </div>
  );
}
