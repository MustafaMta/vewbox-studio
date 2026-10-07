'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { Production } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { useShell } from '@/components/shell/context';
import { Room } from '@/components/shell/Room';
import { artVars } from '@/studio/presentation';
import { assetById, productionHref, shotLabel, showById, seasonById } from '@/studio/selectors';
import { currentCutVersion } from '@/studio/selectors/cuts';
import { Frame } from '@/components/media/Frame';
import { SaveWord } from '@/components/ui/kit';
import { IconCheck, IconChevronDown, IconChevronLeft, IconFinalCut, IconPlay, IconStory } from '@/components/ui/icons';
import { StudioLine, type StudioGate } from './gate';
import { orderedShots, shotState, stagePills, workspaceHref, type WorkspaceTab, frameRatioOf, vocab } from './model';
import { shotHref } from '@/studio/selectors';

/** THE WORKSPACE FRAME (docs/DESIGN-SYSTEM-V5.md §5.19, §8.10–§8.11) — the cutting room every workspace page shares:
 *  the workspace bar (back to the film's page, its poster, the title and "Short film · production", the stage pipeline
 *  as pills, the save state, Screen it), the studio line when generation cannot run, then the room: the outline (280)
 *  on the start side — story → scenes → shots → final cut, the hierarchy you move through — and the page's own panes.
 *  Panels run edge to edge (a tool, not a lobby page); the outline folds into a shot switcher under 1280. */

const KIND_WORDS: Record<Production['kind'], string> = { SHORT: 'Short film', EPISODE: 'Episode', MUSIC_VIDEO: 'Music video' };

export function titleOf(p: Production) { return p.kind === 'MUSIC_VIDEO' ? (p.song?.title || p.title) : p.title; }

export function WorkspaceShell({ p, tab, shotId, gate, view, children }: { p: Production; tab: WorkspaceTab; shotId?: string; gate: StudioGate; view: 'map' | 'shot'; children: ReactNode }) {
  const { state, saving } = useStudio();
  const { decisions } = useShell();
  const pills = stagePills(p, decisions.items);
  const show = showById(state, p.showId); const season = seasonById(state, p.seasonId);
  const poster = assetById(state, p.posterAssetId) ?? assetById(state, p.framePosterAssetId) ?? assetById(state, show?.posterAssetId);
  const cut = currentCutVersion(p, state.assets);
  const kind = p.kind === 'EPISODE' && show ? `${show.title}${season ? ` · Season ${season.number}` : ''} · Episode ${p.episodeNumber ?? ''}` : KIND_WORDS[p.kind];
  const posterRatio = p.kind === 'MUSIC_VIDEO' ? '1/1' : '2/3';
  return (
    <div className="ws" data-view={view}>
      <Room value="cutting" />
      <header className="ws-bar">
        <Link className="btn btn-quiet btn-sm btn-icon" href={productionHref(p)} aria-label={`Back to the page of ${titleOf(p)}`} title="Back to the film’s page"><IconChevronLeft aria-hidden /></Link>
        <span className="ws-bar-thumb" data-shape={posterRatio === '1/1' ? 'square' : 'poster'} aria-hidden>
          <Frame asset={poster} ratio={posterRatio} fit="cover" alt="" radius="none" decorative art={artVars(poster)} title={titleOf(p)} priority />
        </span>
        <div className="ws-bar-title">
          <span className="ws-bar-name name"><bdi lang={p.language === 'AR' ? 'ar' : undefined}>{titleOf(p)}</bdi></span>
          <span className="ws-bar-kind">{kind} · production</span>
        </div>
        <nav className="ws-pipe" aria-label="Stages">
          {pills.map((x) => (
            <Link key={x.tab} href={x.href} className="chip ws-pill" data-state={x.state} aria-current={x.tab === tab && view === 'map' ? 'true' : undefined} scroll={false}>
              {x.state === 'done' && <IconCheck className="ws-pill-check" aria-hidden />}
              {x.state === 'waiting' && <span className="ws-pill-wait" aria-hidden />}
              {x.label}
              {x.state === 'waiting' && <span className="sr-only"> (waits for your approval)</span>}
              {x.state === 'done' && <span className="sr-only"> (done)</span>}
            </Link>
          ))}
        </nav>
        <span className="ws-bar-end">
          <SaveWord state={saving} className="ws-save" />
          {cut && <Link className="btn btn-secondary btn-sm" href={`/screening?p=${encodeURIComponent(p.id)}`}><IconPlay aria-hidden />Screen it</Link>}
        </span>
      </header>
      <StudioLine gate={gate} />
      <div className="ws-room" data-view={view}>
        <Outline p={p} shotId={shotId} tab={tab} view={view} />
        {children}
      </div>
    </div>
  );
}

/** THE OUTLINE (§5.19): Story at the top (the script's state), the scenes containing their shots with state marks
 *  (● selected take · ◐ running · ○ no take · failed), the scene rows showing selected/total, the final cut at the
 *  bottom. Scenes collapse. Under 1280 it is a shot switcher (ShotSwitcher). */
