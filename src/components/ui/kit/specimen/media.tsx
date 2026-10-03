'use client';

import { useState } from 'react';
import { Button, Menu, MenuItem, Segmented, StateWord, Shelf } from '@/components/ui/kit';
import { IconChevronRight, IconEdit, IconPlay } from '@/components/ui/icons';
import type { Track } from '@/components/players/PlayerProvider';
import { SongTransport } from '@/components/players/music/SongTransport';
import { VoicePreview } from '@/components/players/music/VoicePreview';
import { InlinePlayer } from '@/components/players/InlinePlayer';
import { TheatrePlayer } from '@/components/players/TheatrePlayer';
import { FilmStrip } from '@/components/edit/FilmStrip';
import { StoryboardReel } from '@/components/edit/StoryboardReel';
import { Frame } from '@/components/media/Frame';
import { TitleCard } from '@/components/media/TitleCard';
import { Slate } from '@/components/media/Slate';
import { FaceCircle } from '@/components/media/FaceCircle';
import { StageMeter, stageSegments } from '@/components/media/StageMeter';
import { MediaTile } from '@/components/media/Cards';
import { MediaTileSkeleton } from '@/components/media/Skeletons';
import { EpisodeCard, EpisodeRow, SeasonPicker } from '@/components/media/Episodes';
import { CastGrid, CastRow } from '@/components/media/CastRow';
import { BackdropHero, DiptychHero, FigureHero, PlateHero, SleeveHero, TheatreHero } from '@/components/media/hero';
import { EPISODE, PEOPLE, PLACES, SHORTS, SHOWS, SONGS } from './data';
import { Block, Figure, SpecSection } from './parts';

/** /kit — THE MEDIA KIT: frames and title cards, slates, faces and the stage meter, media tiles (catalogue grids),
 *  episodes, cast, the six heroes. Real sizes, every state, on the bundled sample media. */
