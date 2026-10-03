'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { MenuButton, MenuLink } from '@/components/ui/kit';
import { IconChevronDown, IconChevronRight, IconPlus } from '@/components/ui/icons';
import { NEW_SHORT } from './model';

/** SMALL PARTS OF THE FILM PAGES. TEMPORARY page-local wrappers: the section head and the start card draw with Home's
 *  classes (the approved reference) until the kit's SectionHead/Shelf and StartCard reach main; then these are
 *  deleted and the pages import the kit's. */

/** A section head as Home draws it: the title (h2 .t-section), an optional description, one quiet link at the end. */
export function Head({ id, title, description, link, end }: { id: string; title: ReactNode; description?: ReactNode; link?: { href: string; label: string }; end?: ReactNode }) {
  return (
    <div className="home-shelf-head">
      <div className="home-shelf-title">
        <h2 id={id} className="t-section">{title}</h2>
        {description && <p className="t-body home-shelf-desc">{description}</p>}
      </div>
      {(link || end) && (
        <div className="home-shelf-end">
          {end}
          {link && <Link className="home-link" href={link.href}>{link.label}<IconChevronRight aria-hidden /></Link>}
        </div>
      )}
    </div>
  );
}

/** The start card in the poster's own shape (Home's shelf start card): the viewfinder corners, a plus, two lines. */
export function StartPosterCard({ title, line }: { title: string; line: string }) {
  return (
    <Link className="home-start short-start" href={NEW_SHORT.auto} style={{ aspectRatio: '2 / 3' }}>
      <span className="home-hero-corners" aria-hidden />
      <span className="home-figure-plus" aria-hidden><IconPlus /></span>
      <span className="home-start-words"><span className="home-tool-title">{title}</span><span className="home-tool-line">{line}</span></span>
    </Link>
  );
}

/** New short: the page's primary, split — the main part lets the studio propose (Auto), the chevron offers both ways. */
export function NewShortButton() {
  return (
    <div className="btn-split film-split">
      <Link className="btn btn-primary" href={NEW_SHORT.auto}><IconPlus aria-hidden />New short</Link>
      <MenuButton label="More ways to start a short" iconOnly icon={<IconChevronDown aria-hidden />} variant="primary" align="end">
        <MenuLink href={NEW_SHORT.auto} description="One line is enough; you review everything before it is made">Let the studio propose</MenuLink>
        <MenuLink href={NEW_SHORT.manual} description="A title or a line; everything else has a default">Write it yourself</MenuLink>
      </MenuButton>
    </div>
  );
}
