'use client';

import type { Asset, Character } from '@/domain/types';
import { isActiveStatus } from '@/domain/jobs';
import { useStudio } from '@/studio/store';
import { T } from '@/lib/copy';
import { Button, Details, Status } from '@/components/ui/kit';
import { useStartJob } from '@/components/ui/jobs';
import { IconGenerate } from '@/components/ui/icons';
import type { Key } from '@/lib/copy';
import { CharacterImage } from './CharacterImage';
import { materialByTier, secondaryJobs } from './identity';
import { SECONDARY_KINDS, secondaryPayload, type SecondaryKind } from './contract';

const GROUP: Array<{ key: 'portrait' | 'expressions' | 'outfits' | 'earlier'; title: Key; kind?: SecondaryKind }> = [
  { key: 'portrait', title: 'cast.secondary.portrait' },
  { key: 'expressions', title: 'cast.secondary.expressions', kind: 'EXPRESSION' },
  { key: 'outfits', title: 'cast.secondary.outfits', kind: 'OUTFIT' },
  { key: 'earlier', title: 'cast.secondary.earlier' },
];
const DRAW_KEY: Record<SecondaryKind, Key> = { EXPRESSION: 'cast.secondary.drawExpressions', OUTFIT: 'cast.secondary.drawOutfit' };

/** SECONDARY MATERIAL — optional pictures (an older close-up portrait, expressions, outfits, views from before the
 *  canonical image), collapsed at the end of the profile and never the identity. Present when something exists or
 *  is being made, or — while the look may still change and the canonical image exists — when it can be requested.
 *  Raw outputs never appear. */
export function SecondaryMaterial({ c, locked }: { c: Character; locked: boolean }) {
  const { state, jobs } = useStudio();
  const m = materialByTier(c, state.assets);
  const running = SECONDARY_KINDS.flatMap((k) => secondaryJobs(c.id, k, jobs).filter((j) => isActiveStatus(j.status)).map((j) => ({ kind: k, job: j })));
  const canRequest = !locked && Boolean(c.canonicalImage);
  if (m.secondaryCount === 0 && running.length === 0 && !canRequest) return null;
  return (
    <section aria-label={T('cast.secondary.title')}>
      <Details summary={<>{T('cast.secondary.title')}{m.secondaryCount > 0 && <span className="num ms-1 text-faint">{m.secondaryCount}</span>}</>}>
        <p className="max-w-[64ch] text-[13px] leading-5 text-faint">{T('cast.secondary.lead')}</p>
        <div className="mt-5 space-y-8">
          {GROUP.map((g) => {
            const items = m.secondary[g.key];
            const live = running.filter((r) => r.kind === g.kind);
            if (items.length === 0 && live.length === 0 && !(canRequest && g.kind)) return null;
            return (
              <div key={g.key}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="h3">{T(g.title)}{items.length > 0 && <span className="num ms-2 text-[13px] font-medium text-faint">{items.length}</span>}</h3>
                  {live.length > 0 ? <Status tone="info" live>{live[0].job.progress?.message || T('jobs.inProgress')}</Status> : canRequest && g.kind && <DrawSecondary c={c} kind={g.kind} />}
                </div>
                {items.length > 0 ? <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">{items.map((a) => <Tile key={a.id} a={a} name={c.name} label={T(g.title)} />)}</ul> : <p className="mt-1 text-[13px] text-faint">{T('cast.secondary.none')}</p>}
              </div>
            );
          })}
        </div>
      </Details>
    </section>
  );
}

function Tile({ a, name, label }: { a: Asset; name: string; label: string }) {
  return <li><CharacterImage src={a.src} kind="PORTRAIT" name={name} ratio={4 / 5} unavailable={a.unavailable} alt={`${name} — ${label}`} /></li>;
}

function DrawSecondary({ c, kind }: { c: Character; kind: SecondaryKind }) {
  const { start, busy } = useStartJob();
  return <Button size="sm" variant="quiet" icon={<IconGenerate />} loading={busy} onClick={() => void start('CHARACTER_REFS', secondaryPayload(c.id, [kind]), { quiet: true })}>{T(DRAW_KEY[kind])}</Button>;
}
