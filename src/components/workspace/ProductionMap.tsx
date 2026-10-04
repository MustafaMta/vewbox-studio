'use client';

import Link from 'next/link';
import { Fragment, useMemo } from 'react';
import type { Production } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { useShell } from '@/components/shell/context';
import { artVars } from '@/studio/presentation';
import { assetById, locationById, shotHref, shotLabel } from '@/studio/selectors';
import { cutVersionsOf } from '@/studio/selectors/cuts';
import { decisionCard, displaySrc, runtime, shortWhen } from '@/components/home/model';
import { DecisionCard } from '@/components/media/Cards';
import { Frame } from '@/components/media/Frame';
import { SectionHead, StateWord } from '@/components/ui/kit';
import { ApprovalGate, RecentlyRemoved, StaleCut, useGate } from './Decide';
import { IconCheck, IconProduce } from '@/components/ui/icons';
import { GenButton, type StudioGate } from './gate';
import { RunningRow } from './Running';
import { ProductionDetails } from './ProductionDetails';
import { breakdownOf, decisionsOf, expectationWords, flowOf, frameRatioOf, leadOf, orderedShots, runningOf, shotState, vocab, workspaceHref } from './model';

/** THE PRODUCTION MAP (docs/DESIGN-SYSTEM-V5.md §8.10) — the production as one hierarchy you move through: where it
 *  stands in one sentence; the flow as one line of links (story → scenes → shots → takes → cut); the decisions that
 *  wait; what is on the floor with its real progress and Cancel; the story; the breakdown review (the gate before
 *  every shot is filmed); every scene with its shots as frames in their real ratio with their state; and the cut.
 *  No raw model parameters, job ids or logs: progress, review and recovery are words. */
