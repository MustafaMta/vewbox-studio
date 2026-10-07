'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Production, Shot } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { artVars } from '@/studio/presentation';
import { assetById, needsTake, shotHref, shotLabel } from '@/studio/selectors';
import { useToast } from '@/components/ui/toast';
import { Button, Segmented, StateWord } from '@/components/ui/kit';
import { Frame } from '@/components/media/Frame';
import { displaySrc } from '@/components/home/model';
import { IconCheck, IconFrame, IconProduce, IconTake, IconVoice } from '@/components/ui/icons';
import { useGate } from '../Decide';
import { ContinuityLogPanel } from '../ContinuityLog';
import { GenButton, type StudioGate } from '../gate';
import { canUseTake, frameRatioOf, orderedShots, shotState, vocab, workspaceHref } from '../model';

/** PRODUCE — every shot with its frame and its takes, and the one choice that matters: which take goes into the cut.
 *  The passes over the whole film (produce every shot, re-record the speaking shots, record the dialogue) start here;
 *  one shot's work happens in its own workspace. */
export function ProduceTab({ p, gate }: { p: Production; gate: StudioGate }) {
  const { state, act, jobs } = useStudio();
  const toast = useToast();
  const [filter, setFilter] = useState<'all' | 'open' | 'chosen'>('all');
  const shots = orderedShots(p).filter((s) => filter === 'all' || (filter === 'chosen' ? !needsTake(s) : needsTake(s)));
  const chosen = p.shots.filter((s) => !needsTake(s)).length;
  const open = p.shots.length - chosen;
  const lines = p.shots.reduce((a, sh) => a + sh.dialogue.length, 0);
  const voiced = p.shots.reduce((a, sh) => a + sh.dialogue.filter((d) => d.audioAssetId).length, 0);
  // speaking shots whose chosen take never proved its words against the script (older takes, or a failing check)
  const unverified = p.shots.filter((sh) => { const t = sh.takes.find((x) => x.id === sh.selectedTakeId); const c = t?.qa?.checks.find((x) => x.name === 'script-spoken'); return sh.dialogue.length > 0 && (!t || t.provider === 'SAMPLE' || !c || !c.ok); }).length;
  const storyApproved = useGate(p, 'STORY').approved;
  const notStory = storyApproved === false ? 'The story waits for your approval.' : null;
  const ratio = frameRatioOf(p);
  const select = (sh: Shot, id: string) => { try { act('selectTake', p.id, sh.id, id); toast.ok('Take selected for the cut.'); } catch (e) { toast.bad((e as Error).message); } };

  return (
    <div className="ws-main ws-produce">
      <div className="ws-pane-head">
        <h1 className="t-section">Produce</h1>
        <span className="ws-pane-state"><StateWord tone={open === 0 && p.shots.length ? 'done' : 'idle'}>{chosen} of {p.shots.length} shots have a selected take</StateWord></span>
      </div>
      {p.shots.length === 0 ? <p className="t-body ws-empty">No shots yet. <Link className="ws-textlink" href={workspaceHref(p, 'storyboard')}>Plan them on the storyboard</Link>.</p> : (
        <>
          <div className="ws-gen-row">
            <GenButton gate={gate} engine="video" type="PRODUCE" payload={{ productionId: p.id }} target={{ productionId: p.id }} variant="primary" icon={<IconProduce aria-hidden />} disabled={open === 0 || Boolean(notStory)} reason={notStory ?? 'Every shot has a selected take.'}>Produce every shot</GenButton>
            {lines > 0 && p.kind !== 'MUSIC_VIDEO' && unverified > 0 && <GenButton gate={gate} engine="video" type="PRODUCE" payload={{ productionId: p.id, respeak: true }} target={{ productionId: p.id }} disabled={Boolean(notStory)} reason={notStory}>Re-record the speaking shots · {unverified}</GenButton>}
            {lines > 0 && p.kind !== 'MUSIC_VIDEO' && <GenButton gate={gate} engine="voice" type="DIALOGUE_AUDIO" payload={{ productionId: p.id, force: voiced === lines }} target={{ productionId: p.id }} icon={<IconVoice aria-hidden />}>Record the dialogue · {voiced} of {lines}</GenButton>}
          </div>
          <Segmented label="Show" value={filter} onChange={setFilter} className="ws-filter" options={[{ value: 'all', label: `All · ${p.shots.length}` }, { value: 'open', label: `To choose · ${open}` }, { value: 'chosen', label: `Selected · ${chosen}` }]} />
          {p.shots.some((s) => s.takes.some((t) => t.provider === 'SAMPLE')) && <p className="t-meta">Takes marked as samples are bundled example clips; they show the flow, not this film.</p>}
          <ol className="ws-prod-list" role="list">
            {shots.map((sh) => {
              const st = shotState(p, sh, jobs, assetById(state, sh.openingFrameAssetId));
              return (
                <li key={sh.id} className="ws-prod-row">
                  <div className="ws-prod-head">
                    <Link className="ws-prod-name" href={shotHref(p, sh.id)}><span className="ws-ro">{shotLabel(p, sh)}</span><span className="name"><bdi>{sh.purpose || sh.action || vocab(sh.framing)}</bdi></span></Link>
                    <span className="t-meta">{vocab(sh.framing)} · {vocab(sh.cameraMove).toLowerCase()} · {sh.durationSeconds} s</span>
                    <StateWord tone={st.tone}>{st.words}</StateWord>
                  </div>
                  <ul className="ws-takes-mini" role="radiogroup" aria-label={`Shot ${shotLabel(p, sh)}: takes`} data-ratio={ratio}>
                    {sh.takes.map((t, i) => {
                      const on = sh.selectedTakeId === t.id;
                      const pic = assetById(state, t.thumbnailAssetId) ?? assetById(state, sh.openingFrameAssetId);
                      return (
                        <li key={t.id}>
                          <button type="button" role="radio" aria-checked={on} className="ws-take-mini" disabled={!canUseTake(t)} onClick={() => { if (!on) select(sh, t.id); }} aria-label={`Take ${i + 1}${on ? ', selected' : canUseTake(t) ? ', use this take' : ', rejected'}`}>
                            <Frame asset={pic} src={displaySrc(pic)} ratio={ratio} fit="cover" alt="" radius="none" decorative art={artVars(pic)} title={`Take ${i + 1}`} titleState="notDrawn" />
                            {on && <span className="ws-take-check" aria-hidden><IconCheck /></span>}
                          </button>
                          <span className="ws-take-mini-n">Take {i + 1}</span>
                        </li>
                      );
                    })}
                    {sh.takes.length === 0 && <li className="t-meta ws-takes-none">No takes yet</li>}
                  </ul>
                  <div className="ws-prod-acts">
                    <GenButton gate={gate} engine="images" type="SHOT_FRAMES" payload={{ productionId: p.id, shotId: sh.id }} target={{ productionId: p.id, shotId: sh.id }} icon={<IconFrame aria-hidden />} variant="quiet" compact>{sh.openingFrameAssetId ? 'Draw the frames again' : 'Draw the frames'}</GenButton>
                    <GenButton gate={gate} engine="video" type="GENERATE_TAKE" payload={{ productionId: p.id, shotId: sh.id }} target={{ productionId: p.id, shotId: sh.id }} icon={<IconTake aria-hidden />} compact>{sh.takes.length ? 'New take' : 'Film the first take'}</GenButton>
                    <Link className="btn btn-quiet btn-sm" href={shotHref(p, sh.id)}>Open the shot</Link>
                  </div>
                </li>
              );
            })}
          </ol>
          {chosen === p.shots.length && p.stage === 'PRODUCE' && <div className="ws-gen-row"><Button onClick={() => { act('markStepDone', p.id, 'PRODUCE'); toast.ok('Saved.'); }}>Mark producing done</Button></div>}
          <ContinuityLogPanel p={p} />
        </>
      )}
    </div>
  );
}
