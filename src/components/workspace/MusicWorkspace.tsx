import type { Production } from '@/domain/types';
import type { Track } from '@/components/players/PlayerProvider';

/** A music video's song as the studio's one player track (used by the Song and lyrics pane and the catalogue's sleeve
 *  tiles). The music video's workspace itself is ProductionWorkspace with the music tabs. */
export function trackOf(p: Production, src: string | undefined, artworkSrc?: string): Track | null {
  if (!p.song || !src) return null;
  return { id: `song-${p.id}`, src, title: p.song.title || p.title, subtitle: p.artist, artworkSrc, duration: p.song.durationSeconds };
}
