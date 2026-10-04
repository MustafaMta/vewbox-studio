'use client';

import { usePathname } from 'next/navigation';
import { SegmentedLinks } from '@/components/ui/kit/Choice';
import { PRODUCTION_ITEMS, isActive } from './nav-model';

/** Shows | Shorts | Music Videos at the top of the three catalogues (VISUAL-STANDARD-V5.1 §5.2): the phone's
 *  Productions tab opens Shows, and this switch reaches the other two. Drawn only below 1024 px (shell.css), where the
 *  sidebar is not beside the page to do the same. The places come from the one navigation model. */
export function ProductionsSwitch() {
  const pathname = usePathname() ?? '/';
  const current = PRODUCTION_ITEMS.find((i) => isActive(pathname, i.href, i.also))?.href;
  return <SegmentedLinks label="Productions" className="productions-switch" current={current} items={PRODUCTION_ITEMS.map((i) => ({ href: i.href, label: i.label }))} />;
}
