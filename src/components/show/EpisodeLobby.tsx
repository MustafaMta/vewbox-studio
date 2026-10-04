'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import type { Production, Season, Show } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { castOf, productionHref, STAGE_ORDER, stageIndex } from '@/studio/selectors';
import { useShell } from '@/components/shell/context';
import { SectionHead } from '@/components/ui/kit';
import { IconChevronLeft, IconPlay } from '@/components/ui/icons';
import { LANGUAGE_LABEL, episodeCard, episodePicture, episodesOfSeason, figure, minutes, nameLang, nextAction, runtime, stageOf, stageWords, waitingProductions } from './model';
import { Backdrop, Caption } from './Backdrop';
import { CastCard, EmptyLine, EpisodeTile, StatusWord } from './parts';

/** ONE EPISODE — the episode's title page (its lobby): the still at Home's banner proportions, the words under it (the
 *  episode and season, the title, the logline) with Continue — the next step, opened in the episode's production
 *  workspace (…/production) — and Watch when a cut exists. Then the six production steps as cards, each opening its
 *  workspace tab; the story so far; the cast; the other episodes of the season. Nothing is generated here. */

const STEP_TAB: Record<string, string> = { STORY: 'story', CAST_AND_WORLD: 'characters', STORYBOARD: 'storyboard', PRODUCE: 'produce', FINAL_CUT: 'final', COMPLETE: 'final' };

export function EpisodeLobby({ show, season, p }: { show: Show; season?: Season; p: Production }) {
  const { state } = useStudio();
  const { decisions } = useShell();
  const waiting = useMemo(() => waitingProductions(decisions.items), [decisions]);
  const href = productionHref(p);
  const work = `${href}/production`;
  const picture = useMemo(() => episodePicture(state, p), [state, p]);
  const stage = stageOf(p, waiting.has(p.id));
  const next = nextAction(p);
  const cut = state.assets.find((a) => a.id === p.cutAssetId && !a.unavailable);
  const done = p.stage === 'COMPLETE';
  const lang = nameLang(p.title);
  const cast = useMemo(() => castOf(state, p).map((c) => figure(state, c)), [state, p]);
  const others = useMemo(() => (season ? episodesOfSeason(state, season.id).filter((x) => x.id !== p.id).map((x) => episodeCard(state, x, waiting)) : []), [state, season, p.id, waiting]);
  const showHref = `/shows/${encodeURIComponent(show.id)}`;
  const slate = [`Episode ${p.episodeNumber ?? 1}`, season ? `Season ${season.number}` : null, runtime(cut?.durationSeconds) ?? `About ${minutes(p.targetSeconds)}`, LANGUAGE_LABEL[p.language] ?? null].filter(Boolean) as string[];
  const watch = cut ? <Link className={`btn ${done ? 'btn-primary' : 'btn-secondary'}`} href={`/screening?p=${encodeURIComponent(p.id)}`}><IconPlay aria-hidden />Watch</Link> : null;
  const at = stageIndex(p.stage);

  return (
    <div className="shows episode-page">
      <Link className="page-back" href={season ? `${showHref}/seasons/${encodeURIComponent(season.id)}` : showHref}><IconChevronLeft aria-hidden /><bdi lang={nameLang(show.title)}>{show.title}</bdi>{season ? ` · Season ${season.number}` : ''}</Link>
      <section className="show-hero" aria-labelledby="episode-title">
        <Backdrop picture={picture} title={p.title} lang={lang} label={`A frame from ${p.title}`} state="notMade" />
        <Caption actions={done ? <><Link className="btn btn-secondary" href={work}>Open the production</Link>{watch}</>
          : <>{watch}<Link className="btn btn-primary" href={next.href}>Continue: {next.words.charAt(0).toLowerCase()}{next.words.slice(1)}</Link></>}>
          <p className="t-meta show-slate-row"><StatusWord tone={stage.tone}>{stage.words}</StatusWord><span className="t-facts">{slate.map((s, i) => <span key={i}>{s}</span>)}</span></p>
          <h1 id="episode-title" className="t-hero show-title"><bdi lang={lang}>{p.title}</bdi></h1>
          {p.logline && <p className="t-lead show-lead" dir="auto">{p.logline}</p>}
        </Caption>
      </section>

      <section className="shows-section" id="production" aria-labelledby="ep-steps-h">
        <SectionHead id="ep-steps-h" title="Production" description="Each step opens in the episode’s workspace." link={{ href: work, label: 'Open the workspace' }} />
        <ol className="ep-steps" role="list">
          {STAGE_ORDER.map((st, i) => {
            const state_ = done || i < at ? 'done' : i === at ? 'now' : 'next';
            return (
              <li key={st}>
                <Link className="card card-hover card-link ep-step" href={`${work}?tab=${STEP_TAB[st]}`} aria-current={state_ === 'now' ? 'step' : undefined}>
                  <span className="t-label"><span className="num">Step {i + 1}</span></span>
                  <span className="t-card name">{stageWords(st)}</span>
                  {state_ === 'done' ? <StatusWord tone="done">Done</StatusWord> : state_ === 'now' ? <StatusWord tone={stage.tone === 'waiting' ? 'waiting' : 'current'}>{stage.tone === 'waiting' ? 'Waiting for you' : 'Now'}</StatusWord> : <StatusWord tone="idle">Next</StatusWord>}
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="shows-section" aria-labelledby="ep-story-h">
        <SectionHead id="ep-story-h" title="Story" link={{ href: `${work}?tab=story`, label: 'Open the story' }} />
        {p.synopsis.trim() ? <p className="t-prose content-para" dir="auto">{p.synopsis}</p>
          : <EmptyLine action={<Link className="btn btn-secondary btn-sm" href={`${work}?tab=story`}>Write the story</Link>}>{p.brief.text ? <>The brief: <span dir="auto">{p.brief.text}</span></> : 'The story is not written yet.'}</EmptyLine>}
      </section>

      <section className="shows-section" aria-labelledby="ep-cast-h">
        <SectionHead id="ep-cast-h" title="Cast" count={cast.length} description="The show’s cast and anyone this episode adds." link={{ href: `${work}?tab=characters`, label: 'Cast in the workspace', short: 'Workspace' }} />
        {cast.length === 0 ? <EmptyLine action={<Link className="btn btn-secondary btn-sm" href={`${showHref}?edit=cast`}>Choose the show’s cast</Link>}>No characters are cast yet.</EmptyLine>
          : <ul className="show-figures" role="list">{cast.map((f) => <li key={f.id}><CastCard f={f} /></li>)}</ul>}
      </section>

      {season && others.length > 0 && (
        <section className="shows-section" aria-labelledby="ep-more-h">
          <SectionHead id="ep-more-h" title={`More from Season ${season.number}`} count={others.length} link={{ href: `${showHref}/seasons/${encodeURIComponent(season.id)}`, label: 'The whole season', short: 'All' }} />
          <ul className="shows-grid" role="list">{others.map((e) => <li key={e.id}><EpisodeTile e={e} /></li>)}</ul>
        </section>
      )}
    </div>
  );
}

/** The lobby's skeleton lives in ./skeletons (drawn synchronously by the shell); re-exported for the page. */
export { EpisodeSkeleton } from './skeletons';
