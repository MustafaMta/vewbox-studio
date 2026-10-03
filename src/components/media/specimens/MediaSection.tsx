'use client';

import { useState } from 'react';
import { T } from '@/lib/copy';
import { Button, Menu, MenuItem, Segmented } from '@/components/ui/kit';
import { IconChevronRight, IconEdit, IconPlay } from '@/components/ui/icons';
import type { Track } from '@/components/players/PlayerProvider';
import { SongTransport } from '@/components/players/music/SongTransport';
import { VoicePreview } from '@/components/players/music/VoicePreview';
import { InlinePlayer } from '@/components/players/InlinePlayer';
import { TheatrePlayer } from '@/components/players/TheatrePlayer';
import { FilmStrip } from '@/components/edit/FilmStrip';
import { StoryboardReel } from '@/components/edit/StoryboardReel';
import { Frame } from '../Frame';
import { TitleCard } from '../TitleCard';
import { Slate } from '../Slate';
import { FaceCircle } from '../FaceCircle';
import { StageMeter, stageSegments } from '../StageMeter';
import { FigureTile, KeyArtTile, PlateTile, PosterTile, SleeveTile, StillCard, TileSkeleton } from '../tiles';
import { Rail } from '../Rail';
import { EpisodeCard, EpisodeRow, SeasonPicker } from '../Episodes';
import { CastGrid, CastRow } from '../CastRow';
import { CompactHeader } from '../CompactHeader';
import { BackdropHero, DiptychHero, FigureHero, PlateHero, SleeveHero, TheatreHero } from '../hero';
import { EPISODE, PEOPLE, PLACES, SHORTS, SHOWS, SONGS } from './data';
import { Block, Cell, Word } from './ui';

