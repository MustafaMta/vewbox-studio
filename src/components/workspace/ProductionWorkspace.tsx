'use client';

import { useSearchParams } from 'next/navigation';
import type { Production } from '@/domain/types';
import { useStudioGate } from './gate';
import { tabFrom } from './model';
import { WorkspaceShell } from './WorkspaceShell';
import { ProductionMap } from './ProductionMap';
import { StoryTab } from './tabs/StoryTab';
import { CastTab, PerformersTab } from './tabs/PerformersTab';
import { SongLyricsTab } from './tabs/SongLyricsTab';
import { VisualStoryTab } from './tabs/VisualStoryTab';
import { StoryboardTab } from './tabs/StoryboardTab';
import { ProduceTab } from './tabs/ProduceTab';
import { FinalCutTab } from './tabs/FinalCutTab';

/** THE PRODUCTION WORKSPACE at `…/production` (docs/DESIGN-SYSTEM-V5.md §8.10): the map by default, and the stage tabs
 *  the pipeline pills open (`?tab=story|cast|song|performers|visual|storyboard|produce|final`; the names of the old
 *  tabbed pages still land on the same work). One production, one room: the outline stays on the start side. */
export function ProductionWorkspace({ p }: { p: Production }) {
  const search = useSearchParams();
  const tab = tabFrom(p, search.get('tab'));
  const gate = useStudioGate();
  return (
    <WorkspaceShell p={p} tab={tab} gate={gate} view="map">
      {tab === 'map' && <ProductionMap p={p} gate={gate} />}
      {tab === 'story' && <StoryTab p={p} gate={gate} />}
      {tab === 'cast' && <CastTab p={p} />}
      {tab === 'song' && <SongLyricsTab p={p} gate={gate} />}
      {tab === 'performers' && <PerformersTab p={p} gate={gate} />}
      {tab === 'visual' && <VisualStoryTab p={p} gate={gate} />}
      {tab === 'storyboard' && <StoryboardTab p={p} gate={gate} />}
      {tab === 'produce' && <ProduceTab p={p} gate={gate} />}
      {tab === 'final' && <FinalCutTab p={p} gate={gate} />}
    </WorkspaceShell>
  );
}
