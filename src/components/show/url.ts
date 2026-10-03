'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

/** The Shows pages keep their open dialog and the selected season in the URL (`?new=episode`, `?season=…`), so a reload,
 *  a shared link and Back behave; closing a dialog removes its parameter without scrolling. */
export function useQueryParam(name: string): [string | null, (value: string | null, extra?: Record<string, string | null>) => void, (value: string | null, extra?: Record<string, string | null>) => string] {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const hrefWith = useCallback((value: string | null, extra: Record<string, string | null> = {}) => {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries({ [name]: value, ...extra })) { if (v == null) q.delete(k); else q.set(k, v); }
    const s = q.toString();
    return s ? `${pathname}?${s}` : pathname;
  }, [sp, pathname, name]);
  const set = useCallback((value: string | null, extra?: Record<string, string | null>) => router.replace(hrefWith(value, extra), { scroll: false }), [router, hrefWith]);
  return [sp.get(name), set, hrefWith];
}
