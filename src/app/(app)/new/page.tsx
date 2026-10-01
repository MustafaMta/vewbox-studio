'use client';

import { useStudio } from '@/demo/store';
import { assetSrc } from '@/demo/selectors';
import { useT } from '@/components/ui/locale';
import { PageHeader } from '@/components/ui/page';
import { StartCard } from '@/components/library/Cards';
import { IconMusicVideos, IconShorts, IconShows } from '@/components/ui/icons';

/** NEW PRODUCTION — the three things the studio makes, as pictures. Choosing one opens its wizard. */
export default function NewProductionPage() {
  const T = useT();
  const { state } = useStudio();
  const art = (id: string) => assetSrc(state, id);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={T('nav.newProduction')} subtitle={T('new.lead')} back={{ href: '/', label: T('nav.home') }} />
      <div className="grid gap-4 md:grid-cols-3">
        <StartCard href="/new/show" icon={<IconShows />} title={T('wizard.newShow')} hint={T('empty.shows.hint')} art={art('cover-last-sip')} />
        <StartCard href="/new/short" icon={<IconShorts />} title={T('wizard.newShort')} hint={T('empty.shorts.hint')} art={art('cover-paper-boats')} />
        <StartCard href="/new/music-video" icon={<IconMusicVideos />} title={T('wizard.newMusicVideo')} hint={T('empty.musicVideos.hint')} art={art('cover-river-lights')} />
      </div>
    </div>
  );
}
