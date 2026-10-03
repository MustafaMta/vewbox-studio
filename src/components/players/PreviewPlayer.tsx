'use client';

import { useEffect, useRef, useState } from 'react';
import type { Presentation } from '@/domain/presentation';
import { T } from '@/lib/copy';
import { cls } from '@/components/ui/kit';
import { IconPause, IconPlay, IconSound } from '@/components/ui/icons';
import { dimsLight, objectPosition } from '@/components/media/art';
import { heroPreviewsOn, prefersReducedMotion, savesData } from './prefs';

/** THE HERO PREVIEW (docs/DESIGN-SYSTEM-V4.md §4.8, §5.12) — lobby only (Show page, Short Overview). It starts as the
 *  still. When a cut exists, a muted preview starts after 2 s on the page, plays once for at most 15 s and rests on
 *  the still again. It never plays with sound: *Watch with sound* opens the real player. Pause and Watch with sound
 *  are visible from the moment it starts (2.2.2). It never starts under reduced motion, when the browser asks to save
 *  data, when Settings › Interface › Hero previews is Off, or in a background tab. It fills the hero picture layer. */

type State = 'still' | 'playing' | 'paused' | 'done';

export function PreviewPlayer({ src, still, alt, focal, presentation, delay = 2000, limit = 15, onWatchWithSound, className }: { src: string; still?: string | null; alt: string; focal?: { x: number; y: number } | null; presentation?: Presentation | null; delay?: number; limit?: number; onWatchWithSound?: () => void; className?: string }) {
  const [state, setState] = useState<State>('still');
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    setState('still');
    const allowed = () => !prefersReducedMotion() && !savesData() && heroPreviewsOn() && document.visibilityState === 'visible';
    if (!allowed()) return;
    const t = setTimeout(() => { if (allowed()) setState('playing'); }, delay);
    return () => clearTimeout(t);
  }, [src, delay]);
  useEffect(() => {
    const v = video.current; if (!v) return;
    if (state === 'playing') { v.muted = true; void v.play().catch(() => setState('done')); }
    else if (state === 'paused') v.pause();
  }, [state]);
  useEffect(() => {
    const off = () => { if (document.visibilityState !== 'visible') setState((s) => (s === 'playing' ? 'paused' : s)); };
    document.addEventListener('visibilitychange', off);
    return () => document.removeEventListener('visibilitychange', off);
  }, []);
  const live = state === 'playing' || state === 'paused';
  const pos = objectPosition(presentation, focal);
  return (
    <div className={cls('preview', className)} data-state={state}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {still && <img className="preview-still" src={still} alt={alt} data-light={dimsLight(presentation) || undefined} style={{ objectPosition: pos }} />}
      {state !== 'still' && (
        <video ref={video} className="preview-video" src={src} muted playsInline preload="auto" aria-hidden tabIndex={-1} style={{ objectPosition: pos }}
          onTimeUpdate={(e) => { if (e.currentTarget.currentTime >= limit) { e.currentTarget.pause(); setState('done'); } }}
          onEnded={() => setState('done')} onError={() => setState('done')} />
      )}
      {live && (
        <div className="preview-controls">
          <button type="button" className="btn btn-sm preview-btn" onClick={() => setState(state === 'playing' ? 'paused' : 'playing')}>
            {state === 'playing' ? <IconPause aria-hidden /> : <IconPlay aria-hidden />}{state === 'playing' ? T('media.hero.pausePreview') : T('media.hero.playPreview')}
          </button>
          {onWatchWithSound && <button type="button" className="btn btn-sm preview-btn" onClick={() => { setState('done'); onWatchWithSound(); }}><IconSound aria-hidden />{T('media.hero.watchWithSound')}</button>}
        </div>
      )}
    </div>
  );
}
