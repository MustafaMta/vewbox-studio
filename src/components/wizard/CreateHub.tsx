'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { isActiveStatus, type Job } from '@/domain/jobs';
import { useStudio } from '@/studio/store';
import { shortWhen } from '@/components/home/model';
import { JobDot, ShapeGlyph, Skeleton, SkeletonRegion, type ShapeName } from '@/components/ui/kit';
import { IconAuto, IconChevronRight, IconManual } from '@/components/ui/icons';

/** THE CREATION HUB (/new) — everything the studio makes, in Home's language: films (show, short, music video) each
 *  with its two ways in, Auto and Manual; the cast and the world (character, location) on their own pages; and the
 *  ideas the studio is writing or has written and nobody has picked yet. Each start card shows the object's own
 *  empty frame (the viewfinder corners in its shape); the counts under the cards are the studio's real ones. */

interface Start { key: string; shape: ShapeName; title: string; line: string; count: string; href?: string; modes?: boolean }

const plural = (n: number, one: string, many = `${one}s`) => (n === 0 ? `No ${many} yet` : `${n} ${n === 1 ? one : many} in the studio`);

const KIND_OF: Record<string, { path: string; noun: string }> = { SHOW: { path: 'show', noun: 'Show' }, SHORT: { path: 'short', noun: 'Short' }, MUSIC_VIDEO: { path: 'music-video', noun: 'Music video' }, SEASON: { path: 'season', noun: 'Season' }, EPISODE: { path: 'episode', noun: 'Episode' } };

export function ideaHref(j: Pick<Job, 'id' | 'payload'>): string {
  const k = KIND_OF[String(j.payload.kind)] ?? KIND_OF.SHORT;
  const q = new URLSearchParams({ mode: 'auto', idea: j.id });
  if (typeof j.payload.showId === 'string') q.set('show', j.payload.showId);
  if (typeof j.payload.seasonId === 'string') q.set('season', j.payload.seasonId);
  return `/new/${k.path}?${q}`;
}

