'use client';

import type { Production } from '@/domain/types';
import { FilmWorkspace } from './FilmWorkspace';
import { MusicWorkspace } from './MusicWorkspace';

/** A production opens in the workspace that fits it: a film (short or episode) or a music video. */
export function Workspace({ p }: { p: Production }) {
  return p.kind === 'MUSIC_VIDEO' ? <MusicWorkspace p={p} /> : <FilmWorkspace p={p} />;
}
