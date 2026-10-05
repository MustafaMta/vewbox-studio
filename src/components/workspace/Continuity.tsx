'use client';

import Link from 'next/link';
import type { Production, Shot } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { shotHref, shotLabel } from '@/studio/selectors';
import { useToast } from '@/components/ui/toast';
import { Button, SectionHead } from '@/components/ui/kit';
import { IconFinalCut, IconLocations } from '@/components/ui/icons';
import { GenButton, type StudioGate } from './gate';
import { RegenerateShot } from './Failed';
import { locationRefusalOf, staleShotsOf, type LocationRefusal, type StaleShot } from './model';

/** CONTINUITY IN THE WORKSPACE (the continuity and Location Bible batches): a chosen take whose continuation chain broke
 *  (its predecessor's chosen take changed), with one recovery — regenerate that shot — and, on the cut, "Assemble
 *  anyway" (the stale joins become hard cuts); and a shot refused because its place has no plate yet, which names both
 *  fixes: draw the place's plates, or mark the scene as the one that establishes it. */

const why = (s: StaleShot, p: Production) => s.because === 'UPSTREAM_STALE'
  ? `It continues shot ${s.previous ? shotLabel(p, s.previous) : 'before it'}, which is itself out of step; that one is regenerated first.`
  : `It continues a take of shot ${s.previous ? shotLabel(p, s.previous) : 'before it'} that is no longer the one in the cut${s.expected ? ` (now ${s.expected.label})` : ''}, so its first frames no longer match.`;

/** The shot workspace's notice when this shot's chosen take is out of step. */
export function StaleNotice({ p, shot, gate }: { p: Production; shot: Shot; gate: StudioGate }) {
  const s = staleShotsOf(p).find((x) => x.shot.id === shot.id);
  if (!s) return null;
  return (
    <div className="ws-gate" data-state="waiting" role="status" id="ws-stale">
      <span className="ws-gate-words">
        <span className="t-title">This take is out of step with the shot before it</span>
        <span className="t-body">{why(s, p)} Regenerate this shot to continue from the take now in the cut.</span>
      </span>
      <RegenerateShot p={p} shotId={shot.id} gate={gate} />
    </div>
  );
}

/** The map's list of out-of-step shots (absent when the chain is whole). */
export function StaleShots({ p, gate }: { p: Production; gate: StudioGate }) {
  const stale = staleShotsOf(p);
  if (stale.length === 0) return null;
  return (
    <section className="ws-sec" aria-labelledby="ws-stale-h" id="stale">
      <SectionHead id="ws-stale-h" title="Out of step" count={stale.length} description="Takes that continue a take no longer in the cut. Regenerate them in order, or assemble the cut anyway with hard cuts at those joins." />
      <ol className="ws-versions" role="list">
        {stale.map((s) => (
          <li key={s.shot.id} className="ws-failed-row">
            <Link className="ws-versions-n" href={shotHref(p, s.shot.id)}>Shot {shotLabel(p, s.shot)}</Link>
            <span className="ws-versions-d"><span className="state-dot" data-tone="waiting" aria-hidden /> {s.because === 'UPSTREAM_STALE' ? 'Waits for the shot before it' : `Continues a take no longer in the cut`}</span>
            <span className="ws-versions-t">{s.take.label}</span>
            <RegenerateShot p={p} shotId={s.shot.id} gate={gate} compact />
          </li>
        ))}
      </ol>
    </section>
  );
}

/** On the cut: the stale joins, and "Assemble anyway" (ASSEMBLE with allowStaleJoins; the joins become hard cuts). */
export function StaleJoins({ p, gate }: { p: Production; gate: StudioGate }) {
  const stale = staleShotsOf(p);
  if (stale.length === 0) return null;
  const labels = stale.map((s) => shotLabel(p, s.shot)).join(', ');
  return (
    <div className="ws-gate" data-state="waiting" role="status" id="ws-stale-joins">
      <span className="ws-gate-words">
        <span className="t-title">{stale.length === 1 ? 'One join is out of step' : `${stale.length} joins are out of step`}</span>
        <span className="t-body">Shot {labels} {stale.length === 1 ? 'continues a take' : 'continue takes'} no longer in the cut. The cut refuses {stale.length === 1 ? 'it' : 'them'} until {stale.length === 1 ? 'it is' : 'they are'} regenerated, or you assemble anyway with a hard cut at each.</span>
      </span>
      <GenButton gate={gate} type="ASSEMBLE" payload={{ productionId: p.id, allowStaleJoins: true }} target={{ productionId: p.id }} icon={<IconFinalCut aria-hidden />}>Assemble anyway</GenButton>
    </div>
  );
}

/** The refused (or about-to-be-refused) shot whose place has no plate: both fixes, named. */
export function LocationRefusalNotice({ p, refusal }: { p: Production; refusal: LocationRefusal }) {
  const { act } = useStudio();
  const toast = useToast();
  const scene = p.scenes.find((s) => s.id === refusal.sceneId);
  const establish = () => {
    if (!scene) return;
    try { act('updateScene', p.id, scene.id, { establishLocation: true }); toast.ok(`Scene ${scene.number} now establishes ${refusal.name ?? 'the place'}.`); } catch (e) { toast.bad((e as Error).message); }
  };
  return (
    <div className="ws-gate" data-state="failed" role="status" id="ws-unestablished">
      <span className="ws-gate-words">
        <span className="t-title">{refusal.predicted ? `${refusal.name ?? 'This place'} has no plate yet` : `Refused: ${refusal.name ?? 'the place'} has no plate yet`}</span>
        <span className="t-body">{refusal.predicted ? 'A take here would be refused: a place is filmed against its plate. ' : ''}Draw the place’s plates, or mark this scene as the one that establishes it: its first accepted take then becomes the place’s master plate.</span>
      </span>
      <span className="ws-actions">
        {refusal.locationId && <Link className="btn btn-secondary btn-sm" href={`/locations/${encodeURIComponent(refusal.locationId)}`}><IconLocations aria-hidden />Draw the location’s plates</Link>}
        {scene && <Button size="sm" onClick={establish}>Mark this scene as establishing it</Button>}
      </span>
    </div>
  );
}

/** The shot workspace's refusal notice (from the newest attempt, or predicted from the place's plates). */
export function ShotLocationRefusal({ p, shot }: { p: Production; shot: Shot }) {
  const { state, jobs } = useStudio();
  const r = locationRefusalOf(p, shot, jobs, state.locations, state.assets);
  return r ? <LocationRefusalNotice p={p} refusal={r} /> : null;
}