export function CreateHub() {
  const { state, jobs } = useStudio();
  const n = (k: 'SHORT' | 'MUSIC_VIDEO') => state.productions.filter((p) => p.kind === k).length;
  const films: Start[] = [
    { key: 'show', shape: 'show', title: 'New show', line: 'Seasons and episodes that share one cast and one world.', count: plural(state.shows.length, 'show') },
    { key: 'short', shape: 'short', title: 'New short', line: 'One film from one line.', count: plural(n('SHORT'), 'short') },
    { key: 'music-video', shape: 'music', title: 'New music video', line: 'It starts with its song, then its performers.', count: plural(n('MUSIC_VIDEO'), 'music video') },
  ];
  const world: Start[] = [
    { key: 'character', shape: 'character', title: 'New character', line: 'One canonical image and one voice.', count: plural(state.characters.length, 'character'), href: '/characters/new' },
    { key: 'location', shape: 'location', title: 'New location', line: 'A place to film in, drawn as its plates.', count: plural(state.locations.length, 'location'), href: '/locations/new' },
  ];
  const ideas = useMemo(() => {
    const used = new Set(state.productions.map((p) => p.brief?.proposalJobId).filter(Boolean));
    return jobs.filter((j) => j.type === 'AUTO_IDEA' && (isActiveStatus(j.status) || (j.status === 'COMPLETED' && typeof j.result?.proposalId === 'string' && !used.has(j.id))))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  }, [jobs, state.productions]);

  return (
    <div className="create-hub">
      <header className="create-hub-head">
        <h1 className="t-page">Create</h1>
        <p className="t-lead">Start a film, a character or a place. Let the studio propose it, or write it yourself; nothing is made until you say so.</p>
      </header>

      <section className="create-hub-section" aria-labelledby="create-hub-films">
        <div className="create-hub-shead"><h2 id="create-hub-films" className="t-section">Films</h2><p className="t-body">Auto: the studio proposes the idea and you pick it. Manual: a short brief of your own.</p></div>
        <ul className="create-hub-grid" data-count="3" role="list">
          {films.map((f) => <li key={f.key}><StartCard s={f} /></li>)}
        </ul>
      </section>

      <section className="create-hub-section" aria-labelledby="create-hub-world">
        <div className="create-hub-shead"><h2 id="create-hub-world" className="t-section">Cast and world</h2><p className="t-body">The characters and places your films share.</p></div>
        <ul className="create-hub-grid" data-count="2" role="list">
          {world.map((f) => <li key={f.key}><StartCard s={f} /></li>)}
        </ul>
      </section>

      {ideas.length > 0 && (
        <section className="create-hub-section" aria-labelledby="create-hub-ideas">
          <div className="create-hub-shead"><h2 id="create-hub-ideas" className="t-section">Ideas waiting</h2><p className="t-body">Ideas the studio is writing, or wrote and nobody has picked yet.</p></div>
          <ul className="create-idea-list" role="list">
            {ideas.map((j) => {
              const title = typeof j.result?.title === 'string' ? j.result.title : typeof j.payload.brief === 'string' && j.payload.brief ? j.payload.brief.slice(0, 60) : 'An idea from the studio';
              const active = isActiveStatus(j.status);
              return (
                <li key={j.id}>
                  <Link className="card create-idea create-idea-link" href={ideaHref(j)}>
                    <span className="create-idea-words"><span className="t-card name"><bdi>{title}</bdi></span><span className="t-meta create-idea-meta">{[KIND_OF[String(j.payload.kind)]?.noun, shortWhen(j.createdAt)].filter(Boolean).join(' · ')}</span></span>
                    {active ? <JobDot>{j.progress?.message ?? 'Developing'}</JobDot> : <span className="badge">Ready to pick</span>}
                    <IconChevronRight aria-hidden className="create-idea-chev" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function StartCard({ s }: { s: Start }) {
  const id = `create-start-${s.key}`;
  return (
    <article className="card create-start" aria-labelledby={id}>
      <div className="create-start-stage" aria-hidden>
        <span className="create-start-frame" data-shape={s.shape}><span className="create-corners" /><ShapeGlyph shape={s.shape} size={24} /></span>
      </div>
      <div className="create-start-words">
        <h3 id={id} className="t-card">{s.title}</h3>
        <p className="t-body create-start-line">{s.line}</p>
        <p className="t-meta">{s.count}</p>
      </div>
      <div className="create-start-acts">
        {s.href ? (
          <Link className="btn btn-secondary btn-sm" href={s.href} aria-describedby={id}>Start<IconChevronRight aria-hidden /></Link>
        ) : (
          <>
            <Link className="btn btn-secondary btn-sm" href={`/new/${s.key}?mode=auto`} aria-label={`${s.title}, Auto: the studio proposes`}><IconAuto aria-hidden />Auto</Link>
            <Link className="btn btn-secondary btn-sm" href={`/new/${s.key}?mode=manual`} aria-label={`${s.title}, Manual: write the brief`}><IconManual aria-hidden />Manual</Link>
          </>
        )}
      </div>
    </article>
  );
}

/** The hub while the studio's first snapshot loads: the head and the two grids of start cards at their real sizes. */
export function CreateHubSkeleton() {
  return (
    <SkeletonRegion label="Opening the studio…" className="create-hub create-skeleton">
      <div className="create-hub-head"><span className="t-page"><Skeleton.Line size="title" width="8rem" /></span><span className="t-lead"><Skeleton.Line width="28rem" /></span></div>
      {[3, 2].map((count) => (
        <div key={count} className="create-hub-section">
          <div className="create-hub-shead"><span className="t-section"><Skeleton.Line size="title" width="7rem" /></span><span className="t-body"><Skeleton.Line width="20rem" /></span></div>
          <div className="create-hub-grid" data-count={count}>
            {Array.from({ length: count }, (_, i) => (
              <div key={i}>
                <div className="card create-start">
                  <div className="create-start-stage" />
                  <div className="create-start-words"><span className="t-card"><Skeleton.Line width="40%" /></span><span className="t-body create-start-line"><Skeleton.Line width="80%" /></span><span className="t-meta"><Skeleton.Line width="30%" /></span></div>
                  <div className="create-start-acts"><Skeleton.Block width={84} height={32} radius="pill" /></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </SkeletonRegion>
  );
}
