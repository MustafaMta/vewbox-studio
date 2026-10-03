'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { cls } from '@/components/ui/kit';
import { PlayDisc } from '@/components/players/PlayDisc';
import type { Track } from '@/components/players/PlayerProvider';
import type { Picture } from './art';
import { FaceCircle } from './FaceCircle';

/** CAST (docs/DESIGN-SYSTEM-V4.md §5.8).
 *  CastGrid (Show › Cast, the Short Overview, Music video › Performers): an 88 px face (64 on a phone), the name 14/20
 *  600, the role 13/20 muted on one line, and an appearance line 12/16 faint ("in 6 episodes · S1–S2", "sings 3 of 8
 *  sections"). A 28 px voice disc overlaps the face at the bottom end, shown on hover and focus and always on touch.
 *  Groups *Leads* and *Supporting* only when the data distinguishes them (`leadIds`); otherwise one group, in the
 *  order given (by appearances). Six columns at 1440, four at 834, two at 390.
 *  CastRow (inline, in heroes and slates): 28 px faces with names, wrapping; "+3" opens the Cast tab. */

export interface CastMember {
  id: string;
  name: string;
  nameLang?: string;
  role?: ReactNode;
  appearance?: ReactNode;
  href?: string;
  asset?: Picture | null;
  src?: string | null;
  voice?: Track | null;
  ring?: 'speaking' | 'director';
}

function Cell({ m }: { m: CastMember }) {
  const body = (
    <>
      <FaceCircle name={m.name} asset={m.asset} src={m.src} size={88} lang={m.nameLang} ring={m.ring} decorative />
      <span className="cast-name" dir="auto" lang={m.nameLang}>{m.name}</span>
      {m.role && <span className="cast-role" dir="auto">{m.role}</span>}
      {m.appearance && <span className="cast-app">{m.appearance}</span>}
    </>
  );
  return (
    <li className="cast-cell">
      {m.href ? <Link href={m.href} className="cast-link">{body}</Link> : <div className="cast-link">{body}</div>}
      {m.voice && <div className="cast-disc"><PlayDisc track={m.voice} size={28} labelPlay={`Play the voice of ${m.name}`} labelPause={`Pause the voice of ${m.name}`} /></div>}
    </li>
  );
}

export function CastGrid({ members, leadIds, className }: { members: CastMember[]; leadIds?: string[]; className?: string }) {
  const leads = leadIds?.length ? members.filter((m) => leadIds.includes(m.id)) : [];
  const groups = leads.length && leads.length < members.length
    ? [{ label: 'Leads', xs: leads }, { label: 'Supporting', xs: members.filter((m) => !leadIds!.includes(m.id)) }]
    : [{ label: null, xs: members }];
  return (
    <div className={cls('cast', className)}>
      {groups.map((g, i) => (
        <section key={i} className="cast-group" aria-label={g.label ?? undefined}>
          {g.label && <h3 className="h3 cast-group-h" aria-hidden>{g.label}</h3>}
          <ul className="cast-grid">{g.xs.map((m) => <Cell key={m.id} m={m} />)}</ul>
        </section>
      ))}
    </div>
  );
}

export function CastRow({ members, max = 6, moreHref, className }: { members: CastMember[]; max?: number; moreHref?: string; className?: string }) {
  const shown = members.slice(0, max);
  const rest = members.length - shown.length;
  return (
    <ul className={cls('cast-row', className)}>
      {shown.map((m) => {
        const inner = <><FaceCircle name={m.name} asset={m.asset} src={m.src} size={28} ring={m.ring} lang={m.nameLang} decorative /><span dir="auto" lang={m.nameLang}>{m.name}</span></>;
        return <li key={m.id}>{m.href ? <Link href={m.href} className="cast-row-item">{inner}</Link> : <span className="cast-row-item">{inner}</span>}</li>;
      })}
      {rest > 0 && <li>{moreHref ? <Link href={moreHref} className="cast-row-more num" aria-label={`${'The whole cast'} (+${rest})`}>+{rest}</Link> : <span className="cast-row-more num">+{rest}</span>}</li>}
    </ul>
  );
}