/** The media section of the specimen page: every §5.3–5.9 part in its states. */
export function MediaSection() {
  const [season, setSeason] = useState('s1');
  const [light, setLight] = useState('day');
  const song = SONGS[0];
  const songTrack: Track = { id: 'spec-river-lights', src: song.audio!, title: song.title, subtitle: song.performers!, artworkSrc: song.sleeve!, duration: song.duration };
  const rooftopTrack: Track = { id: 'spec-rooftop-radio', src: SONGS[1].audio!, title: SONGS[1].title, subtitle: SONGS[1].performers!, artworkSrc: SONGS[1].sleeve!, duration: SONGS[1].duration };
  const voice = (p: (typeof PEOPLE)[number]): Track | null => (p.voice ? { id: `spec-voice-${p.id}`, src: p.voice, title: p.name, duration: 3 } : null);
  const people = PEOPLE.map((p) => ({ id: p.id, name: p.name, nameLang: 'en', role: p.role, src: p.src, voice: voice(p) }));
  const strip = EPISODE.shots.map((s) => ({ id: s.id, number: s.n, src: s.frame, label: s.purpose }));
  const more = (title: string) => <Menu label={`${title}: ${T('nav.more')}`}><MenuItem icon={<IconEdit />}>{T('media.spec.a.edit')}</MenuItem></Menu>;
  const min = (n: number) => T.f('media.spec.f.min', { n });

  return (
    <section id="media" className="spec-section" aria-labelledby="spec-media-h">
      <h2 id="spec-media-h" className="h2 spec-section-h">{T('media.spec.media')}</h2>

      <Block title={T('media.spec.frames')}>
        <div className="spec-row spec-row-4">
          <Cell label={T('media.spec.ready')}><Frame src={SHOWS[0].art} ratio="16/9" alt={T.f('media.alt.keyArt', { title: SHOWS[0].title })} /></Cell>
          <Cell label={T('media.spec.drawing')}><Frame src={SHOWS[1].art} ratio="16/9" alt={T.f('media.alt.keyArt', { title: SHOWS[1].title })} state="drawing" phase={T('media.spec.phase')} /></Cell>
          <Cell label={T('media.spec.missing')}><Frame ratio="16/9" alt="" title={SHOWS[2].title} titleLang="en" titleState="noKeyArt" /></Cell>
          <Cell label={T('media.spec.unavailable')}><Frame src="/sample/covers/missing-file.svg" ratio="16/9" alt="" title={SHOWS[0].title} titleLang="en" /></Cell>
        </div>
        <div className="spec-row spec-row-6">
          <Cell label="2:3"><Frame src={SHORTS[0].poster} ratio="2/3" alt={T.f('media.alt.poster', { title: SHORTS[0].title })} /></Cell>
          <Cell label="1:1"><Frame src={song.sleeve} ratio="1/1" alt={T.f('media.alt.sleeve', { title: song.title })} /></Cell>
          <Cell label={`928:1664 · ${T('media.spec.letterbox')}`}><Frame src={PEOPLE[0].src} ratio="928/1664" fit="contain" alt={T.f('media.alt.figure', { name: PEOPLE[0].name })} art={{ '--art-edge': 'var(--ink-850)' }} /></Cell>
          <Cell label="2:3 · title card"><TitleCard title={SHORTS[4].title} lang="en" ratio="2/3" state="notMade" /></Cell>
          <Cell label="16:9 · episode"><TitleCard title={EPISODE.title} lang="en" ratio="16/9" number={3} state="notDrawn" /></Cell>
          <Cell label="2.39:1"><Frame src={PLACES[0].plate} ratio="2.39/1" alt={T.f('media.alt.plate', { name: PLACES[0].name })} /></Cell>
        </div>
      </Block>

      <Block title={T('media.spec.slates')}>
        <div className="spec-stack">
          <Slate size="hero" items={[T('media.spec.f.show'), '2026', T('media.spec.f.seasons'), T('media.spec.f.episodes'), T.dyn('style.CARTOON'), T('media.spec.f.iraqi')]} status={<Word tone="warn">{T('media.spec.st.waiting')}</Word>} />
          <Slate size="tile" items={[T('media.spec.f.seasons'), T('media.spec.f.episodes'), T.dyn('style.CARTOON')]} status={<Word tone="warn">{T('media.spec.st.oneWaiting')}</Word>} />
          <Slate size="header" items={[min(6)]} status={<Word tone="info" live>{T('media.spec.st.producing')}</Word>} />
          <p className="spec-meters">
            <StageMeter segments={stageSegments(0, 'current', 6, true)} /> <StageMeter segments={stageSegments(2, 'running')} /> <StageMeter segments={stageSegments(0, 'waiting')} /> <StageMeter segments={stageSegments(4, 'current')} />
          </p>
          <div className="spec-faces">
            {[24, 28, 40, 56, 88].map((s) => <FaceCircle key={s} name={PEOPLE[1].name} src={PEOPLE[1].src} size={s as 24} />)}
            <FaceCircle name={PEOPLE[5].name} size={56} lang="en" />
            <FaceCircle name={PEOPLE[4].name} src={PEOPLE[4].src} size={56} ring="speaking" />
            <FaceCircle name={PEOPLE[0].name} src={PEOPLE[0].src} size={56} ring="director" />
          </div>
        </div>
      </Block>

      <Block title={T('media.spec.tiles')}>
        <div className="mgrid" data-tile="keyart">
          {SHOWS.map((s, i) => <KeyArtTile key={s.id} title={s.title} titleLang="en" href="#media" src={s.art} logline={s.logline} menu={more(s.title)}
            slate={[T('media.spec.f.seasons'), T('media.spec.f.episodes'), T.dyn('style.CARTOON')]} status={i === 0 ? <Word tone="warn">{T('media.spec.st.oneWaiting')}</Word> : undefined} />)}
        </div>
        <div className="mgrid spec-gap" data-tile="poster">
          {SHORTS.map((s, i) => <PosterTile key={s.id} title={s.title} titleLang="en" href="#media" src={s.poster} menu={more(s.title)} slate={[s.runtime ? min(s.runtime) : null]}
            status={i === 0 ? <Word tone="info" live>{T('media.spec.st.producing')}</Word> : i === 4 ? <Word>{T('media.spec.st.story')}</Word> : <Word tone="ok">{T('media.spec.st.finished')}</Word>} />)}
        </div>
        <div className="mgrid spec-gap" data-tile="sleeve">
          {SONGS.map((s, i) => <SleeveTile key={s.id} title={s.title} titleLang="en" href="#media" src={s.sleeve} performers={s.performers ? s.performers : undefined} menu={more(s.title)}
            track={i === 0 ? songTrack : i === 1 ? rooftopTrack : null} slate={[s.duration ? `0:${s.duration}` : null]} status={<Word>{T('media.spec.st.story')}</Word>} />)}
          <SleeveTile title={SONGS[0].title} titleLang="en" onSelect={() => undefined} selected src={SONGS[0].sleeve} slate={[T('media.spec.selected')]} />
          <TileSkeleton ratio="1/1" />
        </div>
        <div className="mgrid spec-gap" data-tile="figure">
          {PEOPLE.map((p, i) => <FigureTile key={p.id} title={p.name} titleLang="en" href="#media" src={p.src} role={p.role} voice={voice(p)} menu={more(p.name)}
            status={i === 3 ? <Word tone="warn">{T('media.spec.st.draft')}</Word> : !p.src ? <Word>{T('media.spec.st.noImage')}</Word> : <Word tone="ok">{T('media.spec.st.approved')}</Word>}
            slate={[p.voice ? T('media.spec.f.voice') : T('media.spec.f.noVoice')]} />)}
        </div>
        <div className="mgrid spec-gap" data-tile="plate">
          {PLACES.slice(0, 2).map((p) => <PlateTile key={p.id} title={p.name} titleLang="en" href="#media" src={p.plate} lighting={[{ src: p.night }, { src: p.view }]} menu={more(p.name)}
            slate={[T('media.spec.f.interior'), T('media.spec.f.lighting'), T('media.spec.f.used')]} />)}
        </div>
        <div className="mgrid spec-gap" data-tile="still">
          <StillCard title={EPISODE.title} titleLang="en" href="#media" src={EPISODE.still} kindLabel={T.f('media.episode', { n: 1 })} synopsis={EPISODE.synopsis} duration="0:12" slate={[min(5)]} status={<Word tone="ok">{T('media.spec.st.finalCut')}</Word>} menu={more(EPISODE.title)} />
          <StillCard title={EPISODE.title} titleLang="en" href="#media" kindLabel={T.f('media.spec.f.cut', { n: 1 })} number={3} slate={[min(5)]} />
          <TileSkeleton ratio="16/9" lines={3} />
        </div>
      </Block>

      <Block title={T('media.spec.rails')}>
        <Rail title={T('media.spec.episodes')} count={EPISODE.shots.length} item="still" seeAll={{ href: '#media' }}>
          {EPISODE.shots.map((s) => <StillCard key={s.id} title={s.purpose} href="#media" src={s.frame} kindLabel={T.f('media.shot', { n: s.n })} duration={`0:0${s.d}`} slate={[]} />)}
        </Rail>
      </Block>

      <Block title={T('media.spec.episodes')}>
        <div className="spec-stack">
          <SeasonPicker value={season} onChange={setSeason} count={T.p('media.season.episodes', 3)} onPropose={() => undefined} onWrite={() => undefined}
            seasons={[{ id: 's1', number: 1, episodes: 2 }, { id: 's2', number: 2, episodes: 1 }]} />
          <div className="mgrid" data-tile="still">
            <EpisodeCard e={{ number: 1, title: EPISODE.title, titleLang: 'en', href: '#media', src: EPISODE.still, synopsis: EPISODE.synopsis, runtime: min(5), duration: '0:12', segments: stageSegments(0, 'current', 6, true), status: <Word tone="ok">{T('media.spec.st.finished')}</Word> }} />
            <EpisodeCard e={{ number: 2, title: SHORTS[3].title, titleLang: 'en', href: '#media', src: '/sample/covers/last-sip-s1e2.svg', runtime: min(5), segments: stageSegments(2, 'running'), status: <Word tone="info" live>{T('media.spec.st.storyboard')}</Word> }} />
            <EpisodeCard e={{ number: 3, title: 'Untitled', titleLang: 'en', href: '#media', segments: stageSegments(0, 'waiting'), status: <Word tone="warn">{T('media.spec.st.waiting')}</Word> }} />
          </div>
          <div>
            <EpisodeRow e={{ number: 1, title: EPISODE.title, titleLang: 'en', href: '#media', src: EPISODE.still, synopsis: EPISODE.synopsis, runtime: min(5), segments: stageSegments(0, 'current', 6, true), status: <Word tone="ok">{T('media.spec.st.finished')}</Word> }} onPlay={() => undefined} />
            <EpisodeRow e={{ number: 3, title: 'Untitled', titleLang: 'en', href: '#media', segments: stageSegments(0, 'waiting'), status: <Word tone="warn">{T('media.spec.st.waiting')}</Word> }} />
          </div>
        </div>
      </Block>

      <Block title={T('media.spec.cast')}>
        <CastGrid members={people.map((p, i) => ({ ...p, href: '#media', appearance: i === 4 ? T('media.spec.f.sings') : T('media.spec.f.inEpisodes'), ring: i === 4 ? ('speaking' as const) : undefined }))} />
        <div className="spec-gap"><CastRow members={people.map((p) => ({ ...p, href: '#media' }))} max={4} moreHref="#media" /></div>
      </Block>

      <Block title={T('media.spec.heroes')}>
        <Cell label={`${T('media.spec.hero.backdrop')} · ${T('media.spec.tinted')}`} className="spec-hero">
          <BackdropHero headingLevel={4} picture={{ src: SHOWS[0].art! }} alt={T.f('media.alt.keyArt', { title: SHOWS[0].title })} preview={{ src: EPISODE.cut }} onWatchWithSound={() => undefined}
            art={{ '--art': 'oklch(0.2 0.04 55)' }} title={SHOWS[0].title} titleLang="en"
            slate={[T('media.spec.f.show'), '2026', T('media.spec.f.seasons'), T('media.spec.f.episodes'), T.dyn('style.CARTOON'), T('media.spec.f.iraqi')]}
            altTitle={{ text: 'آخر رشفة', lang: 'ar' }}
            lead={SHOWS[0].logline}
            actions={<><Button variant="primary">{T('media.spec.a.continueEp')}</Button><Button icon={<IconPlay />}>{T('media.spec.a.playCut')}</Button>{more(SHOWS[0].title)}</>} />
        </Cell>
        <Cell label={`${T('media.spec.hero.backdrop')} · ${T('media.spec.neutral')}`} className="spec-hero">
          <BackdropHero headingLevel={4} picture={null} alt="" title={SHOWS[2].title} titleLang="en" slate={[T('media.spec.f.show'), T.dyn('style.ANIME')]} lead={SHOWS[2].logline} actions={<Button variant="primary">{T('media.spec.a.continue')}</Button>} />
        </Cell>
        <Cell label={`${T('media.spec.hero.diptych')} · ${T('media.spec.tinted')}`} className="spec-hero">
          <DiptychHero headingLevel={4} poster={{ src: SHORTS[0].poster! }} posterAlt={T.f('media.alt.poster', { title: SHORTS[0].title })} title={SHORTS[0].title} titleLang="en"
            slate={[T('media.spec.f.short'), '2026', min(2), T.dyn('style.REALISTIC'), T('media.spec.f.english')]} status={<Word tone="info" live>{T('media.spec.st.producing')}</Word>}
            player={<StoryboardReel shots={EPISODE.shots.map((s) => ({ id: s.id, number: s.n, src: s.frame, duration: s.d }))} />}
            strip={<FilmStrip frames={strip} hrefFor={() => '#media'} />}
            lead="Two brothers race paper boats down a gutter after the first rain in a year."
            actions={<><Button variant="primary">{T('media.spec.a.continue')}</Button>{more(SHORTS[0].title)}</>} art={{ '--art': 'oklch(0.2 0.035 230)' }} />
        </Cell>
        <Cell label={T('media.spec.hero.episode')} className="spec-hero">
          <DiptychHero headingLevel={4} poster={null} title={EPISODE.title} titleLang="en" slate={[T.f('media.episode', { n: 1 }), min(5)]} status={<Word tone="ok">{T('media.spec.st.finalCut')}</Word>}
            player={<InlinePlayer src={EPISODE.cut} poster={EPISODE.still} title={EPISODE.title} />} strip={<FilmStrip frames={strip} onSelect={() => undefined} current="s1" />}
            lead={EPISODE.synopsis} actions={<Button variant="primary">{T('media.spec.a.continue')}</Button>} />
        </Cell>
        <Cell label={`${T('media.spec.hero.sleeve')} · ${T('media.spec.tinted')}`} className="spec-hero">
          <SleeveHero headingLevel={4} sleeve={{ src: song.sleeve! }} sleeveAlt={T.f('media.alt.sleeve', { title: song.title })} title={song.title} titleLang="en" art={{ '--art': 'oklch(0.2 0.045 250)' }}
            slate={[T('media.spec.f.musicVideo'), '2026', '0:48', T.p('media.count.sections', 4), T.p('media.count.shots', 3)]} status={<Word>{T('media.spec.st.story')}</Word>}
            performers={<CastRow members={[people[4]]} />}
            transport={<SongTransport track={songTrack} title={song.title} mode="song" onMode={() => undefined} videoDisabledReason={T('media.mode.noCut')}
              action={<Button>{T('media.spec.a.continue')}<IconChevronRight aria-hidden /></Button>} />} />
        </Cell>
        <Cell label={T('media.spec.hero.figure')} className="spec-hero">
          <FigureHero headingLevel={4} figure={{ src: '/sample/characters/hana-full-body.svg' }} figureAlt={T.f('media.alt.figure', { name: PEOPLE[3].name })} title={PEOPLE[3].name} titleLang="en"
            judge art={{ '--art-edge': 'var(--ink-850)', '--art': 'oklch(0.2 0.04 20)' }}
            slate={[T('media.spec.f.character'), T.dyn('style.ANIME'), T('media.spec.f.english')]} status={<Word tone="warn">{T('media.spec.st.draft')}</Word>}
            lead={PEOPLE[3].role}
            voice={<VoicePreview track={{ id: 'spec-voice-hana', src: '/sample/audio/voice-mid-sample.m4a', title: PEOPLE[3].name, duration: 3 }} name={PEOPLE[3].name} origin={T('media.spec.f.studioVoice')} line="Twelve. Twelve. Where is twelve." lineLang="en" />}
            actions={<><Button variant="primary">{T('media.spec.a.approve')}</Button><Button>{T('media.spec.a.redraw')}</Button><Button>{T('media.spec.a.edit')}</Button></>} />
        </Cell>
        <Cell label={`${T('media.spec.hero.plate')} · ${T('media.spec.tinted')}`} className="spec-hero">
          <PlateHero headingLevel={4} current={light} title={PLACES[1].name} titleLang="en" art={{ '--art': 'oklch(0.2 0.04 70)' }}
            plates={[{ key: 'day', picture: { src: PLACES[1].plate }, alt: T.f('media.alt.plate', { name: PLACES[1].name }) }, { key: 'night', picture: { src: PLACES[1].night }, alt: `${T.f('media.alt.plate', { name: PLACES[1].name })} · ${T('media.spec.light.night')}` }]}
            lighting={<Segmented value={light} onChange={setLight} label={T('media.spec.light.label')} options={[{ value: 'day', label: T('media.spec.light.day') }, { value: 'night', label: T('media.spec.light.night') }]} />}
            slate={[T('media.spec.f.location'), T('media.spec.f.exterior'), T.dyn('style.REALISTIC'), T('media.spec.f.used')]}
            actions={<><Button variant="primary">{T('media.spec.a.use')}</Button><Button>{T('media.spec.a.edit')}</Button></>} />
        </Cell>
        <Cell label={T('media.spec.hero.theatre')} className="spec-hero spec-theatre" >
          <div data-room="theatre" className="spec-theatre-room">
            <TheatreHero headingLevel={4} label={T('media.hero.nowScreening')} title={EPISODE.title} titleLang="en"
              player={<TheatrePlayer src={EPISODE.cut} poster={EPISODE.still} title={EPISODE.title} notes={[{ at: 4, text: 'Hold on the keys' }, { at: 9, text: 'Cut earlier' }]} />}
              slate={[T('media.spec.f.short'), '0:12', T.f('media.spec.f.cut', { n: 1 }), T('media.spec.f.daysAgo')]} status={<Word tone="ok">{T('media.spec.st.approved')}</Word>}
              actions={<><Button>{T('media.spec.a.download')}</Button>{more(EPISODE.title)}</>} />
          </div>
        </Cell>
      </Block>

      <Block title={T('media.spec.compact')}>
        <div data-room="cutting" className="spec-compact">
          <CompactHeader mode="cutting" contained back={{ href: '#media', label: T.f('media.hero.back', { area: T('nav.shorts') }) }} thumb={{ src: SHORTS[0].poster, shape: 'poster' }} title={SHORTS[0].title} titleLang="en"
            status={<Word tone="info" live>{T('media.spec.st.producing')}</Word>} saveState={T('media.spec.saved')} primary={<Button variant="primary" size="sm">{T('media.spec.a.continue')}</Button>} more={more(SHORTS[0].title)} />
        </div>
      </Block>
    </section>
  );
}
