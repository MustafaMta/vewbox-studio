'use client';

import { useEffect } from 'react';
import { useStudio } from '@/studio/store';
import { readPrefs, writePrefs } from '@/components/shell/preferences';

/** Reduce motion is a studio setting (Settings, the store): this applies it to <html data-motion="reduce"> and mirrors
 *  it into this browser's interface preferences (`vewbox.ui`), so the boot script (src/app/boot.ts) applies it before
 *  the next first paint. Until the studio's settings arrive, what the boot applied stands. */
export function MotionPreference({ children }: { children?: React.ReactNode }) {
  const { state, ready } = useStudio();
  const motion = state.settings.reducedMotion;
  useEffect(() => {
    if (!ready) return;
    const html = document.documentElement;
    if (motion) html.setAttribute('data-motion', 'reduce'); else html.removeAttribute('data-motion');
    if (readPrefs().motion !== motion) writePrefs({ motion });
  }, [motion, ready]);
  return <>{children}</>;
}
