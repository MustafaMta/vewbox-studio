'use client';

import Link from 'next/link';
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ImageOff } from 'lucide-react';
import { useStudio } from '@/studio/store';
import { useLive } from '@/studio/org';
import { useShell } from '@/components/shell/context';
import { artVars } from '@/studio/presentation';
import { FeaturedCard, FeaturedCardSkeleton, FigureCard, MediaCard, PosterCard, ShelfSkeleton, SleeveCard, StartCard, ToolCardSkeleton } from '@/components/media';
import { Shelf, Skeleton, SkeletonRegion, ToolCard } from '@/components/ui/kit';
import { IconPlay } from '@/components/ui/icons';
import {
  coverPosition, featured, lineup, pickMarquee, productionShelf, showShelf, toolCards, waitingCharacters,
  type Marquee, type OrgSummary,
} from './model';

/** HOME — the studio's front page, composed on the producer's reference (Krea's app home; docs/design/
 *  VISUAL-STANDARD-V5.1.md for every token and component): a wide rounded banner of the latest film with one line of
 *  facts and one primary action under it; a featured row — the decisions that wait (or the work in progress, or a
 *  start) beside six compact tool cards; then the producer's shelves — Shows, Shorts, Music videos and Characters —
 *  each holding the studio's real work in its own shape and ending with a card that starts a new one (an empty shelf is
 *  only that card, never invented content). Every word and number comes from ./model over the
 *  studio's real state; nothing is invented to fill a section. */

export function Home() {
  const { state } = useStudio();
  const { decisions } = useShell();
  const org = useLive<OrgSummary>('/api/studio/org?view=summary&handoffs=1');

  const marquee = useMemo(() => pickMarquee(state), [state]);
  const feature = useMemo(() => featured(decisions.items, state), [decisions, state]);
  const tools = useMemo(() => toolCards(org.data), [org.data]);
  const shows = useMemo(() => showShelf(state), [state]);
  const shorts = useMemo(() => productionShelf(state, 'SHORT'), [state]);
  const music = useMemo(() => productionShelf(state, 'MUSIC_VIDEO'), [state]);
  const cast = useMemo(() => lineup(state, waitingCharacters(decisions.items)), [state, decisions]);
  const empty = state.productions.length === 0 && state.characters.length === 0 && state.locations.length === 0;

  return (
    <div className="home" data-state={empty ? 'empty' : marquee?.finished ? 'finished' : 'working'}>
      {marquee ? <Banner m={marquee} /> : <EmptyBanner />}
      <section className="home-feature" aria-label="Start and continue">
        <FeaturedCard id="home-featured" chip={feature.chip} chipTone={feature.chipTone} title={feature.title} body={feature.body} action={feature.action} thumbs={feature.thumbs} />
        <ul className="home-tools" role="list">
          {tools.map((t) => <li key={t.href}><ToolCard href={t.href} shape={t.shape} title={t.title} line={t.line} /></li>)}
        </ul>
      </section>
      <Shelf id="home-shows" title="Shows" description="Seasons and episodes that share one cast and one world." kind="wide" link={{ href: '/shows', label: 'All shows', short: 'All' }}>
        {shows.length > 0 ? shows.map((it) => <MediaCard key={it.key} href={it.href} title={it.title} titleLang={it.lang} meta={it.meta} asset={it.asset} src={it.src} position={it.position} />)
          : <StartCard href="/new/show" ratio="16/9" title="New show" line="Your first show" />}
      </Shelf>
      <Shelf id="home-shorts" title="Shorts" description="Single films, each from one line." kind="poster" link={{ href: '/shorts', label: 'All shorts', short: 'All' }}>
        {[...shorts.map((it) => <PosterCard key={it.key} href={it.href} title={it.title} titleLang={it.lang} meta={it.meta} asset={it.asset} src={it.src} position={it.position} />),
          <StartCard key="new" href="/new/short" ratio="2/3" title="New short" line={shorts.length ? 'Your next film' : 'Your first film'} />]}
      </Shelf>
      <Shelf id="home-music" title="Music videos" description="Each one starts with its song." kind="sleeve" link={{ href: '/music-videos', label: 'All music videos', short: 'All' }}>
        {[...music.map((it) => <SleeveCard key={it.key} href={it.href} title={it.title} titleLang={it.lang} meta={it.meta} asset={it.asset} src={it.src} position={it.position} />),
          <StartCard key="new" href="/new/music-video" ratio="1/1" title="New music video" line={music.length ? 'Your next song' : 'Your first song'} />]}
      </Shelf>
      {state.characters.length > 0 && (
        <Shelf id="home-cast" title="Characters" description="One canonical image and one voice each." kind="figure" link={{ href: '/characters', label: 'Casting directory', short: 'All' }}>
          {[...cast.map((c) => <FigureCard key={c.id} href={c.href} name={c.name} nameLang={c.lang} waiting={c.waiting} asset={c.asset} src={c.src} />),
            <StartCard key="new" href="/characters/new" ratio="928/1664" title="New character" line="One image, one voice" />]}
        </Shelf>
      )}
    </div>
  );
}
// ------------------------------------------------------------------------------------------------- the banner

