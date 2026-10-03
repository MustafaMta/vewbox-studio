'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useStudio } from '@/studio/store';
import { useLive } from '@/studio/org';
import { useShell } from '@/components/shell/context';
import { artVars } from '@/studio/presentation';
import { Frame } from '@/components/media/Frame';
import { TitleCard } from '@/components/media/TitleCard';
import { IconChevronDown, IconChevronRight, IconPlay, IconPlus } from '@/components/ui/icons';
import { decisionCard, deptMark, handoffWords, introLine, lineup, pickMarquee, recentWork, shortWhen, type DecisionCard, type Marquee, type RecentItem } from './model';

/** HOME — the lobby of the studio (docs/DESIGN-SYSTEM-V5.md §8.1; prototype docs/design/prototypes/home.html): what is
 *  showing (the latest film), what waits for the producer (the shared decision count, B8), what they were doing (a
 *  contact sheet of recent work), the studio's own state (paused, the company, the last handoffs), the characters'
 *  line-up and the three ways to start something. Every word and number comes from the studio's state or the server;
 *  an empty studio opens on "Your studio is ready." with the start cards first. */

interface Health { intake?: { paused: boolean; since?: string | null; reason?: string | null } | null; queue?: { queued: number; running: number; failed24h: number; completed24h: number } | null }
interface Engines { video?: { ok: boolean }; images?: { ok: boolean }; voice?: { ok: boolean } }
interface OrgSummary { departments: Array<{ id: string; name: string }>; agents: number; queue: { queued: number; running: number; failed24h: number; completed24h: number }; handoffs: Array<{ id: string; productionId: string; stage: string; producerDepartment: string; receiverDepartment: string | null; qualityStatus: string; createdAt: string }> }