export function MediaSpec() {
  const [season, setSeason] = useState('s1');
  const [light, setLight] = useState('day');
  const [picked, setPicked] = useState(true);
  const song = SONGS[0];
  const songTrack: Track = { id: 'spec-river-lights', src: song.audio!, title: song.title, subtitle: song.performers!, artworkSrc: song.sleeve!, duration: song.duration };
  const voice = (p: (typeof PEOPLE)[number]): Track | null => (p.voice ? { id: `spec-voice-${p.id}`, src: p.voice, title: p.name, duration: 3 } : null);
  const people = PEOPLE.map((p) => ({ id: p.id, name: p.name, nameLang: 'en', role: p.role, src: p.src, voice: voice(p) }));
  const strip = EPISODE.shots.map((s) => ({ id: s.id, number: s.n, src: s.frame, label: s.purpose }));
  const more = (title: string) => <Menu label={`${title}: More`}><MenuItem icon={<IconEdit />}>Edit</MenuItem></Menu>;
  const min = (n: number) => `${n} min`;

  return (
    <SpecSection id="media" title="Media" lead="Frames load the display thumbnail on the picture's own colour, fade in once decoded and retry once; an object without a picture is a title card in its own shape.">
      <Block title="Frames and title cards">
        <div className="spec-row spec-row-4">
          <Figure label="Ready"><Frame src={SHOWS[0].art} ratio="16/9" alt={`Key art for ${SHOWS[0].title}`} /></Figure>
          <Figure label="Drawing"><Frame src={SHOWS[1].art} ratio="16/9" alt={`Key art for ${SHOWS[1].title}`} state="drawing" phase="Drawing key art · 2nd in the queue" /></Figure>
          <Figure label="No picture yet"><Frame ratio="16/9" alt="" title={SHOWS[2].title} titleLang="en" titleState="noKeyArt" /></Figure>
          <Figure label="Picture unavailable"><Frame src="/sample/covers/missing-file.svg" ratio="16/9" alt={`Key art for ${SHOWS[0].title}`} /></Figure>
        </div>
        <div className="spec-row spec-row-6">
          <Figure label="2:3"><Frame src={SHORTS[0].poster} ratio="2/3" alt={`Poster for ${SHORTS[0].title}`} /></Figure>
          <Figure label="1:1"><Frame src={song.sleeve} ratio="1/1" alt={`Sleeve for ${song.title}`} /></Figure>
          <Figure label="928:1664 · contain on its field"><Frame src={PEOPLE[0].src} ratio="928/1664" fit="contain" alt={PEOPLE[0].name} /></Figure>
          <Figure label="2:3 · title card"><TitleCard title={SHORTS[4].title} lang="en" ratio="2/3" state="notMade" /></Figure>
          <Figure label="16:9 · episode"><TitleCard title={EPISODE.title} lang="en" ratio="16/9" number={3} state="notDrawn" /></Figure>
          <Figure label="2.39:1"><Frame src={PLACES[0].plate} ratio="2.39/1" alt={PLACES[0].name} /></Figure>
        </div>
      </Block>

      <Block title="Slates, the stage meter and faces">
        <div className="spec-stack">
          <Slate size="hero" items={['Show', '2026', '2 seasons', '9 episodes', 'Cartoon', 'Arabic (Iraqi)']} status={<StateWord tone="waiting">Waiting for you</StateWord>} />
          <Slate size="tile" items={['2 seasons', '9 episodes', 'Cartoon']} status={<StateWord tone="waiting">1 waiting</StateWord>} />
          <Slate size="header" items={[min(6)]} status={<StateWord tone="running">Producing</StateWord>} />
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

      <Block title="Media tiles (catalogue grids, §5.6)">
        <div className="mgrid" data-tile="keyart">
          {SHOWS.map((s, i) => <MediaTile key={s.id} href="#media" src={s.art} title={s.title} titleLang="en" meta={['Show', '2 seasons', 'Cartoon']} status={i === 0 ? <StateWord tone="waiting">1 waiting</StateWord> : undefined} />)}
          <MediaTileSkeleton ratio="16/9" />
        </div>
        <div className="mgrid spec-gap" data-tile="poster">
          {SHORTS.map((s, i) => <MediaTile key={s.id} href="#media" src={s.poster} ratio="2/3" title={s.title} titleLang="en" meta={[s.runtime ? min(s.runtime) : null]}
            status={i === 0 ? <StateWord tone="running">Producing</StateWord> : i === 4 ? <StateWord tone="idle">Story</StateWord> : <StateWord tone="done">Finished</StateWord>} />)}
          <MediaTileSkeleton ratio="2/3" />
        </div>
        <div className="mgrid spec-gap" data-tile="sleeve">
          {SONGS.map((s) => <MediaTile key={s.id} href="#media" src={s.sleeve} ratio="1/1" title={s.title} titleLang="en" meta={[s.performers, s.duration ? `0:${s.duration}` : null]} />)}
          <MediaTile onSelect={() => setPicked((x) => !x)} selected={picked} src={SONGS[0].sleeve} ratio="1/1" title={SONGS[0].title} meta={[picked ? 'Selected' : 'Not selected']} />
          <MediaTileSkeleton ratio="1/1" />
        </div>
        <div className="mgrid spec-gap" data-tile="figure">
          {PEOPLE.map((p, i) => <MediaTile key={p.id} href="#media" src={p.src} ratio="928/1664" title={p.name} titleLang="en" badge={i === 3 ? <span className="badge badge-warn">Needs approval</span> : undefined} />)}
        </div>
        <div className="mgrid spec-gap" data-tile="plate">
          {PLACES.map((p) => <MediaTile key={p.id} href="#media" src={p.plate} title={p.name} titleLang="en" meta={['Interior', '2 plates']} />)}
          <MediaTile href="#media" src={PEOPLE[1].src} figure title={PEOPLE[1].name} meta={['Character', 'approved, locked']} />
        </div>
      </Block>

      <Block title="A shelf of tiles">
        <Shelf id="spec-shots" title="Shots" count={EPISODE.shots.length} link={{ href: '#media', label: 'All shots' }} kind="wide" cardWidth={240}>
          {EPISODE.shots.map((s) => <MediaTile key={s.id} href="#media" src={s.frame} title={s.purpose} meta={[`Shot ${s.n}`, `0:0${s.d}`]} />)}
        </Shelf>
      </Block>

      <Block title="Episodes">
        <div className="spec-stack">
          <SeasonPicker value={season} onChange={setSeason} count="3 episodes" onPropose={() => undefined} onWrite={() => undefined}
            seasons={[{ id: 's1', number: 1, episodes: 2 }, { id: 's2', number: 2, episodes: 1 }]} />
          <div className="mgrid" data-tile="still">
            <EpisodeCard e={{ number: 1, title: EPISODE.title, titleLang: 'en', href: '#media', src: EPISODE.still, synopsis: EPISODE.synopsis, runtime: min(5), duration: '0:12', segments: stageSegments(0, 'current', 6, true), status: <StateWord tone="done">Finished</StateWord> }} />
            <EpisodeCard e={{ number: 2, title: SHORTS[3].title, titleLang: 'en', href: '#media', src: '/sample/covers/last-sip-s1e2.svg', runtime: min(5), segments: stageSegments(2, 'running'), status: <StateWord tone="running">Storyboard</StateWord> }} />
            <EpisodeCard e={{ number: 3, title: 'Untitled', titleLang: 'en', href: '#media', segments: stageSegments(0, 'waiting'), status: <StateWord tone="waiting">Waiting for you</StateWord> }} />
          </div>
          <div>
            <EpisodeRow e={{ number: 1, title: EPISODE.title, titleLang: 'en', href: '#media', src: EPISODE.still, synopsis: EPISODE.synopsis, runtime: min(5), segments: stageSegments(0, 'current', 6, true), status: <StateWord tone="done">Finished</StateWord> }} onPlay={() => undefined} />
            <EpisodeRow e={{ number: 3, title: 'Untitled', titleLang: 'en', href: '#media', segments: stageSegments(0, 'waiting'), status: <StateWord tone="waiting">Waiting for you</StateWord> }} />
          </div>
        </div>
      </Block>

      <Block title="Cast">
        <CastGrid members={people.map((p, i) => ({ ...p, href: '#media', appearance: i === 4 ? 'Sings in 2 videos' : 'In 4 episodes', ring: i === 4 ? ('speaking' as const) : undefined }))} />
        <div className="spec-gap"><CastRow members={people.map((p) => ({ ...p, href: '#media' }))} max={4} moreHref="#media" /></div>
      </Block>

      <Block title="Heroes (the art wash: Show, Short, Music video, Location; never Home)">
        <Figure label="Backdrop · tinted" className="spec-hero">
          <BackdropHero headingLevel={4} picture={{ src: SHOWS[0].art! }} alt={`Key art for ${SHOWS[0].title}`} preview={{ src: EPISODE.cut }} onWatchWithSound={() => undefined}
            art={{ '--art': 'oklch(0.2 0.04 55)' }} title={SHOWS[0].title} titleLang="en" slate={['Show', '2026', '2 seasons', '9 episodes', 'Cartoon', 'Arabic (Iraqi)']}
            altTitle={{ text: 'آخر رشفة', lang: 'ar' }} lead={SHOWS[0].logline}
            actions={<><Button variant="primary">Continue: Episode 4</Button><Button icon={<IconPlay />}>Play the cut</Button>{more(SHOWS[0].title)}</>} />
        </Figure>
        <Figure label="Backdrop · no picture" className="spec-hero">
          <BackdropHero headingLevel={4} picture={null} alt="" title={SHOWS[2].title} titleLang="en" slate={['Show', 'Anime']} lead={SHOWS[2].logline} actions={<Button variant="primary">Continue</Button>} />
        </Figure>
        <Figure label="Diptych · tinted" className="spec-hero">
          <DiptychHero headingLevel={4} poster={{ src: SHORTS[0].poster! }} posterAlt={`Poster for ${SHORTS[0].title}`} title={SHORTS[0].title} titleLang="en"
            slate={['Short', '2026', min(2), 'Realistic', 'English']} status={<StateWord tone="running">Producing</StateWord>}
            player={<StoryboardReel shots={EPISODE.shots.map((s) => ({ id: s.id, number: s.n, src: s.frame, duration: s.d }))} />}
            strip={<FilmStrip frames={strip} hrefFor={() => '#media'} />}
            lead="Two brothers race paper boats down a gutter after the first rain in a year."
            actions={<><Button variant="primary">Continue</Button>{more(SHORTS[0].title)}</>} art={{ '--art': 'oklch(0.2 0.035 230)' }} />
        </Figure>
        <Figure label="Episode, with the inline player" className="spec-hero">
          <DiptychHero headingLevel={4} poster={null} title={EPISODE.title} titleLang="en" slate={['Episode 1', min(5)]} status={<StateWord tone="done">Final cut</StateWord>}
            player={<InlinePlayer src={EPISODE.cut} poster={EPISODE.still} title={EPISODE.title} />} strip={<FilmStrip frames={strip} onSelect={() => undefined} current="s1" />}
            lead={EPISODE.synopsis} actions={<Button variant="primary">Continue</Button>} />
        </Figure>
        <Figure label="Sleeve · tinted" className="spec-hero">
          <SleeveHero headingLevel={4} sleeve={{ src: song.sleeve! }} sleeveAlt={`Sleeve for ${song.title}`} title={song.title} titleLang="en" art={{ '--art': 'oklch(0.2 0.045 250)' }}
            slate={['Music video', '2026', '0:48', '4 sections', '3 shots']} status={<StateWord tone="idle">Story</StateWord>}
            performers={<CastRow members={[people[4]]} />}
            transport={<SongTransport track={songTrack} title={song.title} mode="song" onMode={() => undefined} videoDisabledReason="No cut yet"
              action={<Button>Continue<IconChevronRight aria-hidden /></Button>} />} />
        </Figure>
        <Figure label="Figure" className="spec-hero">
          <FigureHero headingLevel={4} figure={{ src: '/sample/characters/hana-full-body.svg' }} figureAlt={PEOPLE[3].name} title={PEOPLE[3].name} titleLang="en"
            judge art={{ '--art': 'oklch(0.2 0.04 20)' }} slate={['Character', 'Anime', 'English']} status={<StateWord tone="waiting">Draft</StateWord>}
            lead={PEOPLE[3].role}
            voice={<VoicePreview track={{ id: 'spec-voice-hana', src: '/sample/audio/voice-mid-sample.m4a', title: PEOPLE[3].name, duration: 3 }} name={PEOPLE[3].name} origin="Studio voice" line="Twelve. Twelve. Where is twelve." lineLang="en" />}
            actions={<><Button variant="primary">Approve</Button><Button>Redraw</Button><Button>Edit</Button></>} />
        </Figure>
        <Figure label="Plate · tinted" className="spec-hero">
          <PlateHero headingLevel={4} current={light} title={PLACES[1].name} titleLang="en" art={{ '--art': 'oklch(0.2 0.04 70)' }}
            plates={[{ key: 'day', picture: { src: PLACES[1].plate }, alt: PLACES[1].name }, { key: 'night', picture: { src: PLACES[1].night }, alt: `${PLACES[1].name} · night` }]}
            lighting={<Segmented value={light} onChange={setLight} label="Lighting" options={[{ value: 'day', label: 'Day' }, { value: 'night', label: 'Night' }]} />}
            slate={['Location', 'Exterior', 'Realistic', 'In 2 films']}
            actions={<><Button variant="primary">Use in a film</Button><Button>Edit</Button></>} />
        </Figure>
        <Figure label="Theatre" className="spec-hero spec-theatre">
          <div data-room="theatre" className="spec-theatre-room">
            <TheatreHero headingLevel={4} label="Now screening" title={EPISODE.title} titleLang="en"
              player={<TheatrePlayer src={EPISODE.cut} poster={EPISODE.still} title={EPISODE.title} notes={[{ at: 4, text: 'Hold on the keys' }, { at: 9, text: 'Cut earlier' }]} />}
              slate={['Short', '0:12', 'Cut 1', '2 days ago']} status={<StateWord tone="done">Approved</StateWord>}
              actions={<><Button>Download</Button>{more(EPISODE.title)}</>} />
          </div>
        </Figure>
      </Block>
    </SpecSection>
  );
}
