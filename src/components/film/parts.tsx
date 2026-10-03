'use client';

import Link from 'next/link';
import { MenuButton, MenuLink } from '@/components/ui/kit';
import { IconChevronDown, IconPlus } from '@/components/ui/icons';
import { NEW_SHORT } from './model';

/** New short: the catalogue's primary, split (§5.3) — the main part lets the studio propose (Auto), the chevron offers
 *  both ways to start. */
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
