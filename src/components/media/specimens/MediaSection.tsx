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
  const more = (title: string) => <Menu label={`${title}: ${'More'}`}><MenuItem icon={<IconEdit />}>Edit</MenuItem></Menu>;
  const min = (n: number) => `${n} min`;

  return (
    <section id="media" className="spec-section" aria-labelledby="spec-media-h">
      <h2 id="spec-media-h" className="h2 spec-section-h">Media</h2>

      <Block title={'Frames and title cards'}>
        <div className="spec-row spec-row-4">
          <Cell label={'Ready'}><Frame src={SHOWS[0].art} ratio="16/9" alt={`Key art for ${SHOWS[0].title}`} /></Cell>
          <Cell label={'Drawing'}><Frame src={SHOWS[1].art} ratio="16/9" alt={`Key art for ${SHOWS[1].title}`} state="drawing" phase={'Drawing Hana · 2nd in the queue'} /></Cell>
          <Cell label={'No picture'}><Frame ratio="16/9" alt="" title={SHOWS[2].title} titleLang="en" titleState="noKeyArt" /></Cell>
          <Cell label={'File missing'}><Frame src="/sample/covers/missing-file.svg" ratio="16/9" alt="" title={SHOWS[0].title} titleLang="en" /></Cell>
        </div>
        <div className="spec-row spec-row-6">
          <Cell label="2:3"><Frame src={SHORTS[0].poster} ratio="2/3" alt={`Poster for ${SHORTS[0].title}`} /></Cell>
          <Cell label="1:1"><Frame src={song.sleeve} ratio="1/1" alt={`Cover art for ${song.title}`} /></Cell>
          <Cell label={`928:1664 · ${'Letterboxed on its own edge colour'}`}><Frame src={PEOPLE[0].src} ratio="928/1664" fit="contain" alt={`Full-length image of ${PEOPLE[0].name}`} art={{ '--art-edge': 'var(--ink-850)' }} /></Cell>
          <Cell label="2:3 · title card"><TitleCard title={SHORTS[4].title} lang="en" ratio="2/3" state="notMade" /></Cell>
          <Cell label="16:9 · episode"><TitleCard title={EPISODE.title} lang="en" ratio="16/9" number={3} state="notDrawn" /></Cell>
          <Cell label="2.39:1"><Frame src={PLACES[0].plate} ratio="2.39/1" alt={`Master plate of ${PLACES[0].name}`} /></Cell>
        </div>
      </Block>

      <Block title={'Slates, stage meters and faces'}>
        <div className="spec-stack">
          <Slate size="hero" items={['Show', '2026', '2 seasons', '3 episodes', T.dyn('style.CARTOON'), 'Arabic (Iraqi)']} status={<Word tone="warn">Waiting for you</Word>} />
          <Slate size="tile" items={['2 seasons', '3 episodes', T.dyn('style.CARTOON')]} status={<Word tone="warn">1 waiting for you</Word>} />
          <Slate size="header" items={[min(6)]} status={<Word tone="info" live>Producing · shot 7 of 20</Word>} />
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

      <Block title={'Tiles'}>
        <div className="mgrid" data-tile="keyart">
          {SHOWS.map((s, i) => <KeyArtTile key={s.id} title={s.title} titleLang="en" href="#media" src={s.art} logline={s.logline} menu={more(s.title)}
            slate={['2 seasons', '3 episodes', T.dyn('style.CARTOON')]} status={i === 0 ? <Word tone="warn">1 waiting for you</Word> : undefined} />)}
        </div>
        <div className="mgrid spec-gap" data-tile="poster">
          {SHORTS.map((s, i) => <PosterTile key={s.id} title={s.title} titleLang="en" href="#media" src={s.poster} menu={more(s.title)} slate={[s.runtime ? min(s.runtime) : null]}
            status={i === 0 ? <Word tone="info" live>Producing · shot 7 of 20</Word> : i === 4 ? <Word>Story</Word> : <Word tone="ok">Finished</Word>} />)}
        </div>
        <div className="mgrid spec-gap" data-tile="sleeve">
          {SONGS.map((s, i) => <SleeveTile key={s.id} title={s.title} titleLang="en" href="#media" src={s.sleeve} performers={s.performers ? s.performers : undefined} menu={more(s.title)}
            track={i === 0 ? songTrack : i === 1 ? rooftopTrack : null} slate={[s.duration ? `0:${s.duration}` : null]} status={<Word>Story</Word>} />)}
          <SleeveTile title={SONGS[0].title} titleLang="en" onSelect={() => undefined} selected src={SONGS[0].sleeve} slate={['Selected, in a picker']} />
          <TileSkeleton ratio="1/1" />
        </div>
        <div className="mgrid spec-gap" data-tile="figure">
          {PEOPLE.map((p, i) => <FigureTile key={p.id} title={p.name} titleLang="en" href="#media" src={p.src} role={p.role} voice={voice(p)} menu={more(p.name)}
            status={i === 3 ? <Word tone="warn">Draft — awaiting your approval</Word> : !p.src ? <Word>No image yet</Word> : <Word tone="ok">Approved</Word>}
            slate={[p.voice ? 'Voice' : 'No voice']} />)}
        </div>
        <div className="mgrid spec-gap" data-tile="plate">
          {PLACES.slice(0, 2).map((p) => <PlateTile key={p.id} title={p.name} titleLang="en" href="#media" src={p.plate} lighting={[{ src: p.night }, { src: p.view }]} menu={more(p.name)}
            slate={['Interior', 'Morning · Afternoon · Night', 'in 2 productions']} />)}
        </div>
        <div className="mgrid spec-gap" data-tile="still">
          <StillCard title={EPISODE.title} titleLang="en" href="#media" src={EPISODE.still} kindLabel={`Episode ${1}`} synopsis={EPISODE.synopsis} duration="0:12" slate={[min(5)]} status={<Word tone="ok">Final cut ready</Word>} menu={more(EPISODE.title)} />
          <StillCard title={EPISODE.title} titleLang="en" href="#media" kindLabel={`Cut ${1}`} number={3} slate={[min(5)]} />
          <TileSkeleton ratio="16/9" lines={3} />
        </div>
      </Block>

      <Block title={'Rail'}>
        <Rail title={'Episodes'} count={EPISODE.shots.length} item="still" seeAll={{ href: '#media' }}>
          {EPISODE.shots.map((s) => <StillCard key={s.id} title={s.purpose} href="#media" src={s.frame} kindLabel={`Shot ${s.n}`} duration={`0:0${s.d}`} slate={[]} />)}
        </Rail>
      </Block>

      <Block title={'Episodes'}>
        <div className="spec-stack">
          <SeasonPicker value={season} onChange={setSeason} count={T.p('media.season.episodes', 3)} onPropose={() => undefined} onWrite={() => undefined}
            seasons={[{ id: 's1', number: 1, episodes: 2 }, { id: 's2', number: 2, episodes: 1 }]} />
          <div className="mgrid" data-tile="still">
            <EpisodeCard e={{ number: 1, title: EPISODE.title, titleLang: 'en', href: '#media', src: EPISODE.still, synopsis: EPISODE.synopsis, runtime: min(5), duration: '0:12', segments: stageSegments(0, 'current', 6, true), status: <Word tone="ok">Finished</Word> }} />
            <EpisodeCard e={{ number: 2, title: SHORTS[3].title, titleLang: 'en', href: '#media', src: '/sample/covers/last-sip-s1e2.svg', runtime: min(5), segments: stageSegments(2, 'running'), status: <Word tone="info" live>Storyboard · 12 of 20 frames</Word> }} />
            <EpisodeCard e={{ number: 3, title: 'Untitled', titleLang: 'en', href: '#media', segments: stageSegments(0, 'waiting'), status: <Word tone="warn">Waiting for you</Word> }} />
          </div>
          <div>
            <EpisodeRow e={{ number: 1, title: EPISODE.title, titleLang: 'en', href: '#media', src: EPISODE.still, synopsis: EPISODE.synopsis, runtime: min(5), segments: stageSegments(0, 'current', 6, true), status: <Word tone="ok">Finished</Word> }} onPlay={() => undefined} />
            <EpisodeRow e={{ number: 3, title: 'Untitled', titleLang: 'en', href: '#media', segments: stageSegments(0, 'waiting'), status: <Word tone="warn">Waiting for you</Word> }} />
          </div>
        </div>
      </Block>

      <Block title={'Cast'}>
        <CastGrid members={people.map((p, i) => ({ ...p, href: '#media', appearance: i === 4 ? 'sings 2 of 4 sections' : 'in 3 episodes · S1', ring: i === 4 ? ('speaking' as const) : undefined }))} />
        <div className="spec-gap"><CastRow members={people.map((p) => ({ ...p, href: '#media' }))} max={4} moreHref="#media" /></div>
      </Block>

      <Block title={'Heroes'}>
        <Cell label={`${'Backdrop hero · Show page'} · ${'With an example tint'}`} className="spec-hero">
          <BackdropHero headingLevel={4} picture={{ src: SHOWS[0].art! }} alt={`Key art for ${SHOWS[0].title}`} preview={{ src: EPISODE.cut }} onWatchWithSound={() => undefined}
            art={{ '--art': 'oklch(0.2 0.04 55)' }} title={SHOWS[0].title} titleLang="en"
            slate={['Show', '2026', '2 seasons', '3 episodes', T.dyn('style.CARTOON'), 'Arabic (Iraqi)']}
            altTitle={{ text: 'آخر رشفة', lang: 'ar' }}
            lead={SHOWS[0].logline}
            actions={<><Button variant="primary">Continue S1 · E2: Produce</Button><Button icon={<IconPlay />}>Play cut</Button>{more(SHOWS[0].title)}</>} />
        </Cell>
        <Cell label={`${'Backdrop hero · Show page'} · ${'Neutral: no presentation data'}`} className="spec-hero">
          <BackdropHero headingLevel={4} picture={null} alt="" title={SHOWS[2].title} titleLang="en" slate={['Show', T.dyn('style.ANIME')]} lead={SHOWS[2].logline} actions={<Button variant="primary">Continue: Storyboard</Button>} />
        </Cell>
        <Cell label={`${'Diptych hero · Short Overview'} · ${'With an example tint'}`} className="spec-hero">
          <DiptychHero headingLevel={4} poster={{ src: SHORTS[0].poster! }} posterAlt={`Poster for ${SHORTS[0].title}`} title={SHORTS[0].title} titleLang="en"
            slate={['Short', '2026', min(2), T.dyn('style.REALISTIC'), 'English']} status={<Word tone="info" live>Producing · shot 7 of 20</Word>}
            player={<StoryboardReel shots={EPISODE.shots.map((s) => ({ id: s.id, number: s.n, src: s.frame, duration: s.d }))} />}
            strip={<FilmStrip frames={strip} hrefFor={() => '#media'} />}
            lead="Two brothers race paper boats down a gutter after the first rain in a year."
            actions={<><Button variant="primary">Continue: Storyboard</Button>{more(SHORTS[0].title)}</>} art={{ '--art': 'oklch(0.2 0.035 230)' }} />
        </Cell>
        <Cell label={'Diptych without a poster · Episode Overview'} className="spec-hero">
          <DiptychHero headingLevel={4} poster={null} title={EPISODE.title} titleLang="en" slate={[`Episode ${1}`, min(5)]} status={<Word tone="ok">Final cut ready</Word>}
            player={<InlinePlayer src={EPISODE.cut} poster={EPISODE.still} title={EPISODE.title} />} strip={<FilmStrip frames={strip} onSelect={() => undefined} current="s1" />}
            lead={EPISODE.synopsis} actions={<Button variant="primary">Continue: Storyboard</Button>} />
        </Cell>
        <Cell label={`${'Sleeve hero · Music video'} · ${'With an example tint'}`} className="spec-hero">
          <SleeveHero headingLevel={4} sleeve={{ src: song.sleeve! }} sleeveAlt={`Cover art for ${song.title}`} title={song.title} titleLang="en" art={{ '--art': 'oklch(0.2 0.045 250)' }}
            slate={['Music video', '2026', '0:48', T.p('media.count.sections', 4), T.p('media.count.shots', 3)]} status={<Word>Story</Word>}
            performers={<CastRow members={[people[4]]} />}
            transport={<SongTransport track={songTrack} title={song.title} mode="song" onMode={() => undefined} videoDisabledReason={'No cut yet'}
              action={<Button>Continue: Storyboard<IconChevronRight aria-hidden /></Button>} />} />
        </Cell>
        <Cell label={'Figure hero · Character profile'} className="spec-hero">
          <FigureHero headingLevel={4} figure={{ src: '/sample/characters/hana-full-body.svg' }} figureAlt={`Full-length image of ${PEOPLE[3].name}`} title={PEOPLE[3].name} titleLang="en"
            judge art={{ '--art-edge': 'var(--ink-850)', '--art': 'oklch(0.2 0.04 20)' }}
            slate={['Character', T.dyn('style.ANIME'), 'English']} status={<Word tone="warn">Draft — awaiting your approval</Word>}
            lead={PEOPLE[3].role}
            voice={<VoicePreview track={{ id: 'spec-voice-hana', src: '/sample/audio/voice-mid-sample.m4a', title: PEOPLE[3].name, duration: 3 }} name={PEOPLE[3].name} origin={'Studio-designed synthetic voice'} line="Twelve. Twelve. Where is twelve." lineLang="en" />}
            actions={<><Button variant="primary">Approve</Button><Button>Redraw</Button><Button>Edit</Button></>} />
        </Cell>
        <Cell label={`${'Plate hero · Location page'} · ${'With an example tint'}`} className="spec-hero">
          <PlateHero headingLevel={4} current={light} title={PLACES[1].name} titleLang="en" art={{ '--art': 'oklch(0.2 0.04 70)' }}
            plates={[{ key: 'day', picture: { src: PLACES[1].plate }, alt: `Master plate of ${PLACES[1].name}` }, { key: 'night', picture: { src: PLACES[1].night }, alt: `${`Master plate of ${PLACES[1].name}`} · ${'Night'}` }]}
            lighting={<Segmented value={light} onChange={setLight} label={'Lighting'} options={[{ value: 'day', label: 'Day' }, { value: 'night', label: 'Night' }]} />}
            slate={['Location', 'Exterior', T.dyn('style.REALISTIC'), 'in 2 productions']}
            actions={<><Button variant="primary">Use in a production</Button><Button>Edit</Button></>} />
        </Cell>
        <Cell label={'Theatre hero · Screening Room'} className="spec-hero spec-theatre" >
          <div data-room="theatre" className="spec-theatre-room">
            <TheatreHero headingLevel={4} label={'Now screening'} title={EPISODE.title} titleLang="en"
              player={<TheatrePlayer src={EPISODE.cut} poster={EPISODE.still} title={EPISODE.title} notes={[{ at: 4, text: 'Hold on the keys' }, { at: 9, text: 'Cut earlier' }]} />}
              slate={['Short', '0:12', `Cut ${1}`, '2 days ago']} status={<Word tone="ok">Approved</Word>}
              actions={<><Button>Download</Button>{more(EPISODE.title)}</>} />
          </div>
        </Cell>
      </Block>

      <Block title={'Compact header'}>
        <div data-room="cutting" className="spec-compact">
          <CompactHeader mode="cutting" contained back={{ href: '#media', label: `Back to ${'Shorts'}` }} thumb={{ src: SHORTS[0].poster, shape: 'poster' }} title={SHORTS[0].title} titleLang="en"
            status={<Word tone="info" live>Producing · shot 7 of 20</Word>} saveState={'Saved'} primary={<Button variant="primary" size="sm">Continue: Storyboard</Button>} more={more(SHORTS[0].title)} />
        </div>
      </Block>
    </section>
  );
}
