/** THE SYNC BUS — two or more media elements that share one playhead (docs/DESIGN-SYSTEM-V4.md §5.12, §5.13): the
 *  song and its video (Song ⇄ Video keeps the playhead), the two sides of a comparison, a reel and its strip. Each
 *  member emits what it did, with its own id, and applies what the others did. The bus remembers the last event, so
 *  a member that mounts later (the video, after switching) starts from the shared playhead. */

export type SyncEvent = { type: 'play' | 'pause' | 'seek'; time: number; from: string };
export interface SyncBus { on: (fn: (e: SyncEvent) => void) => () => void; emit: (e: SyncEvent) => void; last?: () => SyncEvent | null }

export function createSyncBus(): Required<SyncBus> {
  const fns = new Set<(e: SyncEvent) => void>();
  let last: SyncEvent | null = null;
  return {
    on: (fn) => { fns.add(fn); return () => { fns.delete(fn); }; },
    emit: (e) => { last = e; for (const fn of [...fns]) fn(e); },
    last: () => last,
  };
}

/** Song ⇄ Video (§5.13): hand the playhead from the side being left to the side being shown. The leaving side
 *  pauses; the arriving side seeks to the same second, and plays only if the leaving side was playing. */
export function handOff(from: { time: number; playing: boolean; pause: () => void }, to: { seek: (t: number) => void; play: () => void }): number {
  const t = Number.isFinite(from.time) && from.time > 0 ? from.time : 0;
  const wasPlaying = from.playing;
  from.pause();
  to.seek(t);
  if (wasPlaying) to.play();
  return t;
}
