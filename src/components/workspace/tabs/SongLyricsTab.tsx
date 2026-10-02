'use client';

import { useState } from 'react';
import type { Production, Song } from '@/domain/types';
import { LYRIC_KINDS, type LyricKind } from '@/domain/vocabulary';
import { useStudio } from '@/studio/store';
import { nid } from '@/domain/actions';
import { castOf } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { Button, Checkbox, Field, Input, Notice, Select, Textarea } from '@/components/ui/kit';
import { Empty } from '@/components/ui/cinema';
import { Section } from '@/components/ui/page';
import { JobButton } from '@/components/ui/jobs';
import { Waveform } from '@/components/players/Waveform';
import { usePlayer, useTrackState, type Track } from '@/components/players/PlayerProvider';
import { PlayerNotice } from '@/components/players/Controls';
import { ReplaceSong } from '../ReplaceSong';
import { IconDelete, IconGenerate, IconPlay, IconPlus, IconVoice } from '@/components/ui/icons';
import { fmtSeconds, words } from '@/lib/format';

/** SONG & LYRICS — the song as a card (title, source, length, the brief), the waveform drawn from the file, and the
 *  lyrics as sections that read as one group each: the section's name, its time range and who sings it on one line,
 *  the words beneath in their own script. The section being sung lights up; select one to edit it. */
