'use client';

import { useEffect, useState } from 'react';
import type { Production, Song } from '@/domain/types';
import { LYRIC_KINDS, type LyricKind } from '@/domain/vocabulary';
import { useStudio } from '@/studio/store';
import { nid } from '@/domain/actions';
import { assetById, castOf } from '@/studio/selectors';
import { useToast } from '@/components/ui/toast';
import { Button, Checkbox, Field, Input, Notice, Select, Textarea } from '@/components/ui/kit';
import { Empty } from '@/components/ui/cinema';
import { Section } from '@/components/ui/page';
import { Waveform } from '@/components/players/Waveform';
import { usePlayer, useTrackState } from '@/components/players/PlayerProvider';
import { PlayerNotice, SongPlayer } from '@/components/players/Controls';
import { ReplaceSong } from '../ReplaceSong';
import { trackOf } from '../MusicWorkspace';
import { GenButton, type StudioGate } from '../gate';
import { IconDelete, IconGenerate, IconPlay, IconPlus, IconVoice } from '@/components/ui/icons';
import { fmtSeconds, words } from '@/lib/format';

/** SONG & LYRICS — the song as a card (title, source, length, the brief), the waveform drawn from the file, and the
 *  lyrics as sections that read as one group each: the section's name, its time range and who sings it on one line,
 *  the words beneath in their own script. The section being sung lights up; select one to edit it. */
