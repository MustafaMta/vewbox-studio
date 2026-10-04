'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/kit';
import { InlinePlayer } from '@/components/players/InlinePlayer';
import { PreviewPlayer } from '@/components/players/PreviewPlayer';
import { CanvasPlayer } from '@/components/players/CanvasPlayer';
import { TheatrePlayer } from '@/components/players/TheatrePlayer';
import { PlayerBar } from '@/components/players/PlayerBar';
import { usePlayer, useTrackState, type Track } from '@/components/players/PlayerProvider';
import { Waveform } from '@/components/players/Waveform';
import { AudioRow, AudioPlayer } from '@/components/players/Controls';
import { IconBack5, IconForward5 } from '@/components/ui/icons';
import { SongTransport, SongVideoSwitch, type SongMode } from '@/components/players/music/SongTransport';
import { SectionsTable } from '@/components/players/music/SectionsTable';
import { LyricView } from '@/components/players/music/LyricView';
import { VoicePreview } from '@/components/players/music/VoicePreview';
import { EPISODE, PEOPLE, RIVER_LIGHTS, SONGS } from './data';
import { Block, Figure as Cell, SpecSection } from './parts';

/** The players section of the specimen page: the player family, the player bar and the music parts (§5.12, §5.13). */
export function PlayersSpec() {
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
    <SpecSection id="players" title="Players" lead="The lobby's video player docks its transport under the picture; the audio row plays from the one shared source; the theatre and canvas players keep their rooms.">

      <Block title="Video player: the transport docked under the picture (§5.24)">
        <div className="spec-row spec-row-2">
          <Cell label="Lobby, radius 14"><InlinePlayer src={EPISODE.cut} poster={EPISODE.still} title={EPISODE.title} /></Cell>
          <Cell label="A clip that did not load"><InlinePlayer src="/sample/takes/missing-take.mp4" poster={EPISODE.shots[3].frame!} title={EPISODE.shots[3].purpose} /></Cell>
        </div>
        <div className="spec-gap"><Cell label="The page's hero, radius 20; compact (volume behind its button)"><InlinePlayer src={EPISODE.cut} poster={EPISODE.still} title={`${EPISODE.title} (hero)`} hero compact /></Cell></div>
      </Block>

      <Block title="Video player, theatre: overlay, ticks, extra keys and dock slots (the Screening Room)">
        <div data-room="theatre" className="spec-theatre-room">
          <InlinePlayer theatre src={EPISODE.cut} poster={EPISODE.still} title={`${EPISODE.title} (theatre)`}
            ticks={[...EPISODE.shots.slice(1).map((_, i) => ({ at: EPISODE.shots.slice(0, i + 1).reduce((t, x) => t + x.d, 0) * (12 / 30), kind: 'mark' as const })), { at: 4, kind: 'note' as const }, { at: 9, kind: 'note' as const }]}
            keys={(c) => ({ '[': () => c.nudge(-2), ']': () => c.nudge(2) })}
            overlay={(c) => (Math.abs(c.time - 4) < 1 ? <span className="art-chip">Note · Hold on the keys</span> : null)}
            transportStart={(c) => <>
              <button type="button" className="pt-btn" aria-label="Back 5 seconds" onClick={() => c.nudge(-5)}><IconBack5 aria-hidden /></button>
              <button type="button" className="pt-btn" aria-label="Forward 5 seconds" onClick={() => c.nudge(5)}><IconForward5 aria-hidden /></button>
            </>}
            transportEnd={<span className="ptime">CC · English</span>} />
        </div>
      </Block>
      <Block title="Audio row (§5.24)">
        <div className="spec-stack">
          <AudioRow track={track} meta={`${song.performers} · 0:${song.duration}`} />
          <AudioPlayer src={SONGS[1].audio!} title={SONGS[1].title} duration={SONGS[1].duration} meta={SONGS[1].performers ?? undefined} />
          <AudioPlayer src={SONGS[1].audio!} title="Without a waveform" duration={SONGS[1].duration} waveform={false} />
        </div>
      </Block>

      <Block title={'Hero preview (muted, once, after 2 s)'}>
        <div className="spec-preview"><PreviewPlayer src={EPISODE.cut} still={EPISODE.still} alt={`Still from ${EPISODE.title}`} onWatchWithSound={() => undefined} /></div>
      </Block>

      <Block title={'Canvas player'}>
        <div data-room="cutting" data-density="compact" className="spec-canvas"><CanvasPlayer src={EPISODE.shots[0].take!} poster={EPISODE.shots[0].frame!} title={EPISODE.shots[0].purpose} /></div>
      </Block>

      <Block title={'Theatre player'}>
        <div data-room="theatre" className="spec-theatre-room"><TheatrePlayer src={EPISODE.cut} poster={EPISODE.still} title={EPISODE.title} notes={[{ at: 4, text: EPISODE.shots[1].purpose }, { at: 9, text: EPISODE.shots[4].purpose }]} /></div>
      </Block>

      <Block title={'Player bar'}>
        <PlayerBar track={track} persistent placement="inline" mode={<SongVideoSwitch value={mode} onChange={setMode} videoDisabledReason={'No cut yet'} />} />
        <p className="spec-gap"><Button onClick={() => setFixed((f) => !f)} aria-pressed={fixed} data-testid="toggle-playerbar">{fixed ? 'Hide the fixed player bar' : 'Show the fixed player bar'}</Button></p>
        {fixed && <PlayerBar track={track} persistent placement="fixed" onClose={() => setFixed(false)} />}
      </Block>

      <Block title={'Song transport, sections and lyrics'}>
        <div className="spec-stack">
          <SongTransport track={track} title={song.title} mode={mode} onMode={setMode} videoDisabledReason={'No cut yet'} />
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

      <Block title={'Voice reel and waveform'}>
        <div className="spec-stack">
          <VoicePreview track={{ id: 'spec-voice-nour', src: nour.voice!, title: nour.name, duration: 3 }} name={nour.name} origin={'Recording — sample'} line="ابقَ حتى يُظلم النهر" lineLang="ar" />
          <Waveform src={song.audio!} progress={st.mine && st.duration ? st.time / st.duration : 0.4} onSeek={(f) => seekSong(f * song.duration)} duration={song.duration} height={64}
            label={`${'Waveform'}: ${song.title}`} unavailableText={'The waveform could not be drawn from this file.'}
            sections={RIVER_LIGHTS.sections.slice(1).map((s) => ({ at: s.from / song.duration, label: s.name }))} />
        </div>
      </Block>
    </SpecSection>
  );
}
