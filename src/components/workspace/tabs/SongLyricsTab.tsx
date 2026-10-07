'use client';

import { useEffect, useState } from 'react';
import type { Production, Song } from '@/domain/types';
import { LYRIC_KINDS, sings, type LyricKind } from '@/domain/vocabulary';
import { useStudio } from '@/studio/store';
import { nid, songVerdict } from '@/domain/actions';
import { assetById, castOf } from '@/studio/selectors';
import { useToast } from '@/components/ui/toast';
import { Button, Checkbox, Field, Input, SectionHead, Select, Textarea } from '@/components/ui/kit';
import { Waveform } from '@/components/players/Waveform';
import { usePlayer, useTrackState } from '@/components/players/PlayerProvider';
import { PlayerNotice, SongPlayer } from '@/components/players/Controls';
import { ReplaceSong } from '../ReplaceSong';
import { trackOf } from '../MusicWorkspace';
import { GenButton, type StudioGate } from '../gate';
import { IconAuto, IconDelete, IconGenerate, IconPlay, IconPlus, IconVoice } from '@/components/ui/icons';
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
  // the artist is who sings this song; before a song exists, the cast members who sing
  const performers = song?.singerIds.length ? song.singerIds.map((id) => cast.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c) : cast.filter((c) => sings(c.kind));
  const writeSong = (label: string) => (
    <GenButton gate={gate} engine="story" type="WRITE_SONG" payload={{ productionId: p.id }} target={{ productionId: p.id }} icon={<IconAuto aria-hidden />}
      disabled={!cast.some((c) => sings(c.kind))} reason="Cast a singer first: only a Singer or an Actor + Singer sings.">{label}</GenButton>
  );
  const artist = p.artist || performers.map((c) => c.name).join(' & ') || 'No artist yet';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [heard, setHeard] = useState('');
  const st = useTrackState(track);
  // the song was replaced or removed while it was the one loaded: stop it rather than play a stale file
  useEffect(() => { const cur = player.current; if (cur && cur.id === `song-${p.id}` && (!track || cur.src !== track.src)) player.stop(); }, [player, p.id, track]);
  if (!song) return (
    <div className="ws-main">
      <div className="ws-pane-head"><h1 className="t-section">Song and lyrics</h1></div>
      <p className="t-body ws-empty">No song yet: write it or bring the track.</p>
      <div className="ws-gen-row">{writeSong('Write the song')}<ReplaceSong p={p} /></div>
      <p className="t-meta">The planner writes the concept, the lyrics, the sections and who sings each one, for the singers in the cast.</p>
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
          <section className="card ws-side-card ws-song" aria-labelledby="ws-song-h">
            <div className="ws-sub-head">
              <h2 id="ws-song-h" className="t-title name"><bdi>{song.title}</bdi>{asset?.sample && <span className="badge badge-neutral ws-badge-gap">Sample</span>}</h2>
              <ReplaceSong p={p} />
            </div>
            <p className="t-meta">{song.source === 'UPLOADED' ? 'Uploaded track' : song.assetId ? 'Generated song' : 'Not recorded yet'} · {fmtSeconds(song.durationSeconds)} · {song.sections.length} sections</p>
            {song.caption && <p className="t-body" dir="auto">{song.caption}</p>}
            {track ? <><Waveform src={track.src} progress={Math.min(1, time / total)} onSeek={(f) => player.play(track, f * total)} label="Waveform, from the audio file" unavailableText="The waveform could not be drawn from this file." /><PlayerNotice track={track} /></>
              : <p className="t-body">No audio yet. The song plays once a track exists.</p>}
            {song.assetId && (() => {
              const v = songVerdict(song);
              const listen = (verdict: 'ACCEPTED' | 'NOT_YET') => { act('recordSongListening', p.id, { verdict, note: heard }); setHeard(''); toast.ok(verdict === 'ACCEPTED' ? 'Accepted.' : 'Noted.'); };
              return (
                <div className="ws-listen">
                  <h3 className="t-label">Your listening</h3>
                  {v ? <p className="t-body">{v.verdict === 'ACCEPTED' ? 'You accepted this recording' : 'You heard this recording and it is not yet right'} · <span className="t-meta">{new Date(v.at).toLocaleDateString()}</span>{v.note && <><br /><span className="t-meta" dir="auto">{v.note}</span></>}</p>
                    : <p className="t-meta">The checks measure the words, the timing and the level. Only listening to the whole song accepts it.</p>}
                  <Field label="What you heard" hint="optional"><Textarea value={heard} onChange={(e) => setHeard(e.target.value)} rows={2} dir="auto" /></Field>
                  <div className="ws-actions"><Button size="sm" onClick={() => listen('ACCEPTED')}>I listened: accept</Button><Button size="sm" variant="quiet" onClick={() => listen('NOT_YET')}>I listened: not yet right</Button></div>
                </div>
              );
            })()}
          </section>

          <section className="ws-sec" aria-labelledby="ws-lyr-h">
            <SectionHead id="ws-lyr-h" title="Lyrics" count={song.sections.length || null} description="Write the lyrics as sections. Select a section to set who sings it and when." action={<Button size="sm" icon={<IconPlus aria-hidden />} onClick={addSection}>Add a section</Button>} />
            <div className="ws-gen-row">{writeSong(song.sections.length || song.lyrics ? 'Rewrite the song' : 'Write the song')}<GenButton gate={gate} engine="music" type="GENERATE_SONG" payload={{ productionId: p.id }} target={{ productionId: p.id }} icon={<IconGenerate aria-hidden />}>Generate the song</GenButton>
              {song.assetId && song.source === 'GENERATED' && <GenButton gate={gate} type="CHECK_SONG" payload={{ productionId: p.id }} target={{ productionId: p.id }} icon={<IconVoice aria-hidden />}>Check the recording again</GenButton>}</div>
            {song.sections.length === 0 ? <p className="t-body ws-empty">No sections yet.</p> : (
              <ol className="ws-lyrics" aria-label="Sections">
                {song.sections.map((sec) => {
                  const live = mine && time >= sec.from && time < sec.to;
                  const on = selected?.id === sec.id;
                  const singers = cast.filter((c) => sec.singerIds.includes(c.id)).map((c) => c.name).join(', ');
                  const primaryText = p.language === 'AR' && sec.textAr ? sec.textAr : sec.text;
                  const secondaryText = p.language === 'AR' ? (sec.textAr ? sec.text : '') : sec.textAr ?? '';
                  return (
                    <li key={sec.id}>
                      <div className="card ws-lyric" data-on={on || undefined} data-live={live || undefined}>
                        <button type="button" aria-pressed={on} onClick={() => setSelectedId(on ? null : sec.id)} className="ws-lyric-btn">
                          <span className="ws-lyric-head">
                            <span className="t-label">{words(sec.kind)}</span>
                            <span className="ws-ro t-meta">{fmtSeconds(sec.from)} – {fmtSeconds(sec.to)}</span>
                            {singers && <span className="badge badge-neutral"><IconVoice aria-hidden /><bdi>{singers}</bdi></span>}
                            {live && <span className="badge badge-neutral">Now playing</span>}
                          </span>
                          {primaryText
                            ? <span className="ws-lyric-text" dir="auto" lang={p.language === 'AR' && sec.textAr ? 'ar' : undefined}>{primaryText}</span>
                            : <span className="ws-lyric-none">{quiet(sec.kind) ? `♪ ${words(sec.kind)}` : 'No words yet — select to write them.'}</span>}
                          {secondaryText && <span className="ws-lyric-second" dir="auto">{secondaryText}</span>}
                        </button>
                        {track && <button type="button" aria-label={`Play ${words(sec.kind)}`} onClick={() => playFrom(sec.from)} className="btn btn-quiet btn-sm btn-icon ws-lyric-play"><IconPlay aria-hidden /></button>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        <aside className="ws-split-side">
          {!selected ? (
            <div className="card ws-side-card">
              <h2 className="t-title">Sections</h2>
              <p className="t-body">Select a section to see who sings it and when.</p>
              <ol className="ws-files">{song.sections.map((s) => <li key={s.id}><button type="button" onClick={() => setSelectedId(s.id)} className="ws-textlink">{words(s.kind)}</button><span className="ws-ro t-meta">{fmtSeconds(s.from)} – {fmtSeconds(s.to)}</span></li>)}</ol>
            </div>
          ) : (
            <div className="card ws-side-card" key={selected.id}>
              <div className="ws-sub-head"><h2 className="t-title">{words(selected.kind)}</h2><Button variant="quiet" size="sm" icon={<IconDelete aria-hidden />} aria-label="Remove the section" onClick={() => { act('updateSong', p.id, { sections: song.sections.filter((x) => x.id !== selected.id) }); setSelectedId(null); toast.ok('Deleted.'); }} /></div>
              <Field label="Kind"><Select value={selected.kind} onChange={(e) => setSec(selected.id, { kind: e.target.value as LyricKind })} options={LYRIC_KINDS.map((k) => ({ value: k, label: words(k) }))} /></Field>
              {!quiet(selected.kind) && (
                <>
                  <Field label={p.language === 'AR' ? 'Lyrics (Arabic)' : 'Lyrics'}>{p.language === 'AR' ? <Textarea value={selected.textAr ?? ''} dir="rtl" lang="ar" onChange={(e) => setSec(selected.id, { textAr: e.target.value })} rows={4} /> : <Textarea value={selected.text} onChange={(e) => setSec(selected.id, { text: e.target.value })} rows={4} dir="auto" />}</Field>
                  <Field label={p.language === 'AR' ? 'Lyrics (English)' : 'Lyrics (Arabic)'} hint="optional">{p.language === 'AR' ? <Textarea value={selected.text} onChange={(e) => setSec(selected.id, { text: e.target.value })} rows={3} dir="auto" /> : <Textarea value={selected.textAr ?? ''} dir="rtl" lang="ar" onChange={(e) => setSec(selected.id, { textAr: e.target.value })} rows={3} />}</Field>
                </>
              )}
              <fieldset className="ws-fieldset">
                <legend className="t-label">Sung by</legend>
                {!cast.some((c) => sings(c.kind)) ? <p className="t-meta">Nobody in the cast sings. Cast a Singer or an Actor + Singer.</p> : <div className="ws-checks">{cast.filter((c) => sings(c.kind)).map((c) => <Checkbox key={c.id} label={<bdi>{c.name}</bdi>} checked={selected.singerIds.includes(c.id)} onChange={(e) => setSec(selected.id, { singerIds: e.target.checked ? [...selected.singerIds, c.id] : selected.singerIds.filter((x) => x !== c.id) })} />)}</div>}
              </fieldset>
              <fieldset className="ws-fieldset">
                <legend className="t-label">Timing (seconds)</legend>
                <div className="ws-actions">
                  <Input type="number" min={0} max={song.durationSeconds} step={0.5} value={selected.from} aria-label="From" onChange={(e) => setSec(selected.id, { from: Number(e.target.value) })} />
                  <span className="t-meta">to</span>
                  <Input type="number" min={0} max={song.durationSeconds} step={0.5} value={selected.to} aria-label="To" onChange={(e) => setSec(selected.id, { to: Number(e.target.value) })} />
                  {track && <Button size="sm" icon={<IconPlay aria-hidden />} onClick={() => playFrom(selected.from)} aria-label="Play the section" />}
                </div>
              </fieldset>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