export function SongLyricsTab({ p, track }: { p: Production; track: Track | null }) {
  const T = useT();
  const { state, act } = useStudio();
  const toast = useToast();
  const player = usePlayer();
  const song = p.song;
  const cast = castOf(state, p);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const st = useTrackState(track);
  if (!song) return <Empty title={T('song.noSong')} action={<ReplaceSong p={p} />} />;
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
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
      <div className="space-y-8">
        <div className="card p-4 sm:p-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><h3 className="h3" dir="auto">{song.title}</h3>{asset?.sample && <span className="badge">{T('label.sample')}</span>}</div>
              <p className="mt-0.5 text-[13px] text-muted">{song.source === 'UPLOADED' ? T('song.uploaded') : song.assetId ? T('song.generated') : T('song.notRecorded')} · {fmtSeconds(song.durationSeconds)} · {song.sections.length} {T('mv.sections')}</p>
              {song.caption && <p className="mt-2 text-[13px] leading-relaxed text-faint" dir="auto">{song.caption}</p>}
            </div>
            <div className="flex items-center gap-2"><ReplaceSong p={p} /></div>
          </div>
          <div className="mt-4">
            {track ? <><Waveform src={track.src} progress={Math.min(1, time / total)} onSeek={(f) => player.play(track, f * total)} label={T('mv.waveform')} unavailableText={T('mv.waveformUnavailable')} /><div className="mt-1"><PlayerNotice track={track} /></div></>
              : <Notice tone="info">{T('mv.noAudio')}</Notice>}
          </div>
        </div>

        <Section title={T('song.lyrics')} count={song.sections.length} description={T('mv.lyrics.hint')} action={<><JobButton type="GENERATE_SONG" payload={{ productionId: p.id }} target={{ productionId: p.id }} size="sm" icon={<IconGenerate />}>{T('gen.song')}</JobButton><Button size="sm" icon={<IconPlus />} onClick={addSection}>{T('btn.addSection')}</Button></>}>
          {song.sections.length === 0 ? <Empty compact title={T('song.sections')} action={<Button variant="primary" icon={<IconPlus />} onClick={addSection}>{T('btn.addSection')}</Button>} /> : (
            <ol className="space-y-2" aria-label={T('song.sections')}>
              {song.sections.map((sec) => {
                const live = mine && time >= sec.from && time < sec.to;
                const on = selected?.id === sec.id;
                const singers = cast.filter((c) => sec.singerIds.includes(c.id)).map((c) => c.name).join(', ');
                const primaryText = p.language === 'AR' && sec.textAr ? sec.textAr : sec.text;
                const secondaryText = p.language === 'AR' ? (sec.textAr ? sec.text : '') : sec.textAr ?? '';
                return (
                  <li key={sec.id}>
                    <div className={`card group relative transition ${on ? 'border-primary' : live ? 'border-violet-500/60' : ''} ${live ? 'bg-primary/[0.06]' : ''}`}>
                      <button type="button" aria-pressed={on} onClick={() => setSelectedId(on ? null : sec.id)} className="block w-full rounded-[inherit] px-4 py-3.5 text-start outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:px-5">
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 pe-9">
                          <span className={`eyebrow ${live ? 'text-violet-300' : ''}`}>{words(sec.kind)}</span>
                          <span className="mono text-[11.5px] text-faint">{fmtSeconds(sec.from)} – {fmtSeconds(sec.to)}</span>
                          {singers && <span className="badge"><IconVoice aria-hidden />{singers}</span>}
                          {live && <span className="badge badge-accent">{T('mv.nowPlaying')}</span>}
                        </span>
                        {primaryText
                          ? <span className={`mt-2.5 block whitespace-pre-line text-[17px] font-medium leading-relaxed ${live || on ? 'text-fg' : 'text-body'}`} dir="auto">{primaryText}</span>
                          : <span className="mt-2 block text-[13px] italic text-faint">{quiet(sec.kind) ? '♪ ' + words(sec.kind) : T('song.noWordsYet')}</span>}
                        {secondaryText && <span className="mt-1.5 block whitespace-pre-line text-[13px] leading-relaxed text-faint" dir="auto">{secondaryText}</span>}
                      </button>
                      {track && <button type="button" aria-label={`${T('misc.play')} ${words(sec.kind)}`} onClick={() => playFrom(sec.from)} className="btn btn-ghost btn-sm btn-icon absolute end-2.5 top-2.5 opacity-70 transition group-hover:opacity-100 focus-visible:opacity-100"><IconPlay /></button>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Section>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        {!selected ? (
          <div className="card p-5">
            <h3 className="h3">{T('song.sections')}</h3>
            <p className="mt-1 text-[13px] text-muted">{T('mv.noSection')}</p>
            <ol className="mt-4 space-y-1.5">{song.sections.map((s) => <li key={s.id}><button type="button" onClick={() => setSelectedId(s.id)} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-start text-[13px] transition-colors hover:bg-raised-2"><span className="font-medium text-fg">{words(s.kind)}</span><span className="mono text-[11.5px] text-faint">{fmtSeconds(s.from)} – {fmtSeconds(s.to)}</span></button></li>)}</ol>
          </div>
        ) : (
          <div className="card space-y-4 p-5 fade-in" key={selected.id}>
            <div className="flex items-center justify-between gap-2"><h3 className="h3">{words(selected.kind)}</h3><Button variant="ghost" size="xs" icon={<IconDelete />} aria-label={T('btn.remove')} onClick={() => { act('updateSong', p.id, { sections: song.sections.filter((x) => x.id !== selected.id) }); setSelectedId(null); toast.ok(T('toast.deleted')); }} /></div>
            <Field label={T('label.kind')}><Select value={selected.kind} onChange={(e) => setSec(selected.id, { kind: e.target.value as LyricKind })} options={LYRIC_KINDS.map((k) => ({ value: k, label: words(k) }))} /></Field>
            {!quiet(selected.kind) && (
              <>
                <Field label={p.language === 'AR' ? `${T('song.lyrics')} (${T('label.arabic')})` : T('song.lyrics')}>{p.language === 'AR' ? <Textarea value={selected.textAr ?? ''} dir="rtl" onChange={(e) => setSec(selected.id, { textAr: e.target.value })} rows={4} className="text-base" /> : <Textarea value={selected.text} onChange={(e) => setSec(selected.id, { text: e.target.value })} rows={4} className="text-base" />}</Field>
                <Field label={p.language === 'AR' ? `${T('song.lyrics')} (${T('label.english')})` : `${T('song.lyrics')} (${T('label.arabic')})`} hint={T('wizard.optional')}>{p.language === 'AR' ? <Textarea value={selected.text} onChange={(e) => setSec(selected.id, { text: e.target.value })} rows={3} /> : <Textarea value={selected.textAr ?? ''} dir="rtl" onChange={(e) => setSec(selected.id, { textAr: e.target.value })} rows={3} />}</Field>
              </>
            )}
            <fieldset>
              <legend className="label">{T('mv.sectionSingers')}</legend>
              {cast.length === 0 ? <p className="text-xs text-faint">{T('empty.cast')}</p> : <div className="flex flex-wrap gap-x-4 gap-y-1.5">{cast.map((c) => <Checkbox key={c.id} label={c.name} checked={selected.singerIds.includes(c.id)} onChange={(e) => setSec(selected.id, { singerIds: e.target.checked ? [...selected.singerIds, c.id] : selected.singerIds.filter((x) => x !== c.id) })} />)}</div>}
            </fieldset>
            <fieldset>
              <legend className="label">{T('mv.sectionTiming')} ({T('label.seconds')})</legend>
              <div className="flex items-center gap-2">
                <Input type="number" min={0} max={song.durationSeconds} step={0.5} value={selected.from} aria-label={T('mv.from')} onChange={(e) => setSec(selected.id, { from: Number(e.target.value) })} />
                <span className="text-faint">–</span>
                <Input type="number" min={0} max={song.durationSeconds} step={0.5} value={selected.to} aria-label={T('mv.to')} onChange={(e) => setSec(selected.id, { to: Number(e.target.value) })} />
                {track && <Button size="sm" icon={<IconPlay />} onClick={() => playFrom(selected.from)} aria-label={T('misc.play')} />}
              </div>
            </fieldset>
          </div>
        )}
      </aside>
    </div>
  );
}
