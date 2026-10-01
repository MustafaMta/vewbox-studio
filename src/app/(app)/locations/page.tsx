'use client';

import { useState } from 'react';
import { useStudio } from '@/studio/store';
import { search } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import type { Style } from '@/domain/vocabulary';
import { LinkButton, Select } from '@/components/ui/kit';
import { Empty } from '@/components/ui/cinema';
import { PageHeader } from '@/components/ui/page';
import { LibraryBar, NoMatches } from '@/components/library/Library';
import { sortItems } from '@/components/library/ProductionTile';
import { LocationCard } from '@/components/library/Cards';
import { IconLocations, IconPlus } from '@/components/ui/icons';

/** LOCATIONS — wide plates that say what each place is; one action: Add location. */
export default function LocationsPage() {
  const T = useT();
  const { state } = useStudio();
  const [q, setQ] = useState(''); const [style, setStyle] = useState<Style | ''>(''); const [kind, setKind] = useState<'' | 'INTERIOR' | 'EXTERIOR'>(''); const [sort, setSort] = useState<'recent' | 'title'>('title');
  const items = sortItems(search(state.locations, q).filter((l) => (!style || l.style === style) && (!kind || l.kind === kind)), sort);
  const add = <LinkButton href="/locations/new" variant="primary" icon={<IconPlus />}>{T('lib.addLocation')}</LinkButton>;
  return (
    <>
      <PageHeader title={T('nav.locations')} subtitle={T('loc.libraryLead')} action={state.locations.length > 0 ? add : undefined} />
      {state.locations.length === 0 ? <Empty icon={<IconLocations />} title={T('empty.locations')} hint={T('loc.libraryLead')} action={add} /> : (
        <>
          <LibraryBar q={q} onQ={setQ} style={style} onStyle={setStyle} sort={sort} onSort={setSort} extra={<Select aria-label={T('label.kind')} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} placeholder={`${T('label.kind')}: ${T('label.all')}`} options={[{ value: 'INTERIOR', label: T('label.interior') }, { value: 'EXTERIOR', label: T('label.exterior') }]} className="w-auto" />} />
          {items.length === 0 ? <NoMatches onClear={() => { setQ(''); setStyle(''); setKind(''); }} /> : <ul className="grid-wide">{items.map((l) => <LocationCard key={l.id} l={l} />)}</ul>}
        </>
      )}
    </>
  );
}
