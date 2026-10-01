'use client';

import type { Production } from '@/domain/types';
import { useStudio } from '@/demo/store';
import { markStepDone, updateProduction } from '@/demo/actions';
import { showById } from '@/demo/selectors';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { Button, Notice } from '@/components/ui/kit';
import { CanonPicker } from '@/components/library/CanonPicker';

/** CAST & WORLD — who is in this production and where it happens. An episode inherits its show's people and
 *  places and can add its own. */
export function CastTab({ p }: { p: Production }) {
  const T = useT();
  const { state, update } = useStudio();
  const toast = useToast();
  const show = showById(state, p.showId);
  return (
    <div className="space-y-6">
      {show && <Notice tone="info">{T('lib.showCanon')}: {show.castIds.length} {T('label.cast').toLowerCase()} · {show.locationIds.length} {T('label.locations').toLowerCase()} {T('lib.inheritedFromShow')}.</Notice>}
      <CanonPicker castIds={p.castIds} locationIds={p.locationIds} inheritedCast={show?.castIds} inheritedLocations={show?.locationIds} style={p.style} onChange={(patch) => { update((s) => updateProduction(s, p.id, patch)); toast.ok(T('toast.saved')); }} />
      {p.stage === 'CAST_AND_WORLD' && <Button size="sm" onClick={() => { update((s) => markStepDone(s, p.id, 'CAST_AND_WORLD')); toast.ok(T('toast.saved')); }}>{T('btn.markDone')}</Button>}
    </div>
  );
}
