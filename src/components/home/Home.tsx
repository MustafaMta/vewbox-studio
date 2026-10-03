'use client';

import Link from 'next/link';
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ImageOff } from 'lucide-react';
import { useStudio } from '@/studio/store';
import { useLive } from '@/studio/org';
import { useShell } from '@/components/shell/context';
import { artVars } from '@/studio/presentation';
import { Frame } from '@/components/media/Frame';
import { Skeleton, SkeletonRegion } from '@/components/ui/kit';
import { IconChevronRight, IconPlay, IconPlus } from '@/components/ui/icons';
import { ShapeGlyph } from './glyphs';
import {
  coverPosition, lineup, needsYou, pickMarquee, recentWork, RUNNING_STATUSES, START_ACTIONS, studioFacts, waitingCharacters,
  type CastTile, type DecisionCard, type Engines, type Health, type Marquee, type OrgSummary, type RecentItem, type StudioFact,
} from './model';

/** HOME — the lobby of the studio (docs/design/VISUAL-STANDARD-V5.1.md §7): the latest film in a rounded frame with its
 *  words under the picture, what waits for the producer (the four oldest decisions), where they left off (four 16:9
 *  tiles), the characters' line-up, the four ways to start something and, last and quiet, the studio's own state.
 *  Every word and number comes from ./model (pure, tested) over the studio's real state and the server's endpoints; an
 *  empty studio opens on "Your studio is ready." with the start actions first. */

