'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { T } from '@/lib/copy';
import { BrandTile } from '@/components/ui/brand';
import { IconMenu, IconPlus } from '@/components/ui/icons';
import { HOME, areaKey } from './nav-model';
import { ShellDialog } from './ShellDialog';
import { NavFooter, NavGroups, NewButton } from './Sidebar';

/** THE MOBILEBAR (docs/DESIGN-SYSTEM-V4.md §5.1; below 768 px) — 56 px, sticky, on the page ground with a bottom
 *  hairline: the brand glyph (home), the name of the area the page belongs to (so the producer stays oriented), New…
 *  and the menu. The menu is a full-height sheet with the same groups in the same order as the sidebar, then the
 *  footer: Settings, Help & shortcuts, SaveState and the connection. */
export function MobileBar() {
  const pathname = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [pathname]);
  const area = areaKey(pathname);
  const close = () => setOpen(false);
  return (
    <header className="mobile-bar">
      <Link href={HOME} className="mobile-brand" aria-label={T('shell.homeLink')}><BrandTile /></Link>
      <p className="mobile-area" dir="auto">{area ? T(area) : T('app.name')}</p>
      <div className="mobile-actions">
        <Link href="/new" className="btn btn-secondary btn-sm btn-icon mobile-action" aria-label={T('nav.new')}><IconPlus aria-hidden /></Link>
        <button type="button" className="btn btn-quiet btn-sm btn-icon mobile-action" aria-label={T('nav.openMenu')} aria-haspopup="dialog" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen(true)}>
          <IconMenu aria-hidden />
        </button>
      </div>
      <ShellDialog id="mobile-menu" open={open} onClose={close} title={T('shell.menu')} placement="full" className="mobile-sheet">
        <nav className="shell-nav shell-nav-sheet" aria-label={T('nav.areas')}>
          <div className="shell-new-row"><NewButton onNavigate={close} className="btn-block" /></div>
          <NavGroups onNavigate={close} />
          <NavFooter onNavigate={close} collapse={false} />
        </nav>
      </ShellDialog>
    </header>
  );
}
