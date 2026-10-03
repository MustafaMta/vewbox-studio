'use client';

import type { Production, Show } from '@/domain/types';
import { STAGES } from '@/domain/vocabulary';
import { useStudio } from '@/studio/store';
import { stageIndex } from '@/studio/selectors';
import { useShell } from '@/components/shell/context';
import { showCards, waitingProductions } from '@/components/show/model';
import { ShowTile } from '@/components/show/parts';

/** A show as a catalogue tile (P-Shows): 16:9 key art, the name, the seasons and episodes, the status last — the same
 *  tile /shows draws (src/components/show/parts.tsx ShowTile), for any page that lists a show. */
export function ShowCard({ show, priority }: { show: Show; priority?: boolean }) {
  const { state } = useStudio();
  const { decisions } = useShell();
  const card = showCards({ ...state, shows: [show] }, waitingProductions(decisions.items))[0];
  return <ShowTile c={card} priority={priority} />;
}

/** A stage's rank as a fraction. Kept only for the library/Cards.tsx barrel; no page draws it (a stage is shown in
 *  words and the stage meter, never as a percentage). Goes with the barrel. */
export const stageFraction = (p: Production) => stageIndex(p.stage) / (STAGES.length - 1);
