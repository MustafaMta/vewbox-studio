'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { Production } from '@/domain/types';
import { continuityLog, type ContinuityLogEntry, type LogFlag, type LogFlagKind } from '@/domain/continuity-log';
import { useStudio } from '@/studio/store';
import { shotHref, shotLabel } from '@/studio/selectors';
import { useToast } from '@/components/ui/toast';
import { Button, SectionHead, Segmented, StateWord } from '@/components/ui/kit';
import { BOUNDARY_WORDS, vocab } from './model';

/** THE CONTINUITY LOG (the script supervisor's record; src/domain/continuity-log.ts — the same pure function the API
 *  GET /api/productions/:id/continuity-log serves, computed here from the studio the page holds). Per shot in cut order:
 *  what is established at its end, what changed against the shot before and what explains it, and the flags — a
 *  crossed line, a prop gone from a hand, light or time changing inside a scene, a continuous shot without an end
 *  pose, the chosen take's checks to review. A flag is never hidden: the producer may accept it as intended (it stays
 *  in the log, marked), and the shot's own page is where it is fixed. */

const KIND: Record<LogFlagKind, string> = {
  SIDES_SWAPPED: 'Sides swapped', FACING_FLIPPED: 'Facing flipped', TRAVEL_REVERSED: 'Travel reversed', HOLDING_DROPPED: 'Prop gone from a hand',
  PROP_CHANGED: 'Prop changed', WARDROBE_CHANGED: 'Wardrobe changed', LIGHT_CHANGED: 'Light changed', TIME_CHANGED: 'Time of day jumped',
  POSE_GAP: 'No end pose before a continuous shot', TAKE_REVIEW: 'The chosen take has checks to review',
};
const SIDE: Record<string, string> = { LEFT: 'left of frame', CENTER: 'centre of frame', RIGHT: 'right of frame' };

export function ContinuityLogPanel({ p }: { p: Production }) {
  const { state, act } = useStudio();
  const toast = useToast();
  const log = useMemo(() => continuityLog(state, p), [state, p]);
  const [show, setShow] = useState<'open' | 'all'>('open');
  const name = (id: string) => state.characters.find((c) => c.id === id)?.name ?? id;
  const accept = (e: ContinuityLogEntry, f: LogFlag) => {
    const sh = p.shots.find((x) => x.id === e.shotId);
    if (!sh) return;
    const base = sh.continuity ?? { version: 0, characters: [], props: [], environment: {}, camera: {} };
    const { version: _v, ...rest } = base;
    try { act('setShotContinuity', p.id, sh.id, { ...rest, acknowledged: [...new Set([...(base.acknowledged ?? []), f.key])] }); toast.ok('Accepted as intended. It stays in the log, marked.'); }
    catch (err) { toast.bad((err as Error).message); }
  };
  const entries = show === 'open' ? log.entries.filter((e) => e.flags.some((f) => !f.acknowledged)) : log.entries;
  const flagged = log.entries.reduce((a, e) => a + e.flags.length, 0);
  return (
    <section className="ws-sec ws-clog" aria-labelledby="ws-clog-h">
      <SectionHead id="ws-clog-h" title="Continuity log" count={log.open || null} description={log.open ? `${log.open} ${log.open === 1 ? 'flag waits' : 'flags wait'} for a look: fix it on the shot, or accept it as intended.` : flagged ? 'Every flag is accepted as intended; they stay listed under All shots.' : 'Nothing breaks continuity between the shots as they are written and filmed.'} />
      <Segmented label="Show" value={show} onChange={setShow} className="ws-filter" options={[{ value: 'open', label: `Open flags · ${log.open}` }, { value: 'all', label: `All shots · ${log.entries.length}` }]} />
      {entries.length === 0 ? <p className="t-body ws-empty">{show === 'open' ? 'No open flag.' : 'No shots yet.'}</p> : (
        <ol className="ws-clog-list" role="list">
          {entries.map((e) => {
            const sh = p.shots.find((x) => x.id === e.shotId);
            const est = e.established;
            return (
              <li key={e.shotId} className="card ws-clog-entry">
                <div className="ws-clog-head">
                  {sh ? <Link className="ws-prod-name" href={shotHref(p, sh.id)}><span className="ws-ro">{shotLabel(p, sh)}</span><span className="name"><bdi>{sh.purpose || sh.action || vocab(sh.framing)}</bdi></span></Link> : <span className="ws-ro">{e.sceneNumber}.{e.shotNumber}</span>}
                  <span className="t-meta">{BOUNDARY_WORDS[e.boundary]?.label ?? e.boundary}{e.take ? ` · chosen take ${e.take.decision === 'ACCEPT' ? 'passed' : e.take.decision === 'REVIEW' ? 'to review' : 'rejected'}` : ' · no chosen take'}</span>
                </div>
                {e.flags.length > 0 && (
                  <ul className="ws-files" role="list" aria-label={`Shot ${e.sceneNumber}.${e.shotNumber}: flags`}>
                    {e.flags.map((f) => (
                      <li key={f.key} data-acknowledged={f.acknowledged || undefined}>
                        <span className="ws-file-words"><span className="ws-file-name">{KIND[f.kind] ?? f.kind}</span><span className="t-meta" dir="auto">{f.detail}</span></span>
                        {f.acknowledged ? <StateWord tone="idle">Accepted as intended</StateWord> : <span className="ws-clog-acts"><StateWord tone="waiting">Open</StateWord><Button size="sm" variant="quiet" onClick={() => accept(e, f)}>Accept as intended</Button></span>}
                      </li>
                    ))}
                  </ul>
                )}
                {e.changes.length > 0 && (
                  <ul className="ws-clog-changes t-meta" role="list" aria-label="Changes against the shot before">
                    {e.changes.map((c, i) => <li key={i} dir="auto">{c.what}: {c.from ?? '—'} → {c.to ?? '—'}{c.explainedBy ? ` (${c.explainedBy})` : ' (unexplained)'}</li>)}
                  </ul>
                )}
                <dl className="ws-dl ws-clog-est">
                  {est.people.map((x) => <div key={x.characterId}><dt className="t-label"><bdi>{name(x.characterId)}</bdi></dt><dd dir="auto">{[x.side ? SIDE[x.side] : null, x.facing ? `facing ${x.facing.toLowerCase()}` : null, x.holding?.length ? `holds ${x.holding.join(', ')}` : null, x.wardrobe, x.condition.join('; ') || null, x.endPose ? `ends: ${x.endPose}` : null].filter(Boolean).join(' · ') || 'Nothing recorded'}</dd></div>)}
                  {est.props.length > 0 && <div><dt className="t-label">Props</dt><dd dir="auto">{est.props.map((x) => `${x.name}${x.state ? ` (${x.state})` : ''}`).join('; ')}</dd></div>}
                  <div><dt className="t-label">Time and light</dt><dd dir="auto">{[est.timeOfDay ? vocab(est.timeOfDay) : null, est.lighting, est.weather].filter(Boolean).join(' · ') || 'Not set'}</dd></div>
                </dl>
              </li>
            );
          })}
        </ol>
      )}
      <p className="t-meta ws-clog-hash">Log {log.hash}</p>
    </section>
  );
}
