'use client';

import { useState } from 'react';
import type { Style } from '@/domain/vocabulary';
import { useStudio } from '@/studio/store';
import { musicVideos, search } from '@/studio/selectors';
import { T } from '@/lib/copy';
import { LinkButton } from '@/components/ui/kit';
import { Empty } from '@/components/ui/cinema';
import { PageHeader } from '@/components/ui/page';
import { LibraryBar, NoMatches } from '@/components/library/Library';
import { MusicVideoCard } from '@/components/library/MusicVideoCard';
import { ProductionMenu, sortItems } from '@/components/library/ProductionTile';
import { IconMusicVideos, IconPlus } from '@/components/ui/icons';

/** MUSIC VIDEOS — a record shelf: square art, the song and who performs it, a play button on every sleeve. */
export default function MusicVideosPage() {
  const { state } = useStudio();
  const [q, setQ] = useState(''); const [style, setStyle] = useState<Style | ''>(''); const [sort, setSort] = useState<'recent' | 'title'>('recent');
  const all = musicVideos(state);
  const items = sortItems(search(all, q).filter((p) => !style || p.style === style), sort);
  const add = <LinkButton href="/new/music-video" variant="primary" icon={<IconPlus />}>{T('lib.addMusicVideo')}</LinkButton>;
  return (
    <>
      <PageHeader title={T('nav.musicVideos')} subtitle={T('empty.musicVideos.hint')} action={all.length > 0 ? add : undefined} />
      {all.length === 0 ? <Empty icon={<IconMusicVideos />} title={T('empty.musicVideos')} hint={T('empty.musicVideos.hint')} action={add} /> : (
        <>
          <LibraryBar q={q} onQ={setQ} style={style} onStyle={setStyle} sort={sort} onSort={setSort} />
          {items.length === 0 ? <NoMatches onClear={() => { setQ(''); setStyle(''); }} /> : (
            <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{items.map((p) => <MusicVideoCard key={p.id} p={p} menu={<ProductionMenu p={p} />} />)}</ul>
          )}
        </>
      )}
    </>
  );
}
