'use client';

import { useEffect, useState } from 'react';

/** A media query as state (false on the server and on the first client render, so hydration matches). */
export function useMediaQuery(q: string): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setOn(m.matches);
    f(); m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, [q]);
  return on;
}
