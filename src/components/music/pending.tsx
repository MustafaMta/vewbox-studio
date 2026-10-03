'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

/** TEMPORARY page-local wrapper (docs/design/PAGE-ENGINEERING-BRIEF.md §1): the shelf's start card in the content's own
 *  shape, drawn with Home's start-card classes (viewfinder corners, a round glyph, a title and one line) until the
 *  Design System Engineer lifts StartCard into the kit. Delete this file then and import the kit's. */
export function StartSleeve({ href, title, line, glyph }: { href: string; title: string; line: string; glyph: ReactNode }) {
  return (
    <Link className="home-start mv-start" href={href} style={{ aspectRatio: '1 / 1' }}>
      <span className="home-hero-corners" aria-hidden />
      <span className="home-figure-plus" aria-hidden>{glyph}</span>
      <span className="home-start-words"><span className="home-tool-title">{title}</span><span className="home-tool-line">{line}</span></span>
    </Link>
  );
}
