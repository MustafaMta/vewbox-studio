'use client';

import { DecisionCard, FeaturedCard, FigureCard, MediaCard, PosterCard, SleeveCard, StartCard } from '@/components/media/Cards';
import { DecisionCardSkeleton, FeaturedCardSkeleton, FigureCardSkeleton, MediaCardSkeleton, PanelCardSkeleton, SectionHeadSkeleton, ShelfSkeleton, ToolCardSkeleton } from '@/components/media/Skeletons';
import { PEOPLE, SHORTS, SHOWS, SONGS, PLACES, EPISODE } from '@/components/media/specimens/data';
import { useState } from 'react';
import { PanelCard, SectionHead, ToolCard } from '../Cards';
import { StateWord } from '../Status';
import { Shelf } from '../Shelf';
import { Cell, SpecRow, SpecSection } from './parts';

/** /kit — SECTION HEADS, SHELVES AND CARDS (Home is the visual reference). Real sizes; every state drawn. The pictures
 *  are the bundled sample files in public/sample. */

const noop = () => undefined;
const W = { wide: 288, poster: 184, sleeve: 216, figure: 168 } as const;

export function CardsSpec() {
  const [picked, setPicked] = useState<string[]>(['paper-boats']);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <SpecSection id="cards" title="Section heads, shelves and cards" lead="Home's shelves and cards, lifted into the kit with the same look. A shelf runs to the viewport's end edge and snaps; its arrows show only while the row is wider than the column.">
      <SpecRow stack label="SectionHead">
        <div className="kit-spec-wide">
          <SectionHead title="Shows" description="Seasons and episodes that share one cast and one world." link={{ href: '/shows', label: 'All shows' }} />
          <SectionHead title="Needs you" count={4} countTone="wait" link={{ href: '/production', label: 'All decisions', short: 'All' }} position="1 of 4" />
          <SectionHead title="Characters" count={6} arrows={{ onPrev: noop, onNext: noop, prevDisabled: true, label: 'characters' }} link={{ href: '/characters', label: 'Casting directory' }} />
          <SectionHead title="The studio" action={<button type="button" className="btn btn-secondary btn-sm">Open</button>} />
          <SectionHeadSkeleton description titleWidth="6rem" />
        </div>
      </SpecRow>

      <SpecRow stack label="Shelf · wide (16:9)">
        <div className="kit-spec-wide">
          <Shelf id="kit-shelf-shows" title="Shows" description="Seasons and episodes that share one cast and one world." link={{ href: '/shows', label: 'All shows' }} kind="wide">
            {[...SHOWS, ...SHOWS].map((s, i) => <MediaCard key={`${s.id}-${i}`} href="/kit#cards" src={s.art} title={s.title} meta={i % 2 ? '1 season · 4 episodes' : 'Show · 2026'} />)}
            <StartCard key="new" href="/kit#cards" ratio="16/9" title="New show" line="Your next show" />
          </Shelf>
        </div>
      </SpecRow>
      <SpecRow stack label="Shelf · poster (2:3)">
        <div className="kit-spec-wide">
          <Shelf id="kit-shelf-shorts" title="Shorts" description="Single films, each from one line." link={{ href: '/shorts', label: 'All shorts' }} kind="poster">
            {[...SHORTS, ...SHORTS].map((s, i) => <PosterCard key={`${s.id}-${i}`} href="/kit#cards" src={s.poster} title={s.title} meta={s.runtime ? `Short · ${s.runtime}:00` : 'Draft'} />)}
            <StartCard key="new" href="/kit#cards" ratio="2/3" title="New short" line="Your next film" />
          </Shelf>
        </div>
      </SpecRow>
      <SpecRow stack label="Shelf · sleeve (1:1), fits: no arrows">
        <div className="kit-spec-wide">
          <Shelf id="kit-shelf-music" title="Music videos" description="Each one starts with its song." kind="sleeve">
            {SONGS.map((s) => <SleeveCard key={s.id} href="/kit#cards" src={s.sleeve} title={s.title} meta={s.performers ?? 'No performers yet'} />)}
            <StartCard key="new" href="/kit#cards" ratio="1/1" title="New music video" line="Your next song" />
          </Shelf>
        </div>
      </SpecRow>
      <SpecRow stack label="Shelf · figure (928:1664)">
        <div className="kit-spec-wide">
          <Shelf id="kit-shelf-cast" title="Characters" description="One canonical image and one voice each." link={{ href: '/characters', label: 'Casting directory' }} kind="figure">
            {[...PEOPLE, ...PEOPLE].map((p, i) => <FigureCard key={`${p.id}-${i}`} href="/kit#cards" src={p.src} name={i === 3 ? 'أبو سلام' : p.name} nameLang={i === 3 ? 'ar' : undefined} waiting={i === 1} />)}
            <StartCard key="new" href="/kit#cards" ratio="928/1664" title="New character" />
          </Shelf>
        </div>
      </SpecRow>
      <SpecRow stack label="Shelf · loading">
        <div className="kit-spec-wide"><ShelfSkeleton kind="poster" count={8} /></div>
      </SpecRow>

      <SpecRow label="MediaCard states">
        {([
          ['Rest', {}], ['Hover', { className: 'is-hover' }], ['Focus', { className: 'is-focus' }],
        ] as const).map(([state, extra]) => (
          <Cell key={state} state={state}><div style={{ inlineSize: W.wide }}><MediaCard href="/kit#cards" src={SHOWS[0].art} title={SHOWS[0].title} meta="Show · 2026" {...extra} /></div></Cell>
        ))}
        <Cell state="Selected (picker)"><div style={{ inlineSize: W.wide }}><MediaCard onSelect={() => toggle('paper-kites')} selected={picked.includes('paper-kites')} src={SHOWS[1].art} title={SHOWS[1].title} meta="Tap to toggle" /></div></Cell>
        <Cell state="Disabled, with its reason"><div style={{ inlineSize: W.wide }}><MediaCard disabledReason="No cut yet: finish the storyboard" src={SHOWS[1].art} title={SHOWS[1].title} /></div></Cell>
        <Cell state="No picture yet"><div style={{ inlineSize: W.wide }}><MediaCard href="/kit#cards" title={SHOWS[2].title} meta="Show · draft" /></div></Cell>
        <Cell state="Drawing (a job runs)"><div style={{ inlineSize: W.wide }}><MediaCard href="/kit#cards" src={EPISODE.still} title="The Opening Hour" meta="Episode 1" phase="Drawing key art · 2nd in the queue" /></div></Cell>
        <Cell state="Chip"><div style={{ inlineSize: W.wide }}><MediaCard href="/kit#cards" src={PLACES[0].plate} title={PLACES[0].name} meta="Interior · 3 plates" chip="0:56" /></div></Cell>
        <Cell state="Loading"><div style={{ inlineSize: W.wide }}><MediaCardSkeleton ratio="16/9" /></div></Cell>
      </SpecRow>
      <SpecRow label="PosterCard · SleeveCard">
        <Cell state="Poster"><div style={{ inlineSize: W.poster }}><PosterCard href="/kit#cards" src={SHORTS[0].poster} title={SHORTS[0].title} meta="Short · 2:00" /></div></Cell>
        <Cell state="Poster, selected"><div style={{ inlineSize: W.poster }}><PosterCard onSelect={() => toggle('paper-boats')} selected={picked.includes('paper-boats')} src={SHORTS[0].poster} title={SHORTS[0].title} meta="Tap to toggle" /></div></Cell>
        <Cell state="Poster, loading"><div style={{ inlineSize: W.poster }}><MediaCardSkeleton ratio="2/3" /></div></Cell>
        <Cell state="Sleeve"><div style={{ inlineSize: W.sleeve }}><SleeveCard href="/kit#cards" src={SONGS[0].sleeve} title={SONGS[0].title} meta="Nour · 0:48" /></div></Cell>
        <Cell state="Sleeve, hover"><div style={{ inlineSize: W.sleeve }}><SleeveCard href="/kit#cards" src={SONGS[1].sleeve} title={SONGS[1].title} meta="Layla & Karim" className="is-hover" /></div></Cell>
        <Cell state="Sleeve, loading"><div style={{ inlineSize: W.sleeve }}><MediaCardSkeleton ratio="1/1" /></div></Cell>
      </SpecRow>
      <SpecRow label="FigureCard states">
        <Cell state="Rest"><div style={{ inlineSize: W.figure }}><FigureCard href="/kit#cards" src={PEOPLE[1].src} name={PEOPLE[1].name} /></div></Cell>
        <Cell state="Needs approval"><div style={{ inlineSize: W.figure }}><FigureCard href="/kit#cards" src={PEOPLE[0].src} name={PEOPLE[0].name} waiting /></div></Cell>
        <Cell state="Arabic name"><div style={{ inlineSize: W.figure }}><FigureCard href="/kit#cards" src={PEOPLE[2].src} name="كريم الشاعر" nameLang="ar" /></div></Cell>
        <Cell state="Focus"><div style={{ inlineSize: W.figure }}><FigureCard href="/kit#cards" src={PEOPLE[4].src} name={PEOPLE[4].name} className="is-focus" /></div></Cell>
        <Cell state="Selected"><div style={{ inlineSize: W.figure }}><FigureCard onSelect={() => toggle('hana')} selected={picked.includes('hana')} src={PEOPLE[3].src} name={PEOPLE[3].name} /></div></Cell>
        <Cell state="Disabled"><div style={{ inlineSize: W.figure }}><FigureCard disabledReason="Not cast in this show" src={PEOPLE[2].src} name={PEOPLE[2].name} /></div></Cell>
        <Cell state="No image yet"><div style={{ inlineSize: W.figure }}><FigureCard href="/kit#cards" name={PEOPLE[5].name} /></div></Cell>
        <Cell state="Loading"><div style={{ inlineSize: W.figure }}><FigureCardSkeleton /></div></Cell>
      </SpecRow>
      <SpecRow label="StartCard states">
        <Cell state="Rest · 16:9"><div style={{ inlineSize: W.wide }}><StartCard href="/kit#cards" ratio="16/9" title="New show" line="Your first show" /></div></Cell>
        <Cell state="Hover · 2:3"><div style={{ inlineSize: W.poster }}><StartCard href="/kit#cards" ratio="2/3" title="New short" line="Your next film" className="is-hover" /></div></Cell>
        <Cell state="Focus · 1:1"><div style={{ inlineSize: W.sleeve }}><StartCard href="/kit#cards" ratio="1/1" title="New music video" line="Your next song" className="is-focus" /></div></Cell>
        <Cell state="Figure"><div style={{ inlineSize: W.figure }}><StartCard href="/kit#cards" ratio="928/1664" title="New character" /></div></Cell>
        <Cell state="Disabled"><div style={{ inlineSize: W.sleeve }}><StartCard ratio="1/1" title="New music video" disabledReason="Add a song first" /></div></Cell>
      </SpecRow>

      <SpecRow label="ToolCard states">
        <div className="kit-spec-grid-3">
          <ToolCard href="/kit#cards" shape="show" title="New show" line="Seasons that share one cast" />
          <ToolCard href="/kit#cards" shape="short" title="New short" line="One film from one line" className="is-hover" />
          <ToolCard href="/kit#cards" shape="music" title="New music video" line="It starts with its song" className="is-focus" />
          <ToolCard href="/kit#cards" shape="character" title="New character" line="One image, one voice" chevron />
          <ToolCard href="/kit#cards" shape="location" title="New location" disabledReason="The engines are offline" />
          <ToolCardSkeleton />
        </div>
      </SpecRow>

      <SpecRow label="FeaturedCard">
        <div className="kit-spec-wide kit-spec-grid-2">
          <FeaturedCard id="kit-feat" chip="4 waiting" chipTone="wait" title="Four decisions wait for you" body="Layla's image, the story of The Opening Hour, two takes of shot 3 and one more." action={{ label: 'Review', href: '/kit#cards' }}
            thumbs={PEOPLE.slice(0, 4).map((p) => ({ id: p.id, href: '/kit#cards', label: `Review ${p.name}`, src: p.src, position: '50% 8%' }))} />
          <FeaturedCardSkeleton thumbs={4} />
        </div>
      </SpecRow>

      <SpecRow label="DecisionCard">
        <div className="kit-spec-wide kit-spec-grid-4">
          <DecisionCard href="/kit#cards" src={PEOPLE[1].src} figure kind="Character image · version 2" title="Layla" description="Her full-body image is ready. Approve it to lock her look for every film." verb="Review and approve" />
          <DecisionCard href="/kit#cards" src={EPISODE.shots[1].frame} kind="Take · shot 2" title="The discovery" description="Two takes are ready." verb="Choose a take" chip="2 takes" className="is-hover" />
          <DecisionCard href="/kit#cards" kind="Story" title="The Opening Hour" description="The studio drafted the story." verb="Read the story" />
          <DecisionCardSkeleton />
        </div>
      </SpecRow>

      <SpecRow label="PanelCard">
        <div className="kit-spec-wide">
          <PanelCard title="The studio" facts={[
            { label: 'State', value: <StateWord tone="idle">Paused</StateWord>, sub: 'since 3 Oct, 14:39' },
            { label: 'Company', value: '9 departments · 35 agents' },
            { label: 'Engines', value: 'Picture and video offline', sub: 'Voices offline' },
            { label: 'Last handoff', value: 'Post-Production', sub: '3 Oct, 12:33' },
          ]} />
          <div style={{ marginBlockStart: 16 }}><PanelCardSkeleton cells={4} title /></div>
        </div>
      </SpecRow>
    </SpecSection>
  );
}
