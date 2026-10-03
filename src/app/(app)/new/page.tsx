'use client';

import { useStudio } from '@/studio/store';
import { assetSrc, primaryImageSrc } from '@/studio/selectors';
import { T } from '@/lib/copy';
import { PageHeader } from '@/components/ui/page';
import { StartCard } from '@/components/library/StartCard';
import { IconCharacters, IconLocations, IconMusicVideos, IconShorts, IconShows } from '@/components/ui/icons';

/** NEW… — the five things the studio starts, as pictures: a show, a short, a music video, a character, a location.
 *  Choosing one opens its own page. */
export default function NewPage() {
  const { state } = useStudio();
  const art = (id: string) => assetSrc(state, id);
  const firstPortrait = state.characters.map((c) => primaryImageSrc(state, c)).find(Boolean);
  const firstPlate = state.locations.map((l) => assetSrc(state, l.masterAssetId)).find(Boolean);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={T('nav.new')} subtitle={T('new.lead')} back={{ href: '/shows', label: T('nav.shows') }} />
      <div className="grid gap-4 md:grid-cols-3">
        <StartCard href="/new/show" icon={<IconShows />} title={T('wizard.newShow')} hint={T('empty.shows.hint')} art={art('cover-last-sip')} />
        <StartCard href="/new/short" icon={<IconShorts />} title={T('wizard.newShort')} hint={T('empty.shorts.hint')} art={art('cover-paper-boats')} />
        <StartCard href="/new/music-video" icon={<IconMusicVideos />} title={T('wizard.newMusicVideo')} hint={T('empty.musicVideos.hint')} art={art('cover-river-lights')} />
        <StartCard href="/characters/new" icon={<IconCharacters />} title={T('lib.addCharacter')} hint={T('new.character.hint')} art={firstPortrait} />
        <StartCard href="/locations/new" icon={<IconLocations />} title={T('lib.addLocation')} hint={T('new.location.hint')} art={firstPlate} />
      </div>
    </div>
  );
}
