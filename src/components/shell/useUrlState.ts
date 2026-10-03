'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { withSearch } from './url-state';

/** Read and write search parameters with the §7.4 rules (url-state.ts):
 *
 *    const url = useUrlState();
 *    url.get('tab');                                  // 'storyboard'
 *    url.set({ tab: 'produce' }, 'replace');          // switch between workspace tabs
 *    url.set({ f: formatFilters(next) });             // filters: one parameter; push by default
 *
 *  `scroll: false` keeps the page where it is (a tab or a filter is not a new page). */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const search = useSearchParams();
  const set = useCallback((patch: Record<string, string | null | undefined>, mode: 'push' | 'replace' = 'push') => {
    const href = `${pathname}${withSearch(search?.toString() ?? '', patch)}`;
    if (mode === 'replace') router.replace(href, { scroll: false }); else router.push(href, { scroll: false });
  }, [router, pathname, search]);
  return { get: (name: string) => search?.get(name) ?? null, set, href: (patch: Record<string, string | null | undefined>) => `${pathname}${withSearch(search?.toString() ?? '', patch)}` };
}