export function Home() {
  const { state, jobs } = useStudio();
  const { decisions } = useShell();
  const health = useLive<Health>('/api/health');
  const engines = useLive<Engines>('/api/status');
  const org = useLive<OrgSummary>('/api/studio/org?view=summary&handoffs=1');

  const marquee = useMemo(() => pickMarquee(state), [state]);
  const needs = useMemo(() => needsYou(decisions.items, state), [decisions, state]);
  const recent = useMemo(() => recentWork(state, 6), [state]);
  const cast = useMemo(() => lineup(state, waitingCharacters(decisions.items)), [state, decisions]);
  const running = jobs.filter((j) => (RUNNING_STATUSES as readonly string[]).includes(j.status)).length;
  const facts = studioFacts({ health: health.data, engines: engines.data, org: org.data, running, failed: { health: Boolean(health.error), engines: Boolean(engines.error), org: Boolean(org.error) } });
  const empty = state.productions.length === 0 && state.characters.length === 0 && state.locations.length === 0;

  return (
    <div className="home" data-state={empty ? 'empty' : marquee?.finished ? 'finished' : 'working'}>
      {empty ? <EmptyOpening /> : marquee && <MarqueeSection m={marquee} />}
      {empty && <Starts />}
      {needs && <NeedsYou count={needs.count} cards={needs.cards} link={needs.link} />}
      {recent.length > 0 && <PickUp items={recent} />}
      {!empty && <Characters cast={cast} total={state.characters.length} />}
      {!empty && <Starts />}
      <StudioPanel facts={facts} />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------- marquee

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

function MarqueeSection({ m }: { m: Marquee }) {
  const { box, position } = useCover(m.wide);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const reveal = useCallback((img: HTMLImageElement) => { const done = () => setLoaded(true); if (typeof img.decode === 'function') img.decode().then(done, done); else done(); }, []);
  const imgRef = useCallback((img: HTMLImageElement | null) => { if (img?.complete) { if (img.naturalWidth > 0) reveal(img); else if (img.currentSrc) setFailed(true); } }, [reveal]);
  const art = artVars(m.wide?.asset) as CSSProperties;
  return (
    <section className="home-marquee" aria-labelledby="home-feature-title">
      <div ref={box} className="home-marquee-frame" data-loaded={loaded || undefined} data-state={!m.wide ? 'none' : failed ? 'failed' : undefined} style={art}>
        {m.wide && !failed && (
          // eslint-disable-next-line @next/next/no-img-element
          <img ref={imgRef} src={m.wide.src} alt={`A frame from ${m.title}`} width={m.wide.width} height={m.wide.height} loading="eager" fetchPriority="high" decoding="async"
            style={position ? { objectPosition: position } : undefined} onLoad={(e) => reveal(e.currentTarget)} onError={() => setFailed(true)} />
        )}
        {(failed || !m.wide) && (
          <span className="home-marquee-missing t-label">
            {failed ? <><ImageOff aria-hidden size={20} />Picture unavailable</> : 'No key art yet'}
          </span>
        )}
      </div>
      <div className="home-words">
        <div className="home-words-main">
          <div className="home-meta">
            <span className={`badge ${m.badge.tone === 'ok' ? 'badge-ok' : 'badge-neutral'}`}>{m.badge.words}</span>
            <p className="t-meta home-slate">{m.slate.map((s, i) => <span key={i}>{s}</span>)}</p>
          </div>
          <h1 id="home-feature-title" className={m.long ? 't-hero home-title' : 't-display home-title'}><bdi>{m.title}</bdi></h1>
          {m.lead && <p className="t-lead home-lead content-para" dir="auto">{m.lead}</p>}
        </div>
        <div className="home-acts">
          <Link className="btn btn-secondary" href={m.secondary.href}>{m.secondary.label}</Link>
          <Link className="btn btn-primary" href={m.primary.href}>{m.primary.play && <IconPlay aria-hidden />}{m.primary.label}</Link>
        </div>
      </div>
    </section>
  );
}

function EmptyOpening() {
  return (
    <header className="home-opening">
      <h1 className="t-page">Your studio is ready.</h1>
      <p className="t-lead">Start a show, a short or a music video. The studio drafts each step; you approve it.</p>
    </header>
  );
}

// ------------------------------------------------------------------------------------------------- section head

/** The section head of §5.4 (Home's until the kit's SectionHead lands): the title with an optional count, the phone
 *  rail readout between, and one quiet link at the end. */
function SectionHead({ id, title, count, wait, readout, description, link }: { id: string; title: string; count?: number; wait?: boolean; readout?: ReactNode; description?: string; link?: { href: string; label: string } }) {
  return (
    <div className="home-head" data-described={description ? '' : undefined}>
      <div className="home-head-title">
        <h2 id={id} className="t-section">{title}{count !== undefined && <span className="t-body home-count" data-tone={wait ? 'wait' : undefined}><span className="sr-only">, </span>{count}</span>}</h2>
        {description && <p className="t-body home-head-desc">{description}</p>}
      </div>
      {readout}
      {link && <Link className="t-body home-link" href={link.href}>{link.label}<IconChevronRight aria-hidden /></Link>}
    </div>
  );
}

/** Which card of a phone rail sits at the start edge ("1 of 4", §5.4); null on a wider screen where nothing scrolls. */
function useRailPosition() {
  const rail = useRef<HTMLUListElement>(null);
  const [at, setAt] = useState(0);
  const onScroll = useCallback(() => {
    const el = rail.current; if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    if (!first) return;
    const step = first.getBoundingClientRect().width + parseFloat(getComputedStyle(el).columnGap || '0');
    const i = step > 0 ? Math.round(el.scrollLeft / step) : 0;
    setAt(Math.max(0, Math.min(el.children.length - 1, i)));
  }, []);
  return { rail, at, onScroll };
}

// ------------------------------------------------------------------------------------------------------- needs you

function NeedsYou({ count, cards, link }: { count: number; cards: DecisionCard[]; link: string }) {
  const { rail, at, onScroll } = useRailPosition();
  return (
    <section className="home-section" aria-labelledby="home-needs-h">
      <SectionHead id="home-needs-h" title="Needs you" count={count} wait link={{ href: '/production#needs-you', label: link }}
        readout={cards.length > 1 ? <span className="home-railpos t-ro" aria-hidden>{at + 1} of {cards.length}</span> : undefined} />
      <ul className="home-row home-rail home-decisions" role="list" ref={rail} onScroll={onScroll}>
        {cards.map((c) => (
          <li key={c.id}>
            <Link className="dcard home-card home-dcard" href={c.href} aria-label={`${c.action}: ${c.heading} (${c.kindLabel})`}>
              <Frame asset={c.picture?.asset} src={c.picture?.src} ratio="16/9" fit="cover" alt="" radius="none"
                presentation={c.picture ? { ...c.picture.asset.presentation, ...(c.picture.position ? { focal: focalFrom(c.picture.position) } : null) } : undefined}
                art={artVars(c.picture?.asset)} title={c.heading} titleState="noImage" judge={c.picture?.figure} decorative>
                {c.chip && <span className="home-chip t-ro">{c.chip}</span>}
              </Frame>
              <span className="home-dcard-body">
                <span className="t-label home-kind"><i className="home-dot" aria-hidden />{c.kindLabel}</span>
                <span className="t-card home-dcard-h">{c.headingIsContent ? <bdi>{c.heading}</bdi> : c.heading}</span>
                <span className="t-body home-dcard-d">{c.body}</span>
                <span className="btn btn-secondary btn-sm home-dcard-btn">{c.action}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "50% 8%" → { x: 0.5, y: 0.08 }: the Frame takes the crop as a focal point. */
const focalFrom = (position: string) => { const [x, y] = position.split(' ').map((v) => parseFloat(v) / 100); return { x, y }; };

// ------------------------------------------------------------------------------------ pick up where you left off

function PickUp({ items }: { items: RecentItem[] }) {
  return (
    <section className="home-section" aria-labelledby="home-recent-h">
      <SectionHead id="home-recent-h" title="Pick up where you left off" />
      <ul className="home-row home-rail home-recent" role="list">
        {items.map((it) => (
          <li key={it.key}>
            <Link className="mtile-link home-tile" href={it.href} title={it.title}>
              <Frame asset={it.asset} src={it.src} ratio="16/9" fit="cover" alt=""
                presentation={it.asset ? { ...it.asset.presentation, ...(it.position ? { focal: focalFrom(it.position) } : null) } : undefined}
                art={artVars(it.asset)} title={it.title} titleLang={it.lang} titleState="noImage" decorative />
              <span className="t-card name home-tile-name"><bdi lang={it.lang}>{it.title}</bdi></span>
              <span className="t-meta home-tile-meta">{it.meta}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------------ characters

function Characters({ cast, total }: { cast: CastTile[]; total: number }) {
  return (
    <section className="home-section" aria-labelledby="home-cast-h">
      <SectionHead id="home-cast-h" title="Characters" count={total} link={{ href: '/characters', label: 'Casting directory' }} />
      <ul className="home-lineup home-rail" role="list">
        {cast.map((c) => (
          <li key={c.id} className="home-cast-item">
            <Link className="mtile-link home-tile" href={c.href} title={c.name}>
              <Frame asset={c.asset} src={c.src} ratio="928/1664" fit="contain" alt="" art={artVars(c.asset)} title={c.name} titleLang={c.lang} titleState="noImage" decorative />
              <span className="t-card name home-tile-name"><bdi lang={c.lang}>{c.name}</bdi></span>
              <span className="home-tile-state">{c.waiting && <span className="badge badge-warn">Needs approval</span>}</span>
            </Link>
          </li>
        ))}
        <li className="home-cast-new">
          <Link className="mtile-link home-tile home-newchar" href="/characters/new">
            <span className="home-newchar-frame">
              <span className="home-newchar-plus" aria-hidden><IconPlus /></span>
              <span className="t-body home-newchar-label">New character</span>
            </span>
            <span className="t-card home-tile-name" aria-hidden />
            <span className="home-tile-state" aria-hidden />
          </Link>
        </li>
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ start something

function Starts() {
  return (
    <section className="home-section" aria-labelledby="home-start-h">
      <SectionHead id="home-start-h" title="Start something new" description="The studio drafts each step; you approve it." />
      <ul className="home-row home-starts" role="list">
        {START_ACTIONS.map((a) => (
          <li key={a.href}>
            <Link className="acard home-card home-action" href={a.href}>
              <ShapeGlyph shape={a.shape} />
              <IconChevronRight aria-hidden className="home-action-chev" />
              <span className="home-action-text">
                <span className="t-card">{a.title}</span>
                <span className="t-body home-action-line">{a.line}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------- the studio

function StudioPanel({ facts }: { facts: StudioFact[] }) {
  return (
    <section className="home-section" aria-labelledby="home-studio-h">
      <SectionHead id="home-studio-h" title="The studio" link={{ href: '/studio', label: 'Studio Company' }} />
      <dl className="pcard home-panel">
        {facts.map((f) => (
          <div key={f.key} className="home-fact" aria-busy={f.value === null || undefined}>
            <dt className="t-label">{f.label}</dt>
            {f.value === null
              ? <dd className="home-fact-v"><Skeleton.Line size="body" width="72%" /></dd>
              : <dd className="t-body home-fact-v" title={f.value}>{f.tone && <i className="home-dot" data-tone={f.tone} aria-hidden />}<span>{f.value}</span></dd>}
            <dd className="t-body home-fact-2">{f.second ?? ''}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------- the skeleton

/** Home while the studio's first snapshot loads (§5.22): the same frames, rows and gaps as the page, so nothing moves
 *  when it arrives; it appears only after 150 ms (no flash on a fast load) and the page crossfades in over 240 ms. */
export function HomeSkeleton() {
  return (
    <SkeletonRegion label="Opening the studio…" className="home home-skeleton">
      <div className="home-marquee">
        <Skeleton.Block className="home-marquee-frame" width="100%" height="auto" radius="lg" />
        <div className="home-words">
          <div className="home-words-main">
            <div className="home-meta"><Skeleton.Line width="min(20rem, 60%)" /></div>
            <div className="t-display home-title"><Skeleton.Line size="title" width="min(24rem, 70%)" /></div>
            <div className="t-lead home-lead home-sk-lead"><Skeleton.Line width="min(36rem, 90%)" /><Skeleton.Line width="min(24rem, 60%)" /></div>
          </div>
        </div>
      </div>
      <div className="home-section">
        <div className="home-head"><div className="t-section"><Skeleton.Line size="title" width="8rem" /></div></div>
        <div className="home-row home-rail home-decisions">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i}>
              <span className="dcard home-card home-dcard">
                <Skeleton.Media ratio="16/9" />
                <span className="home-dcard-body">
                  <span className="t-label home-kind"><Skeleton.Line width="60%" /></span>
                  <span className="t-card home-dcard-h"><Skeleton.Line width="50%" /></span>
                  <span className="t-body home-dcard-d"><Skeleton.Line width="92%" /><Skeleton.Line width="64%" /></span>
                  <Skeleton.Block className="home-dcard-btn" width={128} height={32} radius="pill" />
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="home-section">
        <div className="home-head"><div className="t-section"><Skeleton.Line size="title" width="14rem" /></div></div>
        <div className="home-row home-rail home-recent">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="home-tile">
              <Skeleton.Media ratio="16/9" />
              <span className="t-card home-tile-name"><Skeleton.Line width="60%" /></span>
              <span className="t-meta home-tile-meta"><Skeleton.Line width="40%" /></span>
            </div>
          ))}
        </div>
      </div>
    </SkeletonRegion>
  );
}