function Outline({ p, shotId, tab, view }: { p: Production; shotId?: string; tab: WorkspaceTab; view: 'map' | 'shot' }) {
  const { state, jobs } = useStudio();
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const ratio = frameRatioOf(p);
  const lines = p.scenes.reduce((a, sc) => a + sc.beats.reduce((b, bt) => b + bt.lines.length, 0), 0);
  const storyTab: WorkspaceTab = p.kind === 'MUSIC_VIDEO' ? 'song' : 'story';
  const cut = currentCutVersion(p, state.assets);
  const scriptWords = p.scenes.length === 0 ? 'Not written yet' : `${p.scenes.length} ${p.scenes.length === 1 ? 'scene' : 'scenes'} · ${lines} ${lines === 1 ? 'line' : 'lines'}`;
  return (
    <aside className="ws-outline" aria-label="Story, scenes and shots">
      <div className="ws-panel-head"><h2 className="ws-panel-title">Outline</h2><span className="ws-panel-count">{p.shots.length} shots</span></div>
      <div className="ws-outline-body">
        <Link className="ws-ol-row ws-ol-story" href={workspaceHref(p, storyTab)} aria-current={view === 'map' && tab === storyTab ? 'page' : undefined}>
          <IconStory className="ws-ol-icon" aria-hidden />
          <span className="ws-ol-words"><span className="ws-ol-name">{p.kind === 'MUSIC_VIDEO' ? 'Song and story' : 'Script'}</span><span className="ws-ol-meta">{scriptWords}</span></span>
        </Link>
        {p.scenes.map((sc) => {
          const shots = orderedShots(p).filter((sh) => sh.sceneId === sc.id);
          const chosen = shots.filter((sh) => sh.selectedTakeId).length;
          const open = !closed.has(sc.id);
          const states = shots.map((sh) => shotState(p, sh, jobs, assetById(state, sh.openingFrameAssetId)));
          const tone = states.some((s) => s.kind === 'failed') ? 'failed' : states.some((s) => s.kind === 'running') ? 'running' : shots.length > 0 && chosen === shots.length ? 'done' : states.some((s) => s.tone === 'waiting') ? 'waiting' : 'idle';
          return (
            <div key={sc.id} className="ws-ol-scene">
              <button type="button" className="ws-ol-row ws-ol-scenehead" aria-expanded={open} onClick={() => setClosed((c) => { const n = new Set(c); if (n.has(sc.id)) n.delete(sc.id); else n.add(sc.id); return n; })}>
                <IconChevronDown className="ws-ol-caret" data-open={open || undefined} aria-hidden />
                <span className="state-dot" data-tone={tone} aria-hidden />
                <span className="ws-ol-name name"><span className="ws-ol-no">{sc.number}</span> · <bdi>{sc.title}</bdi></span>
                <span className="ws-ol-count" aria-label={`${chosen} of ${shots.length} shots have a selected take`}>{chosen}/{shots.length}</span>
              </button>
              {open && (
                <ul className="ws-ol-shots" role="list">
                  {shots.map((sh, i) => {
                    const st = states[i];
                    const take = sh.takes.find((t) => t.id === sh.selectedTakeId);
                    const pic = assetById(state, take?.thumbnailAssetId) ?? assetById(state, sh.openingFrameAssetId);
                    return (
                      <li key={sh.id}>
                        <Link className="ws-ol-row ws-ol-shot" href={shotHref(p, sh.id)} aria-current={sh.id === shotId ? 'page' : undefined}>
                          <span className="ws-ol-no">{shotLabel(p, sh)}</span>
                          <span className="ws-ol-thumb" data-ratio={ratio}><Frame asset={pic} ratio={ratio} fit="cover" alt="" radius="none" decorative art={artVars(pic)} title={shotLabel(p, sh)} titleState="notDrawn" /></span>
                          <span className="ws-ol-words"><span className="ws-ol-name">{vocab(sh.framing)} · {vocab(sh.cameraMove).toLowerCase()}</span><span className="ws-ol-meta" dir="auto">{sh.purpose || sh.action || 'No purpose written'}</span></span>
                          <span className="ws-ol-mark" data-kind={st.kind} title={st.words}><span className="sr-only">{st.words}</span></span>
                        </Link>
                      </li>
                    );
                  })}
                  {shots.length === 0 && <li className="ws-ol-empty">No shots planned</li>}
                </ul>
              )}
            </div>
          );
        })}
        <Link className="ws-ol-row ws-ol-final" href={workspaceHref(p, 'final')} aria-current={view === 'map' && tab === 'final' ? 'page' : undefined}>
          <IconFinalCut className="ws-ol-icon" aria-hidden />
          <span className="ws-ol-words"><span className="ws-ol-name">Final cut</span><span className="ws-ol-meta">{cut ? `Cut ${cut.version}${(p.exports?.length ?? 0) > 0 ? ' · exported' : ''}` : 'Not assembled yet'}</span></span>
        </Link>
      </div>
      {view === 'shot' && <p className="ws-ol-keys"><span className="kbd">[</span><span className="kbd">]</span>previous and next shot</p>}
    </aside>
  );
}
