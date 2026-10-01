'use client';

import { useState } from 'react';
import type { Style } from '@/domain/vocabulary';
import { STAGES } from '@/domain/vocabulary';
import type { Production } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { search, shorts } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { LinkButton, Select } from '@/components/ui/kit';
import { Empty } from '@/components/ui/cinema';
import { PageHeader } from '@/components/ui/page';
import { LibraryBar, NoMatches } from '@/components/library/Library';
import { ShortCard } from '@/components/library/Cards';
import { ProductionMenu, sortItems } from '@/components/library/ProductionTile';
import { IconPlus, IconShorts } from '@/components/ui/icons';

/** SHORTS — a film library: posters, the length on the art, the cast and where each film stands. */
export default function ShortsPage() {
  const T = useT();
  const { state } = useStudio();
  const [q, setQ] = useState(''); const [style, setStyle] = useState<Style | ''>(''); const [stage, setStage] = useState<Production['stage'] | ''>(''); const [sort, setSort] = useState<'recent' | 'title'>('recent');
  const all = shorts(state);
  const items = sortItems(search(all, q).filter((p) => (!style || p.style === style) && (!stage || p.stage === stage)), sort);
  const add = <LinkButton href="/new/short" variant="primary" icon={<IconPlus />}>{T('lib.addShort')}</LinkButton>;
  return (
    <>
      <PageHeader title={T('nav.shorts')} subtitle={T('empty.shorts.hint')} action={all.length > 0 ? add : undefined} />
      {all.length === 0 ? <Empty icon={<IconShorts />} title={T('empty.shorts')} hint={T('empty.shorts.hint')} action={add} /> : (
        <>
          <LibraryBar q={q} onQ={setQ} style={style} onStyle={setStyle} sort={sort} onSort={setSort} extra={<Select aria-label={T('lib.filterStage')} value={stage} onChange={(e) => setStage(e.target.value as Production['stage'] | '')} placeholder={`${T('lib.filterStage')}: ${T('label.all')}`} options={STAGES.map((s) => ({ value: s, label: T.dyn(`stage.${s}`) }))} className="w-auto" />} />
          {items.length === 0 ? <NoMatches onClear={() => { setQ(''); setStyle(''); setStage(''); }} /> : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">{items.map((p) => <ShortCard key={p.id} p={p} menu={<ProductionMenu p={p} />} />)}</ul>
          )}
        </>
      )}
    </>
  );
}
