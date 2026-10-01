'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Style } from '@/domain/vocabulary';
import { useStudio } from '@/studio/store';
import { assetSrc } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { AddTile, Button, Modal, PickGrid } from '@/components/ui/kit';
import { Art } from '@/components/ui/cinema';
import { CharacterForm } from '@/components/character/CharacterForm';
import { LocationForm } from '@/components/location/LocationForm';
import { IconPlus } from '@/components/ui/icons';

/** WHO AND WHERE — the cast and locations of a show or a production, shown as pictures. "Create new" opens the
 *  real form inline and adds the result to the selection. `inherited` marks the ones that come from the show. */
export function CanonPicker({ castIds, locationIds, inheritedCast = [], inheritedLocations = [], style, onChange, compact, only }: {
  castIds: string[]; locationIds: string[]; inheritedCast?: string[]; inheritedLocations?: string[]; style?: Style;
  onChange: (patch: { castIds?: string[]; locationIds?: string[] }) => void; compact?: boolean; only?: 'cast' | 'locations';
}) {
  const T = useT();
  const { state } = useStudio();
  const chosenCast = state.characters.filter((c) => castIds.includes(c.id) || inheritedCast.includes(c.id));
  const chosenLocs = state.locations.filter((l) => locationIds.includes(l.id) || inheritedLocations.includes(l.id));
  return (
    <div className={`grid gap-6 ${compact || only ? '' : 'lg:grid-cols-2'}`}>
      {only !== 'locations' && <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="h3">{T('label.cast')}<span className="ms-2 text-sm font-normal text-faint num">{chosenCast.length}</span></h3>
          <Picker kind="cast" style={style} selected={castIds} locked={inheritedCast} onChange={(ids) => onChange({ castIds: ids })} />
        </div>
        {chosenCast.length === 0 ? <p className="panel border-dashed px-4 py-6 text-center text-sm text-muted">{T('empty.cast')}</p> : (
          <ul className={`grid gap-4 ${only ? 'grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))]'}`}>
            {chosenCast.map((c) => (
              <li key={c.id}><Link href={`/characters/${c.id}`} className="poster-link group block">
                <Art src={assetSrc(state, c.portraitAssetId)} ratio="portrait" title={c.name} />
                <span className="mt-2 block truncate text-sm font-medium" dir="auto">{c.name}</span>
                <span className="block truncate text-xs text-muted">{inheritedCast.includes(c.id) && !castIds.includes(c.id) ? T('lib.inheritedFromShow') : c.role}</span>
              </Link></li>
            ))}
          </ul>
        )}
      </div>}
      {only !== 'cast' && <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="h3">{T('label.locations')}<span className="ms-2 text-sm font-normal text-faint num">{chosenLocs.length}</span></h3>
          <Picker kind="locations" style={style} selected={locationIds} locked={inheritedLocations} onChange={(ids) => onChange({ locationIds: ids })} />
        </div>
        {chosenLocs.length === 0 ? <p className="panel border-dashed px-4 py-6 text-center text-sm text-muted">{T('empty.locationsIn')}</p> : (
          <ul className={`grid gap-4 ${only ? 'grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]'}`}>
            {chosenLocs.map((l) => (
              <li key={l.id}><Link href={`/locations/${l.id}`} className="poster-link group block">
                <Art src={assetSrc(state, l.masterAssetId)} ratio="wide" title={l.name} />
                <span className="mt-2 block truncate text-sm font-medium" dir="auto">{l.name}</span>
                <span className="block truncate text-xs text-muted">{inheritedLocations.includes(l.id) && !locationIds.includes(l.id) ? T('lib.inheritedFromShow') : l.kind === 'INTERIOR' ? T('label.interior') : T('label.exterior')}</span>
              </Link></li>
            ))}
          </ul>
        )}
      </div>}
    </div>
  );
}

/** The picker dialog: every character or location as a checkable picture, plus "Create new" which opens the form
 *  inside the same dialog and selects what it creates. */
export function Picker({ kind, style, selected, locked = [], onChange, label }: { kind: 'cast' | 'locations'; style?: Style; selected: string[]; locked?: string[]; onChange: (ids: string[]) => void; label?: string }) {
  const T = useT();
  const { state } = useStudio();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<string[]>(selected);
  const items = kind === 'cast'
    ? state.characters.map((c) => ({ id: c.id, label: c.name, labelAr: c.nameAr, src: assetSrc(state, c.portraitAssetId), sub: c.role }))
    : state.locations.map((l) => ({ id: l.id, label: l.name, labelAr: l.nameAr, src: assetSrc(state, l.masterAssetId), sub: l.kind === 'INTERIOR' ? T('label.interior') : T('label.exterior') }));
  const toggle = (id: string) => { if (locked.includes(id)) return; setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id])); };
  const title = label ?? (kind === 'cast' ? T('label.cast') : T('label.locations'));
  return (
    <Modal size="lg" title={title} trigger={(open) => <Button size="sm" icon={<IconPlus />} onClick={() => { setDraft(selected); setCreating(false); open(); }}>{kind === 'cast' ? T('lib.addCharacter') : T('lib.addLocation')}</Button>}>
      {(close) => creating ? (
        <div>
          <Button variant="ghost" size="sm" className="mb-3" onClick={() => setCreating(false)}>← {T('btn.back')}</Button>
          {kind === 'cast'
            ? <CharacterForm defaultStyle={style} onSaved={(id) => { setDraft((d) => [...d, id]); setCreating(false); }} onCancel={() => setCreating(false)} />
            : <LocationForm defaultStyle={style} onSaved={(id) => { setDraft((d) => [...d, id]); setCreating(false); }} onCancel={() => setCreating(false)} />}
        </div>
      ) : (
        <div className="space-y-4">
          <PickGrid items={items} selected={[...draft, ...locked]} onToggle={toggle} ratio={kind === 'cast' ? 'aspect-[4/5]' : 'aspect-video'} extra={<AddTile onClick={() => setCreating(true)} ratio={kind === 'cast' ? 'aspect-[4/5]' : 'aspect-video'}><IconPlus aria-hidden className="size-5" />{T('btn.createNew')}</AddTile>} />
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={close}>{T('btn.cancel')}</Button><Button variant="primary" onClick={() => { onChange(draft); close(); }}>{T('btn.done')}</Button></div>
        </div>
      )}
    </Modal>
  );
}
