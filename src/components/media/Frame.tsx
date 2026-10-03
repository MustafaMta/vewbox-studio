'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ArtVars, Presentation } from '@/domain/presentation';
import { T } from '@/lib/copy';
import { IconImageOff } from '@/components/ui/icons';
import { cls } from '@/components/ui/kit';
import { artStyle, cssRatio, dimsLight, objectPosition, type FrameRatio, type Picture } from './art';
import { TitleCard, type TitleState } from './TitleCard';

/** THE PICTURE FRAME (docs/DESIGN-SYSTEM-V4.md §2.4, §5.4) — draws one picture in one ratio; every tile and hero uses
 *  it. Until the image decodes the frame shows `--art-ph` (the asset's clamped tint, or the field tone when unknown)
 *  and then crossfades in `--t-media` (instant under reduced motion). `cover` crops on the focal point; `contain`
 *  letterboxes on `--art-edge`, the image's own border colour, never on black bars beside a grey backdrop (V4-02).
 *  A light-backed image is dimmed to 0.9 in the lobby only (`judge` keeps the true pixels; the cutting room and the
 *  theatre refuse the filter in CSS). With no picture the frame is a title card. `state="drawing"` shows the job's
 *  phase inside the frame: a 12/16 phrase on the solid chip at the bottom start, with the tally.
 *
 *  Loading (v5.1): the frame's ratio is reserved before anything loads (no layout shift); the image is loading=\"lazy\",
 *  and an IntersectionObserver switches it to eager once the frame comes within 1.5 viewports, so a picture below the
 *  fold has usually decoded before it scrolls in instead of showing as a placeholder slab. It fades in only once
 *  decoded (img.decode()), never half-painted. */

export interface FrameProps {
  asset?: Picture | null;
  /** a plain source when there is no asset record */
  src?: string | null;
  ratio?: FrameRatio;
  fit?: 'cover' | 'contain';
  focal?: { x: number; y: number } | null;
  /** built from data ("Key art for The Kite"); empty when a link around the frame already names it */
  alt: string;
  priority?: boolean;
  state?: 'ready' | 'drawing' | 'missing' | 'unavailable';
  /** while drawing: the job's phase in words ("Drawing Elias · 2nd in the queue") */
  phase?: ReactNode;
  /** the title card when there is no picture */
  title?: string;
  titleLang?: string;
  titleState?: TitleState;
  number?: number;
  art?: ArtVars | null;
  presentation?: Presentation | null;
  /** an explicit `object-position` (a figure portrait-cropped to its face: art.ts portraitPosition) */
  position?: string;
  /** the producer judges these pixels: no light-backdrop filter */
  judge?: boolean;
  /** media 14 (tiles) · hero 20 (the marquee, detail heroes) · none (inside a card, which clips it) */
  radius?: 'media' | 'precise' | 'none' | 'group' | 'hero';
  /** the title card hides from assistive technology (a tile link names it) */
  decorative?: boolean;
  className?: string;
  style?: CSSProperties;
  /** overlays inside the frame: the duration chip, the selected check */
  children?: ReactNode;
}

export function Frame({ asset, src: plainSrc, ratio = '16/9', fit = 'cover', focal, position, alt, priority, state = 'ready', phase, title, titleLang, titleState, number, art, presentation, judge, radius = 'media', decorative, className, style, children }: FrameProps) {
  const src = asset?.src ?? plainSrc ?? null;
  const pres = presentation ?? asset?.presentation ?? null;
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [near, setNear] = useState(Boolean(priority));
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setLoaded(false); setFailed(false); }, [src]);
  // within 1.5 viewports of the screen: load now (the browser's own lazy distance is shorter and varies)
  useEffect(() => {
    if (near || !src) return;
    const el = boxRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: '150% 50% 150% 50%' });
    io.observe(el);
    return () => io.disconnect();
  }, [near, src]);
  // shown once decoded, so the fade never reveals a half-painted picture
  const reveal = useCallback((img: HTMLImageElement) => { const done = () => setLoaded(true); if (typeof img.decode === 'function') img.decode().then(done, done); else done(); }, []);
  // an image that finished before hydration fires no onLoad: read it from the element
  const imgRef = useCallback((img: HTMLImageElement | null) => { if (img?.complete) { if (img.naturalWidth > 0) reveal(img); else if (img.currentSrc) setFailed(true); } }, [reveal]);

  const unavailable = state === 'unavailable' || Boolean(asset?.unavailable);
  const vars = artStyle(art, ['--art-ph', '--art-edge']);
  const tinted = Boolean((vars as Record<string, unknown> | undefined)?.['--art-ph']);
  // a picture that exists but did not load keeps its place and colour, and says so (§5.5 Failed)
  if (src && failed && state !== 'missing') {
    return (
      <div className={cls('frame', className)} data-fit={fit} data-radius={radius} data-failed data-tint={tinted || undefined} style={{ aspectRatio: cssRatio(ratio), ...vars, ...style }}>
        <span className="frame-failed" role="img" aria-label={alt ? `${alt} — picture unavailable` : 'Picture unavailable'}><IconImageOff aria-hidden /><span aria-hidden>Picture unavailable</span></span>
        {children}
      </div>
    );
  }
  if (!src || state === 'missing' || unavailable) {
    const drawing = state === 'drawing';
    return (
      <TitleCard title={title ?? alt} lang={titleLang} ratio={ratio} number={number} radius={radius === 'group' || radius === 'hero' ? 'media' : radius} decorative={decorative}
        state={unavailable ? 'unavailable' : drawing ? 'drawing' : titleState ?? 'notDrawn'} stateLabel={drawing && phase ? phase : undefined}
        className={className} style={{ ...vars, ...style }}>{children}</TitleCard>
    );
  }
  return (
    <div ref={boxRef} className={cls('frame', className)} data-fit={fit} data-radius={radius} data-loaded={loaded || undefined} data-tint={tinted || undefined} style={{ aspectRatio: cssRatio(ratio), ...vars, ...style }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={imgRef} src={src} alt={alt} loading={priority || near ? 'eager' : 'lazy'} decoding="async" fetchPriority={priority ? 'high' : undefined}
        data-light={dimsLight(pres, judge) || undefined} style={fit === 'cover' ? { objectPosition: position ?? objectPosition(pres, focal) } : undefined}
        onLoad={(e) => reveal(e.currentTarget)} onError={() => setFailed(true)} />
      {state === 'drawing' && (
        <span className="frame-phase" role="status"><span className="m-tally" aria-hidden />{phase ?? T('media.state.drawing')}</span>
      )}
      {children}
    </div>
  );
}
