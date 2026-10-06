'use client';

/** LEGACY SHIM (docs/DESIGN-SYSTEM-V4.md §8.2 rule 6; deleted in Q1). `VideoPlayer` is now the v4 InlinePlayer — the
 *  same props and handle — so every page that used it keeps working until its page package migrates. */

export { InlinePlayer as VideoPlayer, type PlayerHandle, type CaptionTrack } from './InlinePlayer';
export type { SyncBus } from './sync';
export { AudioPlayer } from './Controls';
