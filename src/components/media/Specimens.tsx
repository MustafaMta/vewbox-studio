'use client';

/** The media, player and cutting-room sections of the /kit specimen page (DESIGN-SYSTEM-V4 §8.3, §8.5 F3).
 *  Owned by package F3; the /kit page (package F2) renders it after the interface-kit sections. It renders
 *  `<section id="media">`, `<section id="players">` and `<section id="edit">`, each part in its states, on the bundled
 *  sample media (public/sample). Development only, like the page that shows it. */
import { useEffect, useRef } from 'react';
import { MediaSection } from './specimens/MediaSection';
import { PlayersSection } from './specimens/PlayersSection';
import { EditSection } from './specimens/EditSection';

export function MediaSpecimens() {
  const root = useRef<HTMLDivElement>(null);
  // a specimen page is captured whole (full-page screenshots never scroll lazy pictures into view): load them all
  useEffect(() => {
    const el = root.current; if (!el) return;
    const eager = () => el.querySelectorAll<HTMLImageElement>('img[loading="lazy"]').forEach((i) => { i.loading = 'eager'; });
    eager();
    const mo = new MutationObserver(eager); mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  return (
    <div ref={root} className="spec">
      <MediaSection />
      <PlayersSection />
      <EditSection />
    </div>
  );
}
