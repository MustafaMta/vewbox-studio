'use client';

import Link from 'next/link';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { Production } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { useLive, useProductionPipeline } from '@/studio/org';
import { artVars } from '@/studio/presentation';
import { Frame } from '@/components/media/Frame';
import { Skeleton, SkeletonRegion } from '@/components/ui/kit';
import { IconChevronLeft, IconDownload, IconPlay } from '@/components/ui/icons';
import { runtime } from '@/components/home/model';
import { FilmPlayer, type FilmPlayerHandle } from './FilmPlayer';
import { creditsOf, filmPage, productionTabHref, type Credit, type ExportItem, type FilmPage, type StripScene, type StripShot } from './model';
import { Head } from './parts';

/** A SHORT'S TITLE PAGE (docs/DESIGN-SYSTEM-V5.md §8.5 under docs/design/VISUAL-STANDARD-V5.1.md) — the film presented
 *  as finished creative work, not a workspace:
 *
 *    the head        status badge and slate · the title (.t-display) · the logline; at the end "Open production" and
 *                    the one primary, "Screen it" (or "Continue: <stage>" while it is being made)
 *    the stage       the poster (key art, else the composed frame poster) beside the player — the real cut with its
 *                    transport docked under the picture — both the same height; under the player the film strip:
 *                    every shot of the cut at its share of the running time, grouped by scene with the scene's name;
 *                    a shot seeks the player to where it starts
 *    downloads       each export with its subtitle files
 *    story           the synopsis beside the film's facts (a definition list)
 *    cast, places    the characters as standing figures with the lines they speak, and the locations' plates
 *    credits         the departments that made it, each with what it made, from the production's records
 *
 *  Making and changing the film happens in the production workspace: every "work on it" link goes to
 *  /shorts/<id>/production?tab=<tab>. */

export function ShortPage({ p }: { p: Production }) {
  const { state } = useStudio();
  const film = useMemo(() => filmPage(p, state), [p, state]);
  const player = useRef<FilmPlayerHandle>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const onTime = useCallback((t: number) => {
    const shot = film.strip.find((x) => t >= x.start && t < x.start + x.duration)?.id ?? null;
    setCurrent((c) => (c === shot ? c : shot));
  }, [film.strip]);
  const seek = useCallback((x: StripShot) => { player.current?.seek(x.start + 0.01); player.current?.play(); }, []);

  return (
    <article className="film" aria-labelledby="film-title" data-state={film.cut ? 'cut' : film.still ? 'still' : 'none'}>
      <FilmHead film={film} />
      <section className="film-stage" aria-label="The film">
        <figure className="film-poster">
          <Frame asset={film.poster?.asset} src={film.poster?.src} ratio="2/3" fit="cover" radius="hero" priority art={artVars(film.poster?.asset)}
            alt={film.poster ? `${film.poster.label} of ${film.title}` : ''} title={film.title} titleLang={film.lang} titleState="noPoster" className="film-poster-frame" />
          <figcaption className="t-meta film-poster-cap">{film.poster?.label ?? 'No poster yet'}</figcaption>
        </figure>
        <div className="film-screen">
          {film.cut ? (
            <FilmPlayer ref={player} src={film.cut.src} poster={film.cut.poster} title={film.title} captions={film.cut.captions} onTime={onTime} />
          ) : (
            <div className="film-player film-player-still">
              <Frame asset={film.still?.asset} src={film.still?.src} ratio="16/9" fit="cover" radius="none" alt={film.still?.label ?? ''} art={artVars(film.still?.asset)}
                title={film.title} titleLang={film.lang} titleState="notMade" className="film-player-pic" />
              <div className="film-transport film-transport-note">
                <span className="t-body">{film.still ? `${film.still.label}. The film has no cut yet.` : 'Nothing is filmed yet.'}</span>
              </div>
            </div>
          )}
        </div>
        {film.strip.length > 0 && <FilmStrip film={film} current={current} onPick={film.cut ? seek : undefined} />}
      </section>

      {film.exports.length > 0 && <Downloads items={film.exports} />}
      {(film.synopsis || film.facts.length > 0) && <Story film={film} />}
      {(film.cast.length > 0 || film.places.length > 0) && <CastAndPlaces film={film} />}
      <Credits p={p} />
    </article>
  );
}

// ------------------------------------------------------------------------------------------------------- the head

function FilmHead({ film }: { film: FilmPage }) {
  return (
    <header className="film-head">
      <Link className="home-link film-back" href="/shorts"><IconChevronLeft aria-hidden />Shorts</Link>
      <div className="film-head-row">
        <div className="film-words">
          <p className="film-meta">
            <span className={`badge ${film.status.tone === 'ok' ? 'badge-ok' : 'badge-neutral'}`}>{film.status.words}</span>
            <span className="t-meta t-facts film-slate">{film.slate.map((s, i) => <span key={i}>{s}</span>)}</span>
          </p>
          <h1 id="film-title" className={`${film.long ? 't-hero' : 't-display'} film-title`}><bdi lang={film.lang}>{film.title}</bdi></h1>
          {film.logline && <p className="t-lead film-logline" dir="auto">{film.logline}</p>}
        </div>
        <div className="film-acts">
          <Link className="btn btn-secondary" href={film.secondary.href}>{film.secondary.label}</Link>
          <Link className="btn btn-primary" href={film.primary.href}>{film.primary.play && <IconPlay aria-hidden />}{film.primary.label}</Link>
        </div>
      </div>
    </header>
  );
}

