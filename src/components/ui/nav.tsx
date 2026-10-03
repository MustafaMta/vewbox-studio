'use client';

import Link from 'next/link';
import { IconChevronRight } from './icons';

/** NAVIGATION — the studio's navigation lives in the shell since v4 (src/components/shell: the Sidebar, the NavRail,
 *  the phone's top and bottom bars, the model in nav-model.ts; docs/DESIGN-SYSTEM-V4.md §5.1, §7.1). This module keeps the
 *  breadcrumb trail that pages use, and re-exports the model for anything that asked for it here. */
export { NAV_GROUPS, NAV_ITEMS, isActive, currentItem, areaLabel } from '@/components/shell/nav-model';
export type { NavItem, NavGroup } from '@/components/shell/nav-model';

export function Crumbs({ items }: { items: Array<{ href?: string; label: string }> }) {
  return (
    <nav aria-label={'Breadcrumb'} className="mb-2 text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((c, i) => (
          <li key={i} className="flex min-w-0 items-center gap-1">
            {i > 0 && <IconChevronRight aria-hidden className="size-3.5 flex-none text-faint" />}
            {c.href ? <Link href={c.href} className="truncate rounded-sm hover:text-fg" dir="auto">{c.label}</Link> : <span aria-current="page" className="truncate text-fg" dir="auto">{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
