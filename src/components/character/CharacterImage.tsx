'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { T } from '@/lib/copy';
import { cls } from '@/components/ui/kit';
import { IconWarn } from '@/components/ui/icons';
import { initialsOf } from './identity';

/** THE CHARACTER'S IMAGE IN ITS FRAME — the canonical front full-body figure is never cropped to a face and never
 *  loses its head or feet: a picture taller than the frame is letterboxed on the media floor, one wider than the
 *  frame is trimmed at the sides only (the figure stands centred with margin). An older close-up portrait fills the
 *  frame from the top. With no picture the frame says so honestly: the initials and "No image yet", never a
 *  silhouette. `children` sit over the frame (a running job's phase, a play disc). */
export function CharacterImage({ src, kind, name, ratio = 2 / 3, unavailable, alt = '', className = '', children, placeholder }: {
  src?: string | null; kind: 'CANONICAL' | 'PORTRAIT' | 'NONE'; name: string; /** width / height of the frame (2:3 by default) */ ratio?: number;
  unavailable?: boolean; alt?: string; className?: string; children?: ReactNode; /** the words under the initials when there is no picture */ placeholder?: ReactNode;
}) {
  const img = useRef<HTMLImageElement>(null);
  const [fit, setFit] = useState<'cover' | 'contain'>(kind === 'PORTRAIT' ? 'cover' : 'contain');
  const measure = (el: HTMLImageElement | null) => {
    if (!el || kind !== 'CANONICAL' || !el.naturalWidth || !el.naturalHeight) return;
    setFit(el.naturalWidth / el.naturalHeight >= ratio ? 'cover' : 'contain');
  };
  // a cached picture may have loaded before React attached onLoad
  useEffect(() => { setFit(kind === 'PORTRAIT' ? 'cover' : 'contain'); if (img.current?.complete) measure(img.current); }, [src, kind, ratio]); // eslint-disable-line react-hooks/exhaustive-deps
  const show = src && !unavailable && kind !== 'NONE';
  return (
    <div className={cls('poster relative bg-media', className)} style={{ aspectRatio: String(ratio) }}>
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={img} src={src} alt={alt} decoding="async" onLoad={(e) => measure(e.currentTarget)} className={cls('absolute inset-0 h-full w-full', fit === 'cover' ? 'object-cover' : 'object-contain', kind === 'PORTRAIT' && 'object-top')} />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-input px-3 text-center" role="img" aria-label={unavailable ? T('media.unavailable') : `${name}: ${T('cast.image.none')}`}>
          {unavailable ? <IconWarn aria-hidden className="size-5 text-warn" /> : <span aria-hidden className="text-[32px] font-medium leading-none text-faint" dir="auto">{initialsOf(name)}</span>}
          <span className="text-xs text-faint">{unavailable ? T('media.unavailable') : placeholder ?? T('cast.image.none')}</span>
        </div>
      )}
      {children}
    </div>
  );
}

/** A running job's phase set in the frame, on the one permitted scrim, so the eye waits where the picture lands. */
export function FramePhase({ children, tone = 'busy' }: { children: ReactNode; tone?: 'busy' | 'bad' }) {
  return (
    <div className="absolute inset-x-0 bottom-0" role="status" aria-live="polite">
      <span className="scrim" aria-hidden />
      <p className={cls('relative flex items-center gap-2 px-3 pb-3 pt-8 text-[12.5px] font-medium', tone === 'bad' ? 'text-bad' : 'text-on-art')} dir="auto">
        {tone === 'busy' && <span aria-hidden className="dot dot-live bg-accent" />}
        <span className="min-w-0">{children}</span>
      </p>
    </div>
  );
}
