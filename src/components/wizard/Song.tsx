'use client';

import { useState } from 'react';
import { useStudio } from '@/studio/store';
import { ChoiceTiles, Field, ShapedDropzone, Textarea } from '@/components/ui/kit';
import { IconAuto, IconUpload } from '@/components/ui/icons';
import { Panel } from './parts';
import { lengthWords, type CreateMode } from './model';

/** A MUSIC VIDEO STARTS WITH ITS SONG — the studio writes it, or the producer brings it. The uploaded file goes to the
 *  library at once (POST /api/assets) and plays here; nothing else is made before Create. */

export interface SongDraft {
  source: 'write' | 'upload';
  /** what the song is about (Manual, write) */
  about: string;
  lyrics: string;
  upload: { assetId: string; name: string; src: string; duration?: number } | null;
}
export const emptySong = (): SongDraft => ({ source: 'write', about: '', lyrics: '', upload: null });

export function SongPanel({ mode, song, setSong, error }: { mode: CreateMode; song: SongDraft; setSong: (s: SongDraft) => void; error?: string }) {
  const { addFile } = useStudio();
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const set = (p: Partial<SongDraft>) => setSong({ ...song, ...p });
  const onFile = async (f: File) => {
    setRefusal(null);
    if (!f.type.startsWith('audio/')) { setRefusal('That file is not audio. Choose an MP3, WAV, M4A or FLAC file.'); return; }
    setBusy(true);
    const r = await addFile(f, { label: f.name, tags: ['song', 'upload'], expect: 'AUDIO' });
    setBusy(false);
    if (!r.ok) { setRefusal(r.error); return; }
    set({ upload: { assetId: r.asset.id, name: f.name, src: r.asset.src, duration: r.asset.durationSeconds } });
  };
  return (
    <Panel id="create-song-h" title="The song" description="Every music video starts with its song. The pictures follow its words, its mood and its sections.">
      <ChoiceTiles label="Where the song comes from" value={song.source} onChange={(v) => { set({ source: v }); setRefusal(null); }} options={[
        { value: 'write', label: 'Let the studio write it', hint: mode === 'auto' ? 'Written with the idea: title, lyrics and mood' : 'Say what it is about; lyrics are optional', icon: <IconAuto /> },
        { value: 'upload', label: 'Upload a song', hint: 'MP3, WAV, M4A or FLAC', icon: <IconUpload /> },
      ]} />
      {song.source === 'upload' ? (
        <div className="create-stack" id="create-song">
          <ShapedDropzone ratio="4/1" label="Drop the song here" hint="or choose the file" accept="audio/*" busy={busy}
            file={song.upload ? { name: song.upload.name, src: song.upload.src, kind: 'audio', meta: lengthWords(song.upload.duration) || undefined } : null}
            onFile={(f) => void onFile(f)} onRemove={() => set({ upload: null })} error={refusal ?? (song.upload ? undefined : error)} />
          <Field label="Lyrics" optional help="With the words the studio can match each section of the video to them."><Textarea rows={4} value={song.lyrics} onChange={(e) => set({ lyrics: e.target.value })} /></Field>
        </div>
      ) : mode === 'manual' ? (
        <div className="create-stack">
          <Field label="What the song is about" optional help="Its story, mood and sound. Without it the studio writes from your one line."><Textarea rows={2} value={song.about} onChange={(e) => set({ about: e.target.value })} /></Field>
          <Field label="Lyrics" optional help="Leave them empty and the studio writes them when it makes the song."><Textarea rows={5} value={song.lyrics} onChange={(e) => set({ lyrics: e.target.value })} /></Field>
        </div>
      ) : (
        <p className="t-body">The studio writes the song with the idea. You can change its title and every word before anything is made.</p>
      )}
    </Panel>
  );
}
