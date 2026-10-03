'use client';

import { useState } from 'react';
import { T } from '@/lib/copy';
import { Button } from '@/components/ui/kit';
import { InlinePlayer } from '@/components/players/InlinePlayer';
import { PreviewPlayer } from '@/components/players/PreviewPlayer';
import { CanvasPlayer } from '@/components/players/CanvasPlayer';
import { TheatrePlayer } from '@/components/players/TheatrePlayer';
import { PlayerBar } from '@/components/players/PlayerBar';
import { usePlayer, useTrackState, type Track } from '@/components/players/PlayerProvider';
import { Waveform } from '@/components/players/Waveform';
import { SongTransport, SongVideoSwitch, type SongMode } from '@/components/players/music/SongTransport';
import { SectionsTable } from '@/components/players/music/SectionsTable';
import { LyricView } from '@/components/players/music/LyricView';
import { VoicePreview } from '@/components/players/music/VoicePreview';
import { EPISODE, PEOPLE, RIVER_LIGHTS, SONGS } from './data';
import { Block, Cell } from './ui';

/** The players section of the specimen page: the player family, the player bar and the music parts (§5.12, §5.13). */
export function PlayersSection() {
  const p = usePlayer();
  const song = SONGS[0];
  const track: Track = { id: 'spec-river-lights', src: song.audio!, title: song.title, subtitle: song.performers!, artworkSrc: song.sleeve!, duration: song.duration };
  const st = useTrackState(track);
  const [mode, setMode] = useState<SongMode>('song');
  const [fixed, setFixed] = useState(false);
  const nour = PEOPLE[4];
  const seekSong = (t: number) => { if (st.mine) p.seek(t); else p.play(track, t); };
  const sectionName = (id: string) => RIVER_LIGHTS.sections.find((s) => s.id === id)!.name;

  return (
    <section id="players" className="spec-section" aria-labelledby="spec-players-h">
      <h2 id="spec-players-h" className="h2 spec-section-h">{T('media.spec.players')}</h2>

      <Block title={T('media.spec.inline')}>
        <div className="spec-row spec-row-2">
          <Cell label={T('media.spec.inline')}><InlinePlayer src={EPISODE.cut} poster={EPISODE.still} title={EPISODE.title} /></Cell>
          <Cell label={T('media.spec.failed')}><InlinePlayer src="/sample/takes/missing-take.mp4" poster={EPISODE.shots[3].frame!} title={EPISODE.shots[3].purpose} /></Cell>
        </div>
      </Block>

      <Block title={T('media.spec.preview')}>
        <div className="spec-preview"><PreviewPlayer src={EPISODE.cut} still={EPISODE.still} alt={T.f('media.alt.still', { title: EPISODE.title })} onWatchWithSound={() => undefined} /></div>
      </Block>

      <Block title={T('media.spec.canvas')}>
        <div data-room="cutting" data-density="compact" className="spec-canvas"><CanvasPlayer src={EPISODE.shots[0].take!} poster={EPISODE.shots[0].frame!} title={EPISODE.shots[0].purpose} /></div>
      </Block>

      <Block title={T('media.spec.theatre')}>
        <div data-room="theatre" className="spec-theatre-room"><TheatrePlayer src={EPISODE.cut} poster={EPISODE.still} title={EPISODE.title} notes={[{ at: 4, text: EPISODE.shots[1].purpose }, { at: 9, text: EPISODE.shots[4].purpose }]} /></div>
      </Block>

      <Block title={T('media.spec.bar')}>
        <PlayerBar track={track} persistent placement="inline" mode={<SongVideoSwitch value={mode} onChange={setMode} videoDisabledReason={T('media.mode.noCut')} />} />
        <p className="spec-gap"><Button onClick={() => setFixed((f) => !f)} aria-pressed={fixed} data-testid="toggle-playerbar">{fixed ? T('media.spec.bar.hide') : T('media.spec.bar.show')}</Button></p>
        {fixed && <PlayerBar track={track} persistent placement="fixed" onClose={() => setFixed(false)} />}
      </Block>

      <Block title={T('media.spec.music')}>
        <div className="spec-stack">
          <SongTransport track={track} title={song.title} mode={mode} onMode={setMode} videoDisabledReason={T('media.mode.noCut')} />
          <div className="spec-music">
            <SectionsTable time={st.mine ? st.time : undefined} onPlayFrom={(r) => seekSong(r.from)} version={3} duration={song.duration}
              rows={RIVER_LIGHTS.sections.map((s) => ({ id: s.id, name: s.name, singer: s.singer ? { name: nour.name, src: nour.src } : null, shotsDone: s.done, shotsTotal: s.total, from: s.from, to: s.to }))} />
            <LyricView time={st.mine ? st.time : 26} onSeek={seekSong} height={240}
              lines={RIVER_LIGHTS.lines.map((l) => ({ ...l, section: sectionName(l.section), singer: { name: nour.name, src: nour.src } }))} />
          </div>
          <LyricView time={0} height={200} edit={{ singers: [{ id: 'nour', name: nour.name }], onChange: () => undefined }}
            lines={RIVER_LIGHTS.lines.slice(0, 2).map((l) => ({ ...l, section: sectionName(l.section), singer: { id: 'nour', name: nour.name, src: nour.src } }))} />
        </div>
      </Block>

      <Block title={T('media.spec.voice')}>
        <div className="spec-stack">
          <VoicePreview track={{ id: 'spec-voice-nour', src: nour.voice!, title: nour.name, duration: 3 }} name={nour.name} origin={T('media.spec.f.recording')} line="ابقَ حتى يُظلم النهر" lineLang="ar" />
          <Waveform src={song.audio!} progress={st.mine && st.duration ? st.time / st.duration : 0.4} onSeek={(f) => seekSong(f * song.duration)} duration={song.duration} height={64}
            label={`${T('media.wave.label')}: ${song.title}`} unavailableText={T('media.wave.unavailable')}
            sections={RIVER_LIGHTS.sections.slice(1).map((s) => ({ at: s.from / song.duration, label: s.name }))} />
        </div>
      </Block>
    </section>
  );
}
