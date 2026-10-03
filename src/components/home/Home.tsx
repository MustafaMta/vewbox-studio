'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ImageOff } from 'lucide-react';
import { useStudio } from '@/studio/store';
import { useLive } from '@/studio/org';
import { useShell } from '@/components/shell/context';
import { artVars } from '@/studio/presentation';
import { Frame } from '@/components/media/Frame';
import { Skeleton, SkeletonRegion } from '@/components/ui/kit';
import { IconChevronLeft, IconChevronRight, IconPlay, IconPlus } from '@/components/ui/icons';
import { ShapeGlyph } from './glyphs';
import {
  coverPosition, featured, lineup, pickMarquee, productionShelf, showShelf, toolCards, waitingCharacters,
  type CastTile, type Featured, type Marquee, type OrgSummary, type ShelfCard, type ToolCard,
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
        <FeaturedCard f={feature} />
        <ul className="home-tools" role="list">
          {tools.map((t) => <li key={t.href}><Tool t={t} /></li>)}
        </ul>
      </section>
      <Shelf id="home-shows" title="Shows" description="Seasons and episodes that share one cast and one world." kind="wide" link={{ href: '/shows', label: 'All shows' }}>
        {shows.length > 0 ? shows.map((it) => <li key={it.key}><MediaCard it={it} ratio="16/9" /></li>) : <li><StartCard href="/new/show" ratio="16/9" title="New show" line="Your first show" /></li>}
      </Shelf>
      <Shelf id="home-shorts" title="Shorts" description="Single films, each from one line." kind="poster" link={{ href: '/shorts', label: 'All shorts' }}>
        {shorts.map((it) => <li key={it.key}><MediaCard it={it} ratio="2/3" /></li>)}
        <li><StartCard href="/new/short" ratio="2/3" title="New short" line={shorts.length ? 'Your next film' : 'Your first film'} /></li>
      </Shelf>
      <Shelf id="home-music" title="Music videos" description="Each one starts with its song." kind="sleeve" link={{ href: '/music-videos', label: 'All music videos' }}>
        {music.map((it) => <li key={it.key}><MediaCard it={it} ratio="1/1" /></li>)}
        <li><StartCard href="/new/music-video" ratio="1/1" title="New music video" line={music.length ? 'Your next song' : 'Your first song'} /></li>
      </Shelf>
      {state.characters.length > 0 && (
        <Shelf id="home-cast" title="Characters" description="One canonical image and one voice each." kind="figure" link={{ href: '/characters', label: 'Casting directory' }}>
          {cast.map((c) => <li key={c.id}><CharacterCard c={c} /></li>)}
          <li><NewCharacterCard /></li>
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

// -------------------------------------------------------------------------------------------- the featured row

function FeaturedCard({ f }: { f: Featured }) {
  return (
    <article className="card home-featured" data-kind={f.kind} aria-labelledby="home-featured-h">
      <div className="home-featured-words">
        <span className={`badge ${f.chipTone === 'wait' ? 'badge-warn' : 'badge-neutral'}`}>{f.chip}</span>
        <h2 id="home-featured-h" className="home-featured-title">{f.title}</h2>
        <p className="t-body home-featured-body">{f.body}</p>
        <Link className="btn btn-primary btn-sm home-featured-btn" href={f.action.href}>{f.action.label}<IconChevronRight aria-hidden /></Link>
      </div>
      {f.thumbs.length > 0 && (
        <ul className="home-featured-thumbs" role="list" data-count={f.thumbs.length}>
          {f.thumbs.map((t) => (
            <li key={t.id}>
              <Link href={t.href} className="home-featured-thumb" aria-label={t.label} title={t.label}>
                <Frame asset={t.asset} src={t.src} ratio="1/1" fit="cover" alt="" radius="none" art={artVars(t.asset)}
                  presentation={{ ...t.asset.presentation, ...(t.position ? { focal: focalFrom(t.position) } : null) }} title={t.label} decorative />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function Tool({ t }: { t: ToolCard }) {
  return (
    <Link className="card home-tool" href={t.href}>
      <ShapeGlyph shape={t.shape} />
      <span className="home-tool-words">
        <span className="home-tool-title">{t.title}</span>
        <span className="home-tool-line">{t.line}</span>
      </span>
    </Link>
  );
}

// -------------------------------------------------------------------------------------------------- the shelves

/** A horizontal shelf (the reference's media rows): a head with the title, an optional description, one quiet link and,
 *  when the row is wider than the column, previous/next buttons; the row scrolls with snap and never wraps. */
function Shelf({ id, title, description, kind, link, children }: { id: string; title: string; description?: string; kind: 'wide' | 'poster' | 'sleeve' | 'figure'; link?: { href: string; label: string }; children: ReactNode }) {
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ overflow: false, start: true, end: true });
  const measure = useCallback(() => {
    const el = track.current; if (!el) return;
    const overflow = el.scrollWidth > el.clientWidth + 2;
    setEdges({ overflow, start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  }, []);
  useEffect(() => {
    const el = track.current; if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);
  const page = (dir: 1 | -1) => { const el = track.current; if (!el) return; el.scrollBy({ left: dir * Math.max(200, el.clientWidth * 0.8), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
  return (
    <section className="home-shelf" aria-labelledby={`${id}-h`} data-kind={kind}>
      <div className="home-shelf-head">
        <div className="home-shelf-title">
          <h2 id={`${id}-h`} className="t-section">{title}</h2>
          {description && <p className="t-body home-shelf-desc">{description}</p>}
        </div>
        <div className="home-shelf-end">
          {link && <Link className="home-link" href={link.href}>{link.label}<IconChevronRight aria-hidden /></Link>}
          {edges.overflow && (
            <span className="home-shelf-arrows">
              <button type="button" className="btn btn-secondary btn-icon btn-sm" aria-label={`Previous ${title.toLowerCase()}`} disabled={edges.start} onClick={() => page(-1)}><IconChevronLeft aria-hidden /></button>
              <button type="button" className="btn btn-secondary btn-icon btn-sm" aria-label={`Next ${title.toLowerCase()}`} disabled={edges.end} onClick={() => page(1)}><IconChevronRight aria-hidden /></button>
            </span>
          )}
        </div>
      </div>
      <ul ref={track} className="home-shelf-track" role="list" onScroll={measure}>{children}</ul>
    </section>
  );
}

/** "50% 8%" → { x: 0.5, y: 0.08 }: the Frame takes the crop as a focal point. */
const focalFrom = (position: string) => { const [x, y] = position.split(' ').map((v) => parseFloat(v) / 100); return { x, y }; };

/** A media card with its words on the picture (the reference's shelf cards): the title and one meta line over the
 *  poster scrim at the bottom; the whole card is one link. */
function MediaCard({ it, ratio }: { it: ShelfCard; ratio: '16/9' | '2/3' | '1/1' }) {
  return (
    <Link className="home-media" href={it.href} title={it.title}>
      <Frame asset={it.asset} src={it.src} ratio={ratio} fit="cover" alt="" radius="none" className="home-media-frame"
        presentation={it.asset ? { ...it.asset.presentation, ...(it.position ? { focal: focalFrom(it.position) } : null) } : undefined}
        art={artVars(it.asset)} title={it.title} titleLang={it.lang} titleState="noImage" decorative style={{ aspectRatio: ratio.replace('/', ' / ') }}>
        <span className="home-media-words">
          <span className="home-media-title name"><bdi lang={it.lang}>{it.title}</bdi></span>
          {it.meta && <span className="home-media-meta">{it.meta}</span>}
        </span>
      </Frame>
    </Link>
  );
}

/** The last card of a shelf: start a new one, in the shelf's own shape (the title card's viewfinder corners). */
function StartCard({ href, ratio, title, line }: { href: string; ratio: '16/9' | '2/3' | '1/1'; title: string; line: string }) {
  return (
    <Link className="home-start" href={href} style={{ aspectRatio: ratio.replace('/', ' / ') }}>
      <span className="home-hero-corners" aria-hidden />
      <span className="home-figure-plus" aria-hidden><IconPlus /></span>
      <span className="home-start-words"><span className="home-tool-title">{title}</span><span className="home-tool-line">{line}</span></span>
    </Link>
  );
}

/** A character in the shelf: the whole canonical figure on its own field (never cropped), the name below on the start
 *  edge, and "Needs approval" only when the producer is waited on. */
function CharacterCard({ c }: { c: CastTile }) {
  return (
    <Link className="home-figure" href={c.href} title={c.name}>
      <Frame asset={c.asset} src={c.src} ratio="928/1664" fit="contain" alt="" art={artVars(c.asset)} title={c.name} titleLang={c.lang} titleState="noImage" decorative className="home-figure-frame" />
      <span className="t-card name home-figure-name"><bdi lang={c.lang}>{c.name}</bdi></span>
      <span className="home-figure-state">{c.waiting ? <span className="badge badge-warn">Needs approval</span> : null}</span>
    </Link>
  );
}

function NewCharacterCard() {
  return (
    <Link className="home-figure" href="/characters/new">
      <span className="home-figure-frame home-figure-new">
        <span className="home-figure-plus" aria-hidden><IconPlus /></span>
        <span className="t-body">New character</span>
      </span>
      <span className="t-card home-figure-name" aria-hidden />
      <span className="home-figure-state" aria-hidden />
    </Link>
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
        <Skeleton.Block className="home-featured" width="100%" height="auto" radius="md" />
        <div className="home-tools">{Array.from({ length: 6 }, (_, i) => <Skeleton.Block key={i} className="home-tool" width="100%" height="auto" radius="md" />)}</div>
      </div>
      {([['wide', '16/9', 4, '6rem'], ['poster', '2/3', 6, '5rem'], ['sleeve', '1/1', 5, '8rem']] as const).map(([kind, ratio, n, w]) => (
        <div key={kind} className="home-shelf" data-kind={kind}>
          <div className="home-shelf-head"><div className="home-shelf-title"><div className="t-section"><Skeleton.Line size="title" width={w} /></div><div className="t-body home-shelf-desc"><Skeleton.Line width="18rem" /></div></div></div>
          <div className="home-shelf-track">{Array.from({ length: n }, (_, i) => <div key={i}><Skeleton.Media ratio={ratio} className="home-media" /></div>)}</div>
        </div>
      ))}
      <div className="home-shelf" data-kind="figure">
        <div className="home-shelf-head"><div className="home-shelf-title"><div className="t-section"><Skeleton.Line size="title" width="8rem" /></div><div className="t-body home-shelf-desc"><Skeleton.Line width="14rem" /></div></div></div>
        <div className="home-shelf-track">{Array.from({ length: 7 }, (_, i) => <div key={i}><span className="home-figure"><Skeleton.Media ratio="928/1664" className="home-figure-frame" /><span className="t-card home-figure-name"><Skeleton.Line width="60%" /></span><span className="home-figure-state" /></span></div>)}</div>
      </div>
    </SkeletonRegion>
  );
}
