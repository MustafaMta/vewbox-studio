'use client';

import { useParams } from 'next/navigation';
import { MusicVideo } from '@/components/music/MusicVideo';

/** /music-videos/[id] — the music video's title page, song first (src/components/music/MusicVideo.tsx). Work on it
 *  happens in its production: /music-videos/[id]/production?tab=… */
export default function MusicVideoPage() {
  const { id } = useParams<{ id: string }>();
  return <MusicVideo id={decodeURIComponent(id)} />;
}
