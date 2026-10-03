'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { SectionHead, Skeleton, cls } from '@/components/ui/kit';
import { IconChevronLeft } from '@/components/ui/icons';

/** THE CONTROL PAGES' LAYOUT PARTS (Studio Company, its departments and agents, Production, Settings, Files) — layout
 *  only, on the kit: a page head (`.t-page` and one `.t-lead` line), a section with the kit's SectionHead, and a list of
 *  record rows inside one level-1 card. Every colour, radius and size is a token or a kit class (studio.css). */

export function PageHead({ title, lead, back, end, kicker, id = 'page-title' }: { title: ReactNode; lead?: ReactNode; back?: { href: string; label: string }; end?: ReactNode; kicker?: ReactNode; id?: string }) {
  return (
    <header className="cp-head">
      {back && <Link href={back.href} className="cp-back"><IconChevronLeft aria-hidden /><span>{back.label}</span></Link>}
      <div className="cp-head-row">
        <div className="cp-head-words">
          {kicker && <p className="t-label cp-kicker">{kicker}</p>}
          <h1 id={id} className="t-page cp-title">{title}</h1>
          {lead && <p className="t-lead cp-lead">{lead}</p>}
        </div>
        {end && <div className="cp-head-end">{end}</div>}
      </div>
    </header>
  );
}

export function Section({ id, title, count, countTone, description, link, action, children, className }: {
  id: string; title: ReactNode; count?: number | null; countTone?: 'wait'; description?: ReactNode;
  link?: { href: string; label: string; short?: string }; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section id={id} className={cls('cp-section', className)} aria-labelledby={`${id}-h`}>
      <SectionHead id={`${id}-h`} title={title} count={count} countTone={countTone} description={description} link={link} action={action} />
      {children}
    </section>
  );
}

/** A list of record rows inside one card: each row a start (a status word), the words, and the end (time, actions). */
export function Rows({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  return <ol className={cls('card cp-rows', className)} aria-label={label}>{children}</ol>;
}
export function Row({ start, title, meta, end, children, className }: { start?: ReactNode; title: ReactNode; meta?: ReactNode; end?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <li className={cls('cp-row', className)}>
      {start && <span className="cp-row-start">{start}</span>}
      <span className="cp-row-words">
        <span className="cp-row-title">{title}</span>
        {meta && <span className="t-meta cp-row-meta">{meta}</span>}
        {children}
      </span>
      {end && <span className="cp-row-end">{end}</span>}
    </li>
  );
}

/** One sentence in place of a section's content (the section head stays), with at most one action. */
export function EmptyLine({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="cp-empty"><p className="t-body">{children}</p>{action}</div>;
}

/** The time now, ticking each second while `on` (elapsed clocks of running jobs). */
export function useNow(on = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!on) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [on]);
  return now;
}

// ------------------------------------------------------------------------------------------- skeleton parts

export function HeadSkeleton({ back, kicker, lead = true }: { back?: boolean; kicker?: boolean; lead?: boolean }) {
  return (
    <div className="cp-head">
      {back && <span className="cp-back"><Skeleton.Line width="7rem" /></span>}
      <div className="cp-head-row">
        <div className="cp-head-words">
          {kicker && <span className="t-label cp-kicker"><Skeleton.Line width="12rem" /></span>}
          <span className="t-page cp-title"><Skeleton.Line size="title" width="min(18rem, 70%)" /></span>
          {lead && <span className="t-lead cp-lead"><Skeleton.Line width="min(34rem, 90%)" /></span>}
        </div>
      </div>
    </div>
  );
}
export function SectionHeadSkeleton({ width = '9rem' }: { width?: string }) {
  return <div className="shead"><div className="shead-row"><div className="shead-start"><span className="t-section shead-title"><Skeleton.Line size="title" width={width} /></span></div></div></div>;
}
export function RowsSkeleton({ n = 4 }: { n?: number }) {
  return (
    <div className="card cp-rows" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="cp-row">
          <span className="cp-row-start"><Skeleton.Line width="5rem" /></span>
          <span className="cp-row-words"><span className="cp-row-title"><Skeleton.Line width={`${46 + ((i * 17) % 30)}%`} /></span><span className="t-meta cp-row-meta"><Skeleton.Line width="30%" /></span></span>
        </div>
      ))}
    </div>
  );
}