export function SongLyricsTab({ p, gate }: { p: Production; gate: StudioGate }) {
  const { state, act } = useStudio();
  const toast = useToast();
  const player = usePlayer();
  const song = p.song;
  const cast = castOf(state, p);
  const art = assetById(state, p.posterAssetId) ?? assetById(state, p.coverAssetId);
  const audio = assetById(state, song?.assetId);
  const artworkSrc = art?.src;
  const track = trackOf(p, audio && !audio.unavailable ? audio.src : undefined, artworkSrc);
  const performers = cast.filter((c) => song?.singerIds.includes(c.id) || p.castIds.includes(c.id));
  const artist = p.artist || performers.map((c) => c.name).join(' & ') || 'No artist yet';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const st = useTrackState(track);
  // the song was replaced or removed while it was the one loaded: stop it rather than play a stale file
  useEffect(() => { const cur = player.current; if (cur && cur.id === `song-${p.id}` && (!track || cur.src !== track.src)) player.stop(); }, [player, p.id, track]);
  if (!song) return (
    <div className="ws-main">
      <div className="ws-pane-head"><h1 className="t-section">Song and lyrics</h1></div>
      <p className="t-body ws-empty">No song yet: write it or bring the track.</p>
      <div className="ws-gen-row"><ReplaceSong p={p} /></div>
    </div>
  );
  const mine = st.mine;
  const time = st.time;
  const total = st.duration || song.durationSeconds || 1;
  const selected = song.sections.find((s) => s.id === selectedId) ?? null;
  const asset = state.assets.find((a) => a.id === song.assetId);
  const setSec = (id: string, patch: Partial<Song['sections'][number]>) => act('updateSong', p.id, { sections: song.sections.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const playFrom = (from: number) => { if (track) player.play(track, from + 0.001); };
  const addSection = () => { const last = song.sections[song.sections.length - 1]; const from = last?.to ?? 0; const id = nid('sec'); act('updateSong', p.id, { sections: [...song.sections, { id, kind: 'VERSE', text: '', singerIds: song.singerIds, from, to: Math.min(from + 16, song.durationSeconds) }] }); setSelectedId(id); };
  const quiet = (k: LyricKind) => k === 'INSTRUMENTAL' || k === 'INTRO' || k === 'OUTRO';

  return (
    <div className="ws-main">
    <div className="ws-pane-head"><h1 className="t-section">Song and lyrics</h1></div>
    <div className="ws-split">
      <div className="ws-split-main">
        <SongPlayer track={track} title={song.title || p.title} performer={artist} artworkSrc={artworkSrc} />
        <div className="card p-4 sm:p-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><h3 className="h3" dir="auto">{song.title}</h3>{asset?.sample && <span className="badge">{'Sample'}</span>}</div>
              <p className="mt-0.5 text-[13px] text-muted">{song.source === 'UPLOADED' ? 'Uploaded track' : song.assetId ? 'Generated song' : 'Not recorded yet'} · {fmtSeconds(song.durationSeconds)} · {song.sections.length} {'sections'}</p>
              {song.caption && <p className="mt-2 text-[13px] leading-relaxed text-faint" dir="auto">{song.caption}</p>}
            </div>
            <div className="flex items-center gap-2"><ReplaceSong p={p} /></div>
          </div>
          <div className="mt-4">
            {track ? <><Waveform src={track.src} progress={Math.min(1, time / total)} onSeek={(f) => player.play(track, f * total)} label={'Waveform, from the audio file'} unavailableText={'The waveform could not be drawn from this file.'} /><div className="mt-1"><PlayerNotice track={track} /></div></>
              : <Notice tone="info">{'No audio yet. The song plays once a track exists.'}</Notice>}
          </div>
        </div>

        <Section title={'Lyrics'} count={song.sections.length} description={'Write the lyrics as sections. Select a section to set who sings it and when.'} action={<><GenButton gate={gate} engine="music" type="GENERATE_SONG" payload={{ productionId: p.id }} target={{ productionId: p.id }} icon={<IconGenerate aria-hidden />}>Generate the song</GenButton><Button size="sm" icon={<IconPlus />} onClick={addSection}>{'Add section'}</Button></>}>
          {song.sections.length === 0 ? <Empty compact title={'Sections'} action={<Button variant="primary" icon={<IconPlus />} onClick={addSection}>{'Add section'}</Button>} /> : (
            <ol className="space-y-2" aria-label={'Sections'}>
              {song.sections.map((sec) => {
                const live = mine && time >= sec.from && time < sec.to;
                const on = selected?.id === sec.id;
                const singers = cast.filter((c) => sec.singerIds.includes(c.id)).map((c) => c.name).join(', ');
                const primaryText = p.language === 'AR' && sec.textAr ? sec.textAr : sec.text;
                const secondaryText = p.language === 'AR' ? (sec.textAr ? sec.text : '') : sec.textAr ?? '';
                return (
                  <li key={sec.id}>
                    <div className="card ws-lyric" data-on={on || undefined} data-live={live || undefined}>
                      <button type="button" aria-pressed={on} onClick={() => setSelectedId(on ? null : sec.id)} className="block w-full rounded-[inherit] px-4 py-3.5 text-start outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:px-5">
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 pe-9">
                          <span className="t-label">{words(sec.kind)}</span>
                          <span className="mono text-[11.5px] text-faint">{fmtSeconds(sec.from)} – {fmtSeconds(sec.to)}</span>
                          {singers && <span className="badge"><IconVoice aria-hidden />{singers}</span>}
                          {live && <span className="badge badge-accent">{'Now playing'}</span>}
                        </span>
                        {primaryText
                          ? <span className="ws-lyric-text" dir="auto" lang={p.language === 'AR' && sec.textAr ? 'ar' : undefined}>{primaryText}</span>
                          : <span className="ws-lyric-none">{quiet(sec.kind) ? '♪ ' + words(sec.kind) : 'No words yet — select to write them.'}</span>}
                        {secondaryText && <span className="ws-lyric-second" dir="auto">{secondaryText}</span>}
                      </button>
                      {track && <button type="button" aria-label={`${'Play'} ${words(sec.kind)}`} onClick={() => playFrom(sec.from)} className="btn btn-ghost btn-sm btn-icon absolute end-2.5 top-2.5 opacity-70 transition group-hover:opacity-100 focus-visible:opacity-100"><IconPlay /></button>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Section>
      </div>

      <aside className="ws-split-side">
        {!selected ? (
          <div className="card p-5">
            <h3 className="h3">{'Sections'}</h3>
            <p className="mt-1 text-[13px] text-muted">{'Select a section to see who sings it and when.'}</p>
            <ol className="mt-4 space-y-1.5">{song.sections.map((s) => <li key={s.id}><button type="button" onClick={() => setSelectedId(s.id)} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-start text-[13px] transition-colors hover:bg-raised-2"><span className="font-medium text-fg">{words(s.kind)}</span><span className="mono text-[11.5px] text-faint">{fmtSeconds(s.from)} – {fmtSeconds(s.to)}</span></button></li>)}</ol>
          </div>
        ) : (
          <div className="card space-y-4 p-5 fade-in" key={selected.id}>
            <div className="flex items-center justify-between gap-2"><h3 className="h3">{words(selected.kind)}</h3><Button variant="ghost" size="xs" icon={<IconDelete />} aria-label={'Remove'} onClick={() => { act('updateSong', p.id, { sections: song.sections.filter((x) => x.id !== selected.id) }); setSelectedId(null); toast.ok('Deleted.'); }} /></div>
            <Field label={'Kind'}><Select value={selected.kind} onChange={(e) => setSec(selected.id, { kind: e.target.value as LyricKind })} options={LYRIC_KINDS.map((k) => ({ value: k, label: words(k) }))} /></Field>
            {!quiet(selected.kind) && (
              <>
                <Field label={p.language === 'AR' ? `${'Lyrics'} (${'Arabic'})` : 'Lyrics'}>{p.language === 'AR' ? <Textarea value={selected.textAr ?? ''} dir="rtl" onChange={(e) => setSec(selected.id, { textAr: e.target.value })} rows={4} className="text-base" /> : <Textarea value={selected.text} onChange={(e) => setSec(selected.id, { text: e.target.value })} rows={4} className="text-base" />}</Field>
                <Field label={p.language === 'AR' ? `${'Lyrics'} (${'English'})` : `${'Lyrics'} (${'Arabic'})`} hint={'optional'}>{p.language === 'AR' ? <Textarea value={selected.text} onChange={(e) => setSec(selected.id, { text: e.target.value })} rows={3} /> : <Textarea value={selected.textAr ?? ''} dir="rtl" onChange={(e) => setSec(selected.id, { textAr: e.target.value })} rows={3} />}</Field>
              </>
            )}
            <fieldset>
              <legend className="label">{'Sung by'}</legend>
              {cast.length === 0 ? <p className="text-xs text-faint">{'Nobody in the cast yet.'}</p> : <div className="flex flex-wrap gap-x-4 gap-y-1.5">{cast.map((c) => <Checkbox key={c.id} label={c.name} checked={selected.singerIds.includes(c.id)} onChange={(e) => setSec(selected.id, { singerIds: e.target.checked ? [...selected.singerIds, c.id] : selected.singerIds.filter((x) => x !== c.id) })} />)}</div>}
            </fieldset>
            <fieldset>
              <legend className="label">{'Timing'} ({'seconds'})</legend>
              <div className="flex items-center gap-2">
                <Input type="number" min={0} max={song.durationSeconds} step={0.5} value={selected.from} aria-label={'From'} onChange={(e) => setSec(selected.id, { from: Number(e.target.value) })} />
                <span className="text-faint">–</span>
                <Input type="number" min={0} max={song.durationSeconds} step={0.5} value={selected.to} aria-label={'To'} onChange={(e) => setSec(selected.id, { to: Number(e.target.value) })} />
                {track && <Button size="sm" icon={<IconPlay />} onClick={() => playFrom(selected.from)} aria-label={'Play'} />}
              </div>
            </fieldset>
          </div>
        )}
      </aside>
    </div>
    </div>
  );
}
