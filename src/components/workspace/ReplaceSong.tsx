'use client';

import { useState } from 'react';
import type { Production } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { nid } from '@/domain/actions';
import { useToast } from '@/components/ui/toast';
import { Button, Field, Input, Modal, Notice, Segmented, Textarea } from '@/components/ui/kit';
import { splitLyrics } from '@/domain/lyrics';
import { IconUpload } from '@/components/ui/icons';

/** Give a music video its song, or replace it: describe and write it (saved as an example song), or bring a file. */
export function ReplaceSong({ p }: { p: Production }) {
  const { state, act, addFile } = useStudio(); const toast = useToast();
  const [mode, setMode] = useState<'GENERATE' | 'UPLOAD'>('GENERATE');
  const [caption, setCaption] = useState(p.song?.caption ?? ''); const [lyrics, setLyrics] = useState(''); const [title, setTitle] = useState(p.song?.title ?? p.title);
  const submit = (close: () => void) => {
    if (!caption.trim()) return;
    const sections = lyrics.trim() ? splitLyrics(lyrics, p.targetSeconds) : p.song?.sections ?? [];
    act('setSong', p.id, { id: nid('song'), title: title.trim() || p.title, source: 'GENERATED_EXAMPLE', durationSeconds: p.targetSeconds, caption: caption.trim(), sections: sections.map((x) => ({ ...x, singerIds: x.singerIds.length ? x.singerIds : p.castIds })), singerIds: p.castIds });
    toast.ok('Saved.'); close();
  };
  const onFile = async (f: File, close: () => void) => {
    const r = await addFile(f, { label: f.name, tags: ['song', 'upload'] });
    if (!r.ok) { toast.bad(r.error); return; }
    act('setSong', p.id, { id: nid('song'), title: title.trim() || f.name, source: 'UPLOADED', assetId: r.asset.id, durationSeconds: p.targetSeconds, caption: '', sections: p.song?.sections ?? [], singerIds: p.castIds });
    toast.ok('Saved.'); close();
  };
  const sampleTrack = state.assets.find((x) => x.id === 'song-uploaded');
  const useSample = (close: () => void) => { if (!sampleTrack) return; act('setSong', p.id, { id: nid('song'), title: title.trim() || p.title, source: 'UPLOADED', assetId: sampleTrack.id, durationSeconds: sampleTrack.durationSeconds ?? p.targetSeconds, caption: '', sections: p.song?.sections ?? [], singerIds: p.castIds }); toast.ok('Saved.'); close(); };
  return (
    <Modal title={p.song ? 'Replace song' : 'The song'} trigger={(open) => <Button size="sm" onClick={open}>{p.song ? 'Replace song' : 'Add'}</Button>}>
      {(close) => (
        <div className="ws-form">
          <Segmented label={'The song'} value={mode} onChange={setMode} options={[{ value: 'GENERATE', label: 'Generate Song' }, { value: 'UPLOAD', label: 'Upload Song' }]} />
          <Field label={'Title'}><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          {mode === 'GENERATE' ? (
            <>
              <Field label={'Describe the song'} help={'Genre, mood, tempo, instruments, voice.'} required><Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={2} /></Field>
              <Field label={'Lyrics'} help={'Leave a blank line between sections. Start a section with [verse], [chorus], [bridge], [intro] or [outro] to name it.'}><Textarea value={lyrics} onChange={(e) => setLyrics(e.target.value)} rows={6} className="display text-base" /></Field>
              <Notice tone="info">{'The song is saved with the project. Generate the recording from the Story tab once the project exists.'}</Notice>
              <div className="flex justify-end gap-2"><Button variant="ghost" onClick={close}>{'Cancel'}</Button><Button variant="primary" onClick={() => submit(close)} disabled={!caption.trim()}>{'Save'}</Button></div>
            </>
          ) : (
            <div className="ws-form">
              <label className="btn btn-secondary cursor-pointer"><IconUpload aria-hidden />{'Upload Song'}<input type="file" accept="audio/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f, close); }} /></label>
              {sampleTrack && <button type="button" className="ws-textlink" onClick={() => useSample(close)}>{'Sample content'}: {'Uploaded track'.toLowerCase()}</button>}
              <p className="t-meta">{'Files you add are checked, stored in the studio library on the server and listed here with their origin.'}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
