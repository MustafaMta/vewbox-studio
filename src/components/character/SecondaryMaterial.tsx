'use client';

import type { Character } from '@/domain/types';
import { isActiveStatus } from '@/domain/jobs';
import { useStudio } from '@/studio/store';
import { artVars } from '@/studio/presentation';
import { Button, StateWord } from '@/components/ui/kit';
import { useStartJob } from '@/components/ui/jobs';
import { IconGenerate } from '@/components/ui/icons';
import { Frame } from '@/components/media/Frame';
import { materialByTier, secondaryJobs } from './identity';
import { SECONDARY_KINDS, secondaryPayload, type SecondaryKind } from './contract';
import { CardHead, CastSection } from './parts';

const GROUP: Array<{ key: 'portrait' | 'expressions' | 'outfits' | 'earlier'; title: string; kind?: SecondaryKind; draw?: string }> = [
  { key: 'portrait', title: 'Close-up portrait' },
  { key: 'expressions', title: 'Expressions', kind: 'EXPRESSION', draw: 'Draw expressions' },
  { key: 'outfits', title: 'Outfits', kind: 'OUTFIT', draw: 'Draw an outfit' },
  { key: 'earlier', title: 'Earlier views' },
];

/** MORE PICTURES — optional material (an older close-up portrait, expressions, outfits, views from before the
 *  canonical figure), collapsed at the end of the profile and never the identity. Present when something exists or is
 *  being made, or — while the look may still change and the canonical figure exists — when it can be requested. Raw
 *  outputs never appear. */
export function SecondaryMaterial({ c, locked }: { c: Character; locked: boolean }) {
  const { state, jobs } = useStudio();
  const m = materialByTier(c, state.assets);
  const running = SECONDARY_KINDS.flatMap((k) => secondaryJobs(c.id, k, jobs).filter((j) => isActiveStatus(j.status)).map((j) => ({ kind: k, job: j })));
  const canRequest = !locked && Boolean(c.canonicalImage);
  if (m.secondaryCount === 0 && running.length === 0 && !canRequest) return null;
  return (
    <CastSection id="more" title="More pictures" count={m.secondaryCount || undefined} description="Optional pictures made on request. They never replace the figure.">
      <details className="details char-details">
        <summary>{m.secondaryCount ? `Show ${m.secondaryCount === 1 ? 'the picture' : `all ${m.secondaryCount}`}` : 'Request expressions or outfits'}</summary>
        <div className="char-stack char-voice">
          {GROUP.map((g) => {
            const items = m.secondary[g.key];
            const live = running.filter((r) => r.kind === g.kind);
            if (items.length === 0 && live.length === 0 && !(canRequest && g.kind)) return null;
            return (
              <div key={g.key}>
                <CardHead title={g.title} count={items.length || undefined} action={live.length > 0 ? <StateWord tone="running">{live[0].job.progress?.message || 'Drawing'}</StateWord> : canRequest && g.kind && g.draw ? <DrawSecondary c={c} kind={g.kind} label={g.draw} /> : undefined} />
                {items.length > 0
                  ? <ul className="char-secondary" role="list">{items.map((a) => <li key={a.id}><Frame asset={a} ratio="1/1" fit="cover" alt={`${c.name}, ${g.title.toLowerCase()}`} art={artVars(a)} title={c.name} /></li>)}</ul>
                  : <p className="t-body char-card-line">None yet.</p>}
              </div>
            );
          })}
        </div>
      </details>
    </CastSection>
  );
}

function DrawSecondary({ c, kind, label }: { c: Character; kind: SecondaryKind; label: string }) {
  const { start, busy } = useStartJob();
  return <Button size="sm" variant="secondary" icon={<IconGenerate />} loading={busy} onClick={() => void start('CHARACTER_REFS', secondaryPayload(c.id, [kind]), { quiet: true })}>{label}</Button>;
}