export function ProductionMap({ p, gate }: { p: Production; gate: StudioGate }) {
  const { state, jobs } = useStudio();
  const { decisions } = useShell();
  const cuts = useMemo(() => cutVersionsOf(p, state.assets), [p, state.assets]);
  const flow = flowOf(p, state.assets);
  const lastExport = [...(p.exports ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const lead = leadOf(p, flow, cuts, lastExport?.createdAt);
  const waiting = decisionsOf(p, decisions.items);
  const running = runningOf(p, jobs);
  const storyApproved = useGate(p, 'STORY').approved;
  const bd = breakdownOf(p);
  const allSelected = p.shots.length > 0 && p.shots.every((sh) => { const t = sh.takes.find((x) => x.id === sh.selectedTakeId); return t && t.provider !== 'SAMPLE'; });
  const ratio = frameRatioOf(p);
  const storyTab = p.kind === 'MUSIC_VIDEO' ? 'visual' : 'story';
  const music = p.kind === 'MUSIC_VIDEO';

  return (
    <div className="ws-main ws-map">
      <h1 className="sr-only">The production map of {p.title}</h1>
      <p className="ws-lead"><span className="state-dot" data-tone={lead.tone} aria-hidden />{lead.words}</p>
      <nav className="ws-flow" aria-label="The production, from story to cut">
        <Link href={workspaceHref(p, storyTab)}>{flow.scriptApproved && <IconCheck aria-hidden />}{flow.scriptApproved ? 'Story: the approved script' : p.scenes.length ? 'Story: the script in progress' : 'Story: not written yet'}</Link>
        <span className="ws-flow-arr" aria-hidden>→</span>
        <Link href={workspaceHref(p, 'map', 'scenes')}>{flow.scenes} {flow.scenes === 1 ? 'scene' : 'scenes'}</Link>
        <span className="ws-flow-arr" aria-hidden>→</span>
        <Link href={workspaceHref(p, 'map', 'scenes')}>{flow.shots} {flow.shots === 1 ? 'shot' : 'shots'}</Link>
        <span className="ws-flow-arr" aria-hidden>→</span>
        <Link href={workspaceHref(p, 'produce')}>{flow.takes} {flow.takes === 1 ? 'take' : 'takes'}, {flow.selected} selected</Link>
        <span className="ws-flow-arr" aria-hidden>→</span>
        <Link href={workspaceHref(p, 'final')}>{flow.cutVersion ? `Final cut ${flow.cutVersion}` : 'No cut yet'}</Link>
      </nav>

      <section className="ws-sec" aria-labelledby="ws-wait-h" id="waiting">
        <SectionHead id="ws-wait-h" title="Waiting for you" count={waiting.length || null} countTone="wait" link={waiting.length ? { href: '/production#needs-you', label: 'All decisions', short: 'All' } : undefined} />
        {waiting.length === 0 ? <p className="t-body ws-empty">Nothing in this production waits for you.</p> : (
          <ul className="ws-decisions" role="list">
            {waiting.map((d) => {
              const c = decisionCard(d, state);
              return <li key={d.id}><DecisionCard href={c.href} kind={c.kindLabel} title={c.heading} description={c.body} verb={c.action} chip={c.chip} asset={c.picture?.asset} src={c.picture?.src} figure={c.picture?.figure} /></li>;
            })}
          </ul>
        )}
      </section>

      <section className="ws-sec" aria-labelledby="ws-floor-h" id="on-the-floor">
        <SectionHead id="ws-floor-h" title="On the floor" count={running.length || null} />
        {running.length === 0
          ? <p className="t-body ws-empty">{gate.paused ? 'Nothing is being made: the studio is paused.' : 'Nothing is being made for this production right now.'}</p>
          : <div className="ws-runs">{running.map((j) => <RunningRow key={j.id} job={j} p={p} expect={j.type === 'GENERATE_TAKE' ? expectationWords(p, j.shotId) : null} />)}</div>}
      </section>

      <section className="ws-sec" aria-labelledby="ws-story-h" id="story">
        <SectionHead id="ws-story-h" title="Story" link={{ href: workspaceHref(p, storyTab), label: music ? 'Open the visual story' : 'Open the script', short: 'Open' }} />
        <div className="ws-story">
          {p.logline ? <p className="t-lead ws-logline" dir="auto">{p.logline}</p> : <p className="t-body ws-empty">No logline yet.</p>}
          <ul className="ws-story-facts" role="list">
            <li className="t-meta">{flow.scenes} {flow.scenes === 1 ? 'scene' : 'scenes'} · {flow.scriptLines} {flow.scriptLines === 1 ? 'line' : 'lines'} of dialogue</li>
            {(p.genre || p.mood) && <li className="t-meta" dir="auto">{[p.genre, p.mood].filter(Boolean).join(' · ')}</li>}
          </ul>
        </div>
        {p.scenes.length > 0 && <ApprovalGate p={p} stage="STORY" what="story" />}
      </section>

      <section className="ws-sec" aria-labelledby="ws-bd-h" id="breakdown">
        <SectionHead id="ws-bd-h" title="Breakdown review" description="The gate before every shot is filmed: each scene’s shots, their length against the target, and their opening frames." />
        {bd.rows.length === 0 ? <p className="t-body ws-empty">No scenes yet: write the story first.</p> : (
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead><tr><th scope="col">Scene</th><th scope="col" className="ws-num">Shots</th><th scope="col" className="ws-num">Planned</th><th scope="col" className="ws-num">Opening frames</th><th scope="col">Ready</th></tr></thead>
              <tbody>
                {bd.rows.map((r) => (
                  <tr key={r.sceneId}><td><span className="name"><bdi>{r.label}</bdi></span></td><td className="ws-num">{r.shots}</td><td className="ws-num">{runtime(r.seconds) ?? '0:00'}</td><td className="ws-num">{r.framed} / {r.shots}</td><td>{r.ready ? <StateWord tone="done">Yes</StateWord> : <StateWord tone="idle">{r.shots === 0 ? 'No shots' : `${r.shots - r.framed} without a frame`}</StateWord>}</td></tr>
                ))}
              </tbody>
              <tfoot><tr><td>Total</td><td className="ws-num">{bd.total.shots}</td><td className="ws-num">{runtime(bd.total.seconds) ?? '0:00'} of {runtime(p.targetSeconds)}</td><td className="ws-num">{bd.total.framed} / {bd.total.shots}</td><td>{bd.total.ready ? <StateWord tone="done">Ready</StateWord> : <StateWord tone="idle">Not ready</StateWord>}</td></tr></tfoot>
            </table>
          </div>
        )}
        <div className="ws-gate-foot">
          <GenButton gate={gate} engine="video" type="PRODUCE" payload={{ productionId: p.id }} target={{ productionId: p.id }} icon={<IconProduce aria-hidden />}
            disabled={allSelected || p.shots.length === 0 || storyApproved === false} reason={allSelected ? null : p.shots.length === 0 ? 'Plan the shots first.' : 'The story waits for your approval.'}>Produce every shot</GenButton>
          {allSelected && <span className="t-meta">Done: every shot has a selected take. To redo one shot, open it.</span>}
        </div>
      </section>

      <section className="ws-sec" aria-labelledby="ws-sc-h" id="scenes">
        <SectionHead id="ws-sc-h" title="Scenes and shots" count={p.shots.length || null} link={{ href: workspaceHref(p, 'storyboard'), label: 'Open the storyboard', short: 'Storyboard' }} />
        {p.scenes.length === 0 ? <p className="t-body ws-empty">No scenes yet.</p> : p.scenes.map((sc) => {
          const shots = orderedShots(p).filter((sh) => sh.sceneId === sc.id);
          const loc = locationById(state, sc.locationId);
          return (
            <div key={sc.id} className="ws-scene" aria-labelledby={`ws-scene-${sc.id}`}>
              <div className="ws-scene-head">
                <h3 id={`ws-scene-${sc.id}`} className="t-title name"><bdi>{sc.number} · {sc.title}</bdi></h3>
                <span className="t-meta ws-slate"><span>{vocab(sc.timeOfDay).toLowerCase()}</span>{loc && <span><bdi>{loc.name}</bdi></span>}<span>{shots.length} {shots.length === 1 ? 'shot' : 'shots'}</span></span>
              </div>
              {shots.length === 0 ? <p className="t-body ws-empty">No shots planned in this scene.</p> : (
                <ul className="ws-strip" role="list" data-ratio={ratio}>
                  {shots.map((sh) => {
                    const st = shotState(p, sh, jobs);
                    const take = sh.takes.find((t) => t.id === sh.selectedTakeId);
                    const pic = assetById(state, take?.thumbnailAssetId) ?? assetById(state, sh.openingFrameAssetId);
                    return (
                      <li key={sh.id}>
                        <Link className="ws-shot" href={shotHref(p, sh.id)} aria-label={`Shot ${shotLabel(p, sh)}: ${sh.purpose || vocab(sh.framing)}. ${st.words}.`}>
                          <Frame asset={pic} src={displaySrc(pic)} ratio={ratio} fit="cover" alt="" decorative art={artVars(pic)} title={sh.purpose || `Shot ${shotLabel(p, sh)}`} titleState="notDrawn"
                            state={st.kind === 'running' ? 'drawing' : 'ready'} phase={st.kind === 'running' ? st.words : undefined} className="ws-shot-frame">
                            <span className="art-chip ws-ro">{shotLabel(p, sh)}</span>
                          </Frame>
                          <span className="ws-shot-name">{vocab(sh.framing)} · {vocab(sh.cameraMove).toLowerCase()} · {sh.durationSeconds} s</span>
                          <span className="ws-shot-purpose" dir="auto">{sh.purpose || sh.action || 'No purpose written'}</span>
                          <span className="ws-shot-state">
                            <span className="ws-pips" aria-hidden>{sh.takes.map((t) => <i key={t.id} data-on={t.id === sh.selectedTakeId || undefined} data-off={t.status === 'REJECTED' || t.rating === 'REJECTED' || undefined} />)}</span>
                            <StateWord tone={st.tone}>{st.words}</StateWord>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </section>

      <section className="ws-sec" aria-labelledby="ws-cut-h" id="cut">
        <SectionHead id="ws-cut-h" title="Final cut" link={{ href: workspaceHref(p, 'final'), label: 'Open the final cut', short: 'Open' }} />
        <StaleCut p={p} gate={gate} />
        <CutLine p={p} />
        {cuts.length === 0 ? <p className="t-body ws-empty">{flow.selected === p.shots.length && p.shots.length ? 'Every shot has a take: the cut can be assembled.' : 'The cut is assembled once every shot has a selected take.'}</p> : (
          <ol className="ws-versions" role="list">
            {[...cuts].reverse().map((c) => (
              <li key={c.assetId}>
                <span className="ws-versions-n">Cut {c.version}</span>
                <span className="ws-ro ws-versions-t">{shortWhen(c.createdAt)}</span>
                <span className="ws-versions-d">{c.current ? 'the current cut' : 'an earlier cut'} · {c.shots} {c.shots === 1 ? 'shot' : 'shots'}{c.durationSeconds ? ` · ${runtime(c.durationSeconds)}` : ''}{c.subtitleAssetIds.length ? ' · subtitles' : ''}</span>
                {c.current ? <StateWord tone="done">Current</StateWord> : <Link className="ws-textlink" href={`/screening?p=${encodeURIComponent(p.id)}`}>Screen</Link>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <RecentlyRemoved p={p} />
      <ProductionDetails p={p} />
    </div>
  );
}

/** The selected takes in film order as one strip, each as wide as its shot is long (the assembly the cut is made from).
 *  Always left to right: it is time. */
export function CutLine({ p }: { p: Production }) {
  const { state } = useStudio();
  const shots = orderedShots(p);
  if (shots.length === 0) return null;
  return (
    <ol className="ws-cutline" dir="ltr" aria-label="The cut, shot by shot" role="list">
      {shots.map((sh) => {
        const take = sh.takes.find((t) => t.id === sh.selectedTakeId);
        const pic = assetById(state, take?.thumbnailAssetId) ?? assetById(state, sh.openingFrameAssetId);
        return (
          <li key={sh.id} style={{ flexGrow: sh.durationSeconds }} data-missing={take ? undefined : ''}>
            <Link href={shotHref(p, sh.id)} aria-label={`Shot ${shotLabel(p, sh)}, ${sh.durationSeconds} seconds${take ? '' : ', no take selected'}`}>
              {pic && !pic.unavailable
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={displaySrc(pic)} alt="" loading="lazy" decoding="async" />
                : <Fragment />}
              <span className="ws-cutline-n">{shotLabel(p, sh)}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
