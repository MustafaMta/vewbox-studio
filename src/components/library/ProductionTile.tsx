'use client';

import type { Production } from '@/domain/types';
import { T } from '@/lib/copy';
import { Status, type Tone } from '@/components/ui/kit';

/** Shared bits for productions in libraries and headers: the stage as a status line. Owned by F3 until the page
 *  packages compose tiles themselves. */

const STAGE_TONE: Record<Production['stage'], Tone> = { STORY: 'neutral', CAST_AND_WORLD: 'neutral', STORYBOARD: 'info', PRODUCE: 'info', FINAL_CUT: 'warn', COMPLETE: 'ok' };

export function StageStatus({ p, className = '' }: { p: Production; className?: string }) {
  return <Status tone={STAGE_TONE[p.stage]} className={className}>{T.dyn(`stage.${p.stage}`)}</Status>;
}
