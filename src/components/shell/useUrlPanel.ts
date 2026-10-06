'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

/** A PANEL NAMED IN THE URL (`?job=…`, `?asset=…`): the page's own state opens it at once, and the address is
 *  mirrored with history.replaceState — never a router navigation, which can stall (a soft navigation that never
 *  commits left "Details" doing nothing). A deep link (a full load of the address with the parameter) opens it; a
 *  change of the address by Back/Forward or a link is followed. Other parameters and the hash are kept. */
export function useUrlPanel(param: string): [string | null, (id: string | null) => void] {
  const sp = useSearchParams();
  const fromUrl = sp.get(param);
  const [open, setOpenState] = useState<string | null>(fromUrl);
  // the address moved by itself (a link to ?job=, Back/Forward): the panel follows it
  useEffect(() => { setOpenState(fromUrl); }, [fromUrl]);
  useEffect(() => {
    const onPop = () => setOpenState(new URLSearchParams(window.location.search).get(param));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [param]);
  const setOpen = useCallback((id: string | null) => {
    setOpenState(id);
    const u = new URL(window.location.href);
    if (id) u.searchParams.set(param, id); else u.searchParams.delete(param);
    window.history.replaceState(window.history.state, '', `${u.pathname}${u.search}${u.hash}`);
  }, [param]);
  return [open, setOpen];
}
