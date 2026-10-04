'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { artVars } from '@/studio/presentation';
import { coverPosition } from '@/components/home/model';
import { Frame } from '@/components/media/Frame';
import type { Pic } from './model';

/** The wide key art at the top of a show, a season or an episode: Home's banner proportions (full content width,
 *  `clamp(280px, 28vw, 420px)` high, radius 20; a 4:3 window on phones), the picture cropped on its focal point, nothing
 *  drawn over it. With no picture: the title card in the same box. The words sit under it (the caption). */
export function Backdrop({ picture, title, lang, label, state = 'noKeyArt' }: { picture?: Pic; title: string; lang?: string; label: string; state?: 'noKeyArt' | 'notMade' }) {
  // the crop for the box the picture is drawn in (Home's rule, §7.1): never above a head; measured before paint
  const box = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<string | undefined>(undefined);
  const asset = picture?.asset;
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !asset) return;
    const measure = () => { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) setPosition(coverPosition(asset.presentation, asset, r.width / r.height)); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [asset]);
  return (
    <div ref={box} className="show-hero-frame">
      <Frame asset={picture?.asset} src={picture?.src} ratio="16/9" fit="cover" alt={picture ? label : ''} art={artVars(picture?.asset)} title={title} titleLang={lang} titleState={state}
        radius="hero" priority decorative={!picture} position={position ?? '50% 0%'} style={{ aspectRatio: 'auto', blockSize: '100%' }} />
    </div>
  );
}

/** The caption under the backdrop: an optional poster, the words (slate, title, lead) and the actions at the end. */
export function Caption({ poster, children, actions }: { poster?: ReactNode; children: ReactNode; actions: ReactNode }) {
  return (
    <div className="show-caption" data-poster={poster ? '' : undefined}>
      {poster && <div className="show-poster">{poster}</div>}
      <div className="show-caption-words">{children}</div>
      <div className="show-acts">{actions}</div>
    </div>
  );
}

/** The backdrop and caption while loading live with the skeletons (./skeletons); re-exported for the pages. */
export { BackdropSkeleton } from './skeletons';