/** The picture's crop for the box it is drawn in (§7.1): measured before paint, so the frame never jumps. */
function useCover(asset: Marquee['wide']) {
  const box = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<string | undefined>(undefined);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !asset) return;
    const measure = () => { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) setPosition(coverPosition(asset.asset.presentation, asset, r.width / r.height)); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [asset]);
  return { box, position };
}

function Banner({ m }: { m: Marquee }) {
  const { box, position } = useCover(m.wide);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const reveal = useCallback((img: HTMLImageElement) => { const done = () => setLoaded(true); if (typeof img.decode === 'function') img.decode().then(done, done); else done(); }, []);
  const imgRef = useCallback((img: HTMLImageElement | null) => { if (img?.complete) { if (img.naturalWidth > 0) reveal(img); else if (img.currentSrc) setFailed(true); } }, [reveal]);
  return (
    <section className="home-hero" aria-labelledby="home-hero-title">
      <Link href={m.href} className="home-hero-frame" aria-label={`Open ${m.title}`} tabIndex={-1}>
        <div ref={box} className="home-hero-pic" data-loaded={loaded || undefined} data-state={!m.wide ? 'none' : failed ? 'failed' : undefined} style={artVars(m.wide?.asset) as CSSProperties}>
          {m.wide && !failed && (
            // eslint-disable-next-line @next/next/no-img-element
            <img ref={imgRef} src={m.wide.src} alt={`A frame from ${m.title}`} width={m.wide.width} height={m.wide.height} loading="eager" fetchPriority="high" decoding="async"
              style={position ? { objectPosition: position } : undefined} onLoad={(e) => reveal(e.currentTarget)} onError={() => setFailed(true)} />
          )}
          {(failed || !m.wide) && <span className="home-hero-missing t-label">{failed ? <><ImageOff aria-hidden size={20} />Picture unavailable</> : 'No key art yet'}</span>}
        </div>
      </Link>
      <div className="home-hero-caption">
        <div className="home-hero-words">
          <h1 id="home-hero-title" className="home-hero-title"><bdi>{m.title}</bdi></h1>
          <p className="t-meta home-hero-meta">
            <span className={`badge ${m.badge.tone === 'ok' ? 'badge-ok' : 'badge-neutral'}`}>{m.badge.words}</span>
            <span className="home-slate">{m.slate.map((s, i) => <span key={i}>{s}</span>)}</span>
          </p>
        </div>
        <div className="home-hero-acts">
          <Link className="btn btn-secondary" href={m.secondary.href}>{m.secondary.label}</Link>
          <Link className="btn btn-primary" href={m.primary.href}>{m.primary.play && <IconPlay aria-hidden />}{m.primary.label}</Link>
        </div>
      </div>
    </section>
  );
}

/** An empty studio: the banner's own shape, set in type, with the one first step. */
function EmptyBanner() {
  return (
    <section className="home-hero" aria-labelledby="home-hero-title">
      <div className="home-hero-frame home-hero-empty">
        <span className="home-hero-corners" aria-hidden />
        <div className="home-hero-empty-words">
          <h1 id="home-hero-title" className="t-page">Your studio is ready.</h1>
          <p className="t-lead">Write one line. The studio drafts the story, the cast and the shots, and you approve each step.</p>
          <div className="home-hero-acts"><Link className="btn btn-primary" href="/new/short">Make a short film</Link><Link className="btn btn-secondary" href="/studio">Meet your studio</Link></div>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------- the skeleton

/** Home while the studio's first snapshot loads (§5.22): the banner, the featured row and the shelves in their final
 *  shapes and sizes (the same classes size them), so nothing moves when the content arrives. */
export function HomeSkeleton() {
  return (
    <SkeletonRegion label="Opening the studio…" className="home home-skeleton">
      <section className="home-hero">
        <Skeleton.Block className="home-hero-frame" width="100%" height="auto" radius="lg" />
        <div className="home-hero-caption">
          <div className="home-hero-words">
            <div className="home-hero-title"><Skeleton.Line size="title" width="16rem" /></div>
            <div className="t-meta home-hero-meta"><Skeleton.Line width="20rem" /></div>
          </div>
          <div className="home-hero-acts"><Skeleton.Block width={128} height={40} radius="pill" /><Skeleton.Block width={112} height={40} radius="pill" /></div>
        </div>
      </section>
      <div className="home-feature">
        <FeaturedCardSkeleton thumbs={4} />
        <div className="home-tools">{Array.from({ length: 6 }, (_, i) => <ToolCardSkeleton key={i} />)}</div>
      </div>
      <ShelfSkeleton kind="wide" count={4} />
      <ShelfSkeleton kind="poster" count={6} />
      <ShelfSkeleton kind="sleeve" count={5} />
      <ShelfSkeleton kind="figure" count={7} />
    </SkeletonRegion>
  );
}