export function Home() {
  const { state, jobs } = useStudio();
  const { decisions } = useShell();
  const { data: health } = useLive<Health>('/api/health');
  const { data: engines } = useLive<Engines>('/api/status');
  const { data: org } = useLive<OrgSummary>('/api/studio/org?view=summary&handoffs=2');

  const marquee = useMemo(() => pickMarquee(state), [state]);
  const cards = useMemo(() => decisions.items.map((d) => decisionCard(d, state)), [decisions, state]);
  const recent = useMemo(() => recentWork(state, 6), [state]);
  const cast = useMemo(() => lineup(state, 5), [state]);
  // jobs being made now (queued or in any working phase); a job parked for review is a decision, not work
  const running = jobs.filter((j) => ['QUEUED', 'PREPARING', 'GENERATING', 'DOWNLOADING', 'VALIDATING', 'POSTPROCESSING'].includes(j.status)).length;
  const paused = Boolean(health?.intake?.paused);
  const empty = state.productions.length === 0 && state.characters.length === 0 && state.locations.length === 0;

  return (
    <div className="home" data-state={empty ? 'empty' : marquee?.finished ? 'finished' : 'working'}>
      {marquee ? <MarqueeSection m={marquee} /> : <EmptyOpening />}
      <div className="home-wrap">
        {!empty && (
          <div className="home-intro">
            <p className="t-card-lg">{introLine(decisions.count, running, paused)}</p>
            <NewMenu />
          </div>
        )}
        {empty && <Starts first />}
        {cards.length > 0 && <NeedsYou cards={cards} />}
        {!empty && (
          <section className="home-section" aria-labelledby="home-recent-h">
            <div className="home-recent">
              <div className="home-recent-main">
                <div className="home-shead"><h2 id="home-recent-h" className="h2">Pick up where you left off</h2></div>
                {recent.length > 0 ? <ContactSheet items={recent} /> : <p className="home-empty-copy">Nothing has been touched yet.</p>}
              </div>
              <StudioCard paused={paused} since={health?.intake?.since ?? null} decisions={decisions.count} running={running} engines={engines} org={org} titleOf={(id) => state.productions.find((p) => p.id === id)?.title} />
            </div>
          </section>
        )}
        {!empty && (
          <section className="home-section" aria-labelledby="home-cast-h">
            <div className="home-shead">
              <h2 id="home-cast-h" className="h2">Characters<span className="home-count">{state.characters.length}</span></h2>
              <Link className="home-link" href="/characters">The casting directory<IconChevronRight aria-hidden className="home-i-sm" /></Link>
            </div>
            <ul className="home-lineup" role="list">
              {cast.map((c) => (
                <li key={c.id}>
                  <Link className="home-tile" href={c.href}>
                    <Frame asset={c.asset} ratio="928/1664" fit="contain" alt="" art={artVars(c.asset)} title={c.name} titleState="noImage" decorative />
                    <span className="t-card-sm home-tile-title content-text" dir="auto">{c.name}</span>
                    <span className="home-state" data-tone={c.state.tone}><i className="home-dot" aria-hidden />{c.state.words}</span>
                  </Link>
                </li>
              ))}
              <li>
                <Link className="home-tile" href="/characters/new">
                  <TitleCard title="One image, one voice" ratio="928/1664" stateLabel="New character" decorative />
                  <span className="home-tile-title home-tile-title-ui">Cast someone new</span>
                  <span className="home-state">Describe them, or start from a picture</span>
                </Link>
              </li>
            </ul>
          </section>
        )}
        {!empty && <Starts />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------- marquee

function MarqueeSection({ m }: { m: Marquee }) {
  const [wideOk, setWideOk] = useState(true);
  const wide = wideOk ? m.wide : undefined;
  const pic = wide ?? m.poster;
  const alt = `A frame from ${m.title}`;
  return (
    <section className="home-marquee" aria-labelledby="home-feature-title" data-pic={pic ? (wide ? 'wide' : 'poster') : 'none'}>
      {pic && (
        <picture className="home-marquee-pic">
          {wide && m.poster && <source media="(max-width: 639px)" srcSet={m.poster.src} />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pic.src} alt={alt} fetchPriority="high" decoding="async" onError={() => setWideOk(false)} />
        </picture>
      )}
      <div className="home-marquee-text">
        <p className="home-kick"><span className="home-kick-line" aria-hidden />{m.kick}</p>
        <p className="home-slate">
          {m.slate.map((s, i) => <span key={i}>{s}</span>)}
          <span className="home-state" data-tone={m.status.tone}><i className="home-dot" aria-hidden />{m.status.words}</span>
        </p>
        <h1 id="home-feature-title" className="t-marquee content-text" dir="auto">{m.title}</h1>
        {m.lead && <p className="home-lead content-text" dir="auto">{m.lead}</p>}
        <div className="home-acts">
          {m.screenHref
            ? <Link className="btn btn-primary btn-lg" href={m.screenHref}><IconPlay aria-hidden />Screen it</Link>
            : <Link className="btn btn-primary btn-lg" href={`${m.href}/production`}>Continue</Link>}
          <Link className="btn btn-secondary btn-lg" href={m.href}>Open the film</Link>
        </div>
      </div>
      {(m.credit.length > 0 || m.creditMono) && (
        <p className="home-credit">
          {m.credit.length > 0 && <span>{m.credit.join(' · ')}</span>}
          {m.creditMono && <span className="home-mono">{m.creditMono}</span>}
        </p>
      )}
    </section>
  );
}

function EmptyOpening() {
  return (
    <section className="home-opening home-wrap" aria-labelledby="home-ready-h">
      <h1 id="home-ready-h" className="t-hero">Your studio is ready.</h1>
      <p className="home-lead">Start a show, a short or a music video. The studio drafts each step; you approve it.</p>
      <div className="home-acts"><Link className="btn btn-secondary btn-lg" href="/studio">Meet your studio</Link></div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------------ the New menu

const NEW_ITEMS = [
  { href: '/new/show', label: 'A show', hint: 'Seasons and episodes' },
  { href: '/new/short', label: 'A short', hint: 'One film' },
  { href: '/new/music-video', label: 'A music video', hint: 'Starts with its song' },
  { href: '/characters/new', label: 'A character', hint: 'One image, one voice' },
  { href: '/locations/new', label: 'A location', hint: 'A place to film' },
];

function NewMenu() {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback((refocus: boolean) => { setOpen(false); if (refocus) button.current?.focus(); }, []);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) close(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const links = [...(root.current?.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]') ?? [])];
      const i = links.indexOf(document.activeElement as HTMLAnchorElement);
      e.preventDefault();
      links[(i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length]?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    root.current?.querySelector<HTMLAnchorElement>('[role="menuitem"]')?.focus();
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, close]);
  return (
    <div className="home-new" ref={root}>
      <button ref={button} type="button" className="btn btn-secondary" aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <IconPlus aria-hidden />New<IconChevronDown aria-hidden className="home-i-sm" />
      </button>
      {open && (
        <div id={id} className="home-new-menu" role="menu" aria-label="Start something new">
          {NEW_ITEMS.map((it) => (
            <Link key={it.href} href={it.href} role="menuitem" className="home-new-item" onClick={() => setOpen(false)}>
              <span>{it.label}</span><span className="home-new-hint">{it.hint}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------- needs you

function NeedsYou({ cards }: { cards: DecisionCard[] }) {
  const rail = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const onScroll = useCallback(() => {
    const el = rail.current; if (!el) return;
    const items = [...el.children] as HTMLElement[];
    const x = el.scrollLeft;
    let best = 0, dist = Infinity;
    items.forEach((it, i) => { const d = Math.abs(it.offsetLeft - el.offsetLeft - x); if (d < dist) { dist = d; best = i; } });
    setAt(best);
  }, []);
  return (
    <section className="home-section home-needs" aria-labelledby="home-needs-h">
      <div className="home-shead">
        <h2 id="home-needs-h" className="h2">Needs you<span className="home-count">{cards.length}</span></h2>
        {cards.length > 1 && (
          <span className="home-railpos" aria-hidden>{at + 1} of {cards.length} · swipe{cards.map((c, i) => <i key={c.id} data-on={i === at || undefined} />)}</span>
        )}
        <Link className="home-link" href="/production#needs-you">All decisions in Production<IconChevronRight aria-hidden className="home-i-sm" /></Link>
      </div>
      <div className="home-decisions" ref={rail} onScroll={onScroll}>
        {cards.map((c) => (
          <article key={c.id} className="home-dcard">
            <Frame asset={c.picture?.asset} src={c.picture?.src} ratio="16/9" fit={c.picture?.figure ? 'contain' : 'cover'} alt={c.picture?.alt ?? ''} art={artVars(c.picture?.asset)} title={c.heading} titleState="noImage" judge={c.picture?.figure}>
              {c.chip && <span className="home-chip">{c.chip}</span>}
            </Frame>
            <p className="home-kind"><i className="home-dot" aria-hidden />{c.kindLabel}</p>
            <h3 className={c.headingIsContent ? 't-card-sm content-text' : 't-card-sm'} dir={c.headingIsContent ? 'auto' : undefined}>{c.heading}</h3>
            <p className="home-dbody">{c.body}</p>
            <Link className="btn btn-secondary btn-sm" href={c.href}>{c.action}<span className="sr-only">: {c.heading}</span></Link>
          </article>
        ))}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------- contact sheet

const SHAPE_RATIO = { '16x9': '16/9', fig: '928/1664', '239': '2.39/1' } as const;

function ContactSheet({ items }: { items: RecentItem[] }) {
  return (
    <ul className="home-contact" role="list">
      {items.map((it) => (
        <li key={it.key} className="home-contact-item" data-shape={it.shape}>
          <Link className="home-tile" href={it.href}>
            <Frame asset={it.asset} src={it.src} ratio={SHAPE_RATIO[it.shape]} fit={it.shape === 'fig' ? 'contain' : 'cover'} alt="" art={artVars(it.asset)} title={it.title} titleState="noImage" decorative>
              {it.chip && <span className="home-chip home-chip-end home-mono">{it.chip}</span>}
            </Frame>
            <span className="home-kindl">{it.kindLabel}</span>
            <span className="t-card-sm home-tile-title content-text" dir="auto">{it.title}</span>
            <span className="home-what">{it.what}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------------------------- the studio now

function StudioCard({ paused, since, decisions, running, engines, org, titleOf }: { paused: boolean; since: string | null; decisions: number; running: number; engines: Engines | null; org: OrgSummary | null; titleOf: (id: string) => string | undefined }) {
  const state = paused ? { tone: 'neutral', words: 'Paused' } : running > 0 ? { tone: 'ok', words: `Working · ${running} ${running === 1 ? 'job' : 'jobs'}` } : { tone: 'neutral', words: 'Idle' };
  const when = shortWhen(since);
  const waits = decisions === 0 ? 'nothing waits for you' : decisions === 1 ? 'the decision above waits for you' : `the ${decisions} decisions above wait for you`;
  const why = paused ? `Intake is paused${when ? ` since ${when}` : ''}: no new work starts. Nothing is lost; ${waits}.` : running > 0 ? `The studio is making things now; ${waits}.` : `The studio is ready for work; ${waits}.`;
  const dept = (id: string | null) => (id ? org?.departments.find((d) => d.id === id)?.name ?? id : null);
  const engine = (ok: boolean | undefined) => (engines === null ? '…' : ok ? 'Ready' : 'Offline');
  return (
    <aside className="home-studio" aria-labelledby="home-studio-h">
      <h2 id="home-studio-h" className="h3">The studio now</h2>
      <p className="home-studio-big" data-tone={state.tone}><i className="home-dot" aria-hidden />{state.words}</p>
      <p className="home-studio-why">{why}</p>
      <dl>
        {org && <><dt>Company</dt><dd>{org.departments.length} departments · {org.agents} agents</dd></>}
        <dt>Picture and video</dt><dd>{engine(engines ? Boolean(engines.images?.ok && engines.video?.ok) : undefined)}</dd>
        <dt>Voices</dt><dd>{engine(engines?.voice?.ok)}</dd>
        {org && <><dt>Last 24 hours</dt><dd>{org.queue.completed24h} jobs done{org.queue.failed24h ? ` · ${org.queue.failed24h} failed` : ''}</dd></>}
      </dl>
      {org?.handoffs.map((h) => {
        const from = dept(h.producerDepartment) ?? h.producerDepartment;
        const to = dept(h.receiverDepartment);
        const title = titleOf(h.productionId);
        return (
          <div key={h.id} className="home-handoff">
            <span className="home-handoff-mark" aria-hidden>{deptMark(from)}</span>
            <b>{to ? `${from} to ${to}` : from}</b>
            <span>{[handoffWords(h.stage, h.qualityStatus === 'VALIDATED'), title, shortWhen(h.createdAt)].filter(Boolean).join(' · ')}</span>
          </div>
        );
      })}
      <Link className="home-link home-studio-link" href="/studio">Open the Studio Company<IconChevronRight aria-hidden className="home-i-sm" /></Link>
    </aside>
  );
}

// ------------------------------------------------------------------------------------------------------- starts

function Starts({ first }: { first?: boolean }) {
  return (
    <section className="home-section" aria-labelledby="home-start-h">
      <div className="home-shead">
        <h2 id="home-start-h" className="h2">{first ? 'Start with one of these' : 'Start something new'}</h2>
        <span className="home-link home-link-quiet">The studio drafts; you approve.</span>
      </div>
      <ul className="home-starts" role="list">
        <li><Link className="home-tile" href="/new/show"><TitleCard title="Your first show" ratio="16/9" stateLabel="A show" size="lg" decorative /><span className="home-tile-title home-tile-title-ui">A show</span><span className="home-empty-copy">Seasons and episodes that share one cast and one world.</span></Link></li>
        <li><Link className="home-tile" href="/new/short"><TitleCard title="Your next film" ratio="2/3" stateLabel="A short" decorative /><span className="home-tile-title home-tile-title-ui">A short</span><span className="home-empty-copy">One film; a line is enough to start.</span></Link></li>
        <li><Link className="home-tile" href="/new/music-video"><TitleCard title="Your first song" ratio="1/1" stateLabel="A music video" decorative /><span className="home-tile-title home-tile-title-ui">A music video</span><span className="home-empty-copy">It starts with its song: let the studio write it, or bring one you have.</span></Link></li>
      </ul>
    </section>
  );
}