// -------------------------------------------------------------------------------------------------- the film strip

/** Every shot of the cut, each as wide as its share of the running time, grouped by scene with the scene's name under
 *  its shots. With a cut, a shot is a button that plays the film from where the shot starts; the shot on screen is
 *  marked. Without one, the strip is a picture of the storyboard. */
function FilmStrip({ film, current, onPick }: { film: FilmPage; current: string | null; onPick?: (x: StripShot) => void }) {
  return (
    <div className="film-strip" role="group" aria-label={`The ${film.strip.length} shots of ${film.title}`}>
      {film.scenes.map((sc) => (
        <div key={sc.id} className="film-strip-scene" style={{ flexGrow: sc.duration }}>
          <ol className="film-strip-shots" aria-label={sceneName(sc)}>
            {film.strip.filter((x) => x.sceneId === sc.id).map((x) => (
              <li key={x.id} style={{ flexGrow: x.duration }}>
                <StripFrame x={x} current={current === x.id} onPick={onPick} />
              </li>
            ))}
          </ol>
          <span className="t-meta film-strip-label" title={sceneName(sc)}><span className="film-strip-num">Scene {sc.number}</span>{sc.title && <> · <bdi>{sc.title}</bdi></>}</span>
        </div>
      ))}
    </div>
  );
}
const sceneName = (sc: StripScene) => `Scene ${sc.number}${sc.title ? ` · ${sc.title}` : ''}`;

function StripFrame({ x, current, onPick }: { x: StripShot; current: boolean; onPick?: (x: StripShot) => void }) {
  const pic = (
    <Frame asset={x.asset} src={x.src} ratio="16/9" fit="cover" radius="none" alt="" art={artVars(x.asset)} title={x.label} titleState="notMade" decorative className="film-strip-frame">
      <span className="film-strip-chip" aria-hidden>{x.label}</span>
    </Frame>
  );
  if (!onPick) return <span className="film-strip-shot">{pic}</span>;
  return (
    <button type="button" className="film-strip-shot" aria-current={current || undefined} aria-label={`Play from shot ${x.label}, ${runtime(x.start) ?? '0:00'}`} onClick={() => onPick(x)}>{pic}</button>
  );
}

// ---------------------------------------------------------------------------------------------------- downloads

