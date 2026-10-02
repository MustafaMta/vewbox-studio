'use client';

import { useSearchParams } from 'next/navigation';
import { useStudio } from '@/studio/store';
import { useT } from '@/components/ui/locale';
import { TabBar } from '@/components/ui/kit';
import CharactersPage from '../characters/page';
import LocationsPage from '../locations/page';
import AssetsPage from '../assets/page';

/** THE LIBRARY — the canonical cast, the places and every file, as three tabs of one area. Each tab is the full
 *  library page it always was (the direct routes still work and are what the tabs render). */
export default function LibraryPage() {
  const T = useT();
  const { state } = useStudio();
  const sp = useSearchParams();
  const tab = (sp.get('tab') ?? 'characters') as 'characters' | 'locations' | 'assets';
  return (
    <>
      <TabBar ariaLabel={T('library.title')} current={tab} hrefFor={(id) => `/library?tab=${id}`} className="mb-8" tabs={[{ id: 'characters', label: T('nav.characters'), count: state.characters.length }, { id: 'locations', label: T('nav.locations'), count: state.locations.length }, { id: 'assets', label: T('nav.assets'), count: state.assets.length }]} />
      {tab === 'characters' ? <CharactersPage /> : tab === 'locations' ? <LocationsPage /> : <AssetsPage />}
    </>
  );
}