function Downloads({ items }: { items: ExportItem[] }) {
  // one card per export, and one per subtitle language of the newest export, with each format as its own download
  const subs = new Map<string, ExportItem['subtitles']>();
  for (const f of items[0]?.subtitles ?? []) subs.set(f.label, [...(subs.get(f.label) ?? []), f]);
  return (
    <section className="film-section" aria-labelledby="film-dl-h">
      <Head id="film-dl-h" title="Downloads" description="The finished film and its subtitles, as the studio delivered them." />
      <ul className="film-files" role="list">
        {items.map((ex) => (
          <li key={ex.id} className="card film-file">
            <span className="t-label">Film</span>
            <span className="t-card film-file-title">{ex.title}</span>
            <span className="t-body film-file-detail">{ex.detail}</span>
            <span className="film-file-acts">
              {ex.href ? <a className="btn btn-secondary btn-sm" href={ex.href} download><IconDownload aria-hidden />Download</a> : <span className="t-meta">The file is missing</span>}
            </span>
          </li>
        ))}
        {[...subs].map(([label, files]) => (
          <li key={label} className="card film-file">
            <span className="t-label">Subtitles</span>
            <span className="t-card film-file-title">{label.replace(/ subtitles$/, '')}</span>
            <span className="t-body film-file-detail">{files.map((f) => f.detail).join(' and ')}</span>
            <span className="film-file-acts">
              {files.map((f) => <a key={f.id} className="btn btn-secondary btn-sm" href={f.href} download aria-label={`Download ${label}, ${f.detail.split(' · ')[0]}`}><IconDownload aria-hidden />{f.detail.split(' · ')[0]}</a>)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// -------------------------------------------------------------------------------------------------------- story

function Story({ film }: { film: FilmPage }) {
  return (
    <section className="film-section" aria-labelledby="film-story-h">
      <Head id="film-story-h" title="Story" link={{ href: productionTabHref(film.p, 'story'), label: 'Edit the story' }} />
      <div className="film-story">
        {film.synopsis ? <p className="t-prose film-synopsis" dir="auto">{film.synopsis}</p> : <p className="t-body">No synopsis yet.</p>}
        {film.facts.length > 0 && (
          <dl className="card film-facts">
            {film.facts.map((f) => (
              <div key={f.label} className="film-fact">
                <dt className="t-label">{f.label}</dt>
                <dd className="film-fact-value">{f.value}</dd>
                {f.sub && <dd className="t-meta film-fact-sub">{f.sub}</dd>}
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------- cast and places

function CastAndPlaces({ film }: { film: FilmPage }) {
  const title = film.cast.length && film.places.length ? 'Cast and locations' : film.cast.length ? 'Cast' : 'Locations';
  return (
    <section className="film-section" aria-labelledby="film-cast-h">
      <Head id="film-cast-h" title={title} link={{ href: productionTabHref(film.p, film.cast.length ? 'characters' : 'locations'), label: 'Edit in production' }} />
      <ul className="film-cast" role="list">
        {film.cast.map((c) => (
          <li key={c.id} className="film-person">
            <Link className="film-tile" href={c.href} title={c.name}>
              <Frame asset={c.asset} src={c.src} ratio="928/1664" fit="contain" alt="" art={artVars(c.asset)} title={c.name} titleLang={c.lang} titleState="noImage" decorative className="film-figure" />
              <span className="t-card name film-tile-name"><bdi lang={c.lang}>{c.name}</bdi></span>
              <span className="t-meta film-tile-line">{c.line}</span>
            </Link>
          </li>
        ))}
        {film.places.map((l) => (
          <li key={l.id} className="film-place">
            <Link className="film-tile" href={l.href} title={l.name}>
              <Frame asset={l.asset} src={l.src} ratio="16/9" fit="cover" alt="" art={artVars(l.asset)} title={l.name} titleLang={l.lang} titleState="noImage" decorative className="film-plate" />
              <span className="t-card name film-tile-name"><bdi lang={l.lang}>{l.name}</bdi></span>
              <span className="t-meta film-tile-line">{l.line}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------------ credits

interface OrgSummary { departments: Array<{ id: string; name: string }> }

function Credits({ p }: { p: Production }) {
  const { state } = useStudio();
  const pipeline = useProductionPipeline(p.id);
  const org = useLive<OrgSummary>('/api/studio/org?view=summary');
  const credits: Credit[] | null = useMemo(() => (pipeline.data && org.data ? creditsOf(p, state, pipeline.data, org.data.departments) : null), [p, state, pipeline.data, org.data]);
  if (credits && credits.length === 0) return null;
  if (!credits && (pipeline.error || org.error)) return null;
  return (
    <section className="film-section" aria-labelledby="film-credits-h" aria-busy={credits ? undefined : true}>
      <Head id="film-credits-h" title="Credits" link={{ href: '/studio', label: 'Studio Company' }} />
      {credits ? (
        <dl className="film-credits">
          {credits.map((c) => (
            <div key={c.department} className="film-credit">
              <dt className="t-label">{c.role}</dt>
              <dd className="t-credit film-credit-name"><Link href={c.href}>{c.name}</Link></dd>
              <dd className="t-body film-credit-made">{c.made}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="film-credits" aria-hidden>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="film-credit">
              <span className="t-label"><Skeleton.Line width="40%" /></span>
              <span className="t-credit film-credit-name"><Skeleton.Line size="title" width="70%" /></span>
              <span className="t-body film-credit-made"><Skeleton.Line width="55%" /></span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------- the skeleton

/** The title page while the studio's first snapshot loads (§5.22): the head, the poster beside the player with its
 *  docked transport and the strip, in their final sizes — the same classes size them, so nothing moves. */
export function ShortSkeleton() {
  return (
    <SkeletonRegion label="Opening the film…" className="film film-skeleton">
      <div className="film-head">
        <span className="home-link film-back"><Skeleton.Line width="4rem" /></span>
        <div className="film-head-row">
          <div className="film-words">
            <div className="film-meta"><Skeleton.Block width={64} height={22} radius="pill" /><Skeleton.Line width="18rem" /></div>
            <div className="t-display film-title"><Skeleton.Block width="min(28rem, 80%)" height="0.9em" radius="media" /></div>
            <div className="t-lead film-logline"><Skeleton.Text lines={2} /></div>
          </div>
          <div className="film-acts"><Skeleton.Block width={148} height={40} radius="pill" /><Skeleton.Block width={120} height={40} radius="pill" /></div>
        </div>
      </div>
      <div className="film-stage">
        <div className="film-poster"><Skeleton.Media ratio="2/3" className="film-poster-frame" /><span className="t-meta film-poster-cap"><Skeleton.Line width="9rem" /></span></div>
        <div className="film-screen"><div className="film-player"><Skeleton.Media ratio="16/9" className="film-player-pic" /><div className="film-transport" /></div></div>
        <div className="film-strip">
          {[1, 1].map((_, i) => (
            <div key={i} className="film-strip-scene" style={{ flexGrow: 1 }}>
              <div className="film-strip-shots">{Array.from({ length: 4 }, (_, j) => <div key={j} style={{ flexGrow: 1 }}><span className="film-strip-shot"><Skeleton.Media ratio="16/9" className="film-strip-frame" /></span></div>)}</div>
              <span className="t-meta film-strip-label"><Skeleton.Line width="8rem" /></span>
            </div>
          ))}
        </div>
      </div>
    </SkeletonRegion>
  );
}
