'use client';

import type { ReactNode } from 'react';
import { useT } from './locale';
import { Button, SampleMark, Thumb, cls } from './kit';
import { RATIO, type Ratio } from './cinema';
import { IconArrowRight, IconDelete, IconUpload } from './icons';
import { fmtBytes } from '@/lib/format';

/** A PICTURE YOU CHOSE — in a `.media` frame at the kind's ratio (4:5 for references, 16:9 for plates, 1:1 for
 *  sleeves), `object-fit: contain` on the media floor; under it the file name, its dimensions and size, and the
 *  actions Replace and Remove. The pair variant shows "Your reference → Result" side by side and never confuses the
 *  two: the result frame says in words what it holds when there is no picture. */
export function ImagePreview({ src, alt, ratio = 'portrait', fileName, width, height, bytes, sample, unavailable, onReplace, onRemove, accept = 'image/*', busy, caption, className = '' }: {
  src?: string | null; alt: string; ratio?: Ratio; fileName?: string; width?: number; height?: number; bytes?: number; sample?: boolean; unavailable?: boolean;
  onReplace?: (f: File) => void; onRemove?: () => void; accept?: string; busy?: boolean; caption?: ReactNode; className?: string;
}) {
  const T = useT();
  const dims = width && height ? `${width} × ${height}` : null;
  const meta = [dims, bytes ? fmtBytes(bytes) : null].filter(Boolean).join(' · ');
  return (
    <figure className={cls('min-w-0', className)}>
      <div className="relative">
        <Thumb src={src} alt={alt} ratio={RATIO[ratio]} contain unavailable={unavailable} className="border border-line" empty={T('preview.empty')} />
        {sample && <SampleMark className="absolute start-2 top-2" />}
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        {fileName && <span className="min-w-0 flex-1 basis-32 truncate font-medium text-fg" dir="auto" title={fileName}>{fileName}</span>}
        {meta && <span className="num text-faint">{meta}</span>}
        {caption && <span className="basis-full text-faint">{caption}</span>}
        {(onReplace || onRemove) && (
          <span className="flex basis-full items-center gap-2 pt-1">
            {onReplace && <label className="btn btn-secondary btn-sm cursor-pointer" aria-busy={busy || undefined}><IconUpload aria-hidden />{T('char.ref.replace')}<input type="file" accept={accept} className="sr-only" aria-label={T('char.ref.replace')} onChange={(e) => { const f = e.target.files?.[0]; if (f) onReplace(f); e.target.value = ''; }} /></label>}
            {onRemove && <Button size="sm" variant="quiet" icon={<IconDelete />} onClick={onRemove}>{T('btn.remove')}</Button>}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/** Your reference → the result, side by side with the arrow between them (stacked on a phone). The result slot
 *  is whatever the caller passes: a real picture, the job's phase, or an honest "nothing yet". */
export function ImagePair({ reference, result, referenceLabel, resultLabel, className = '' }: { reference: ReactNode; result: ReactNode; referenceLabel?: ReactNode; resultLabel?: ReactNode; className?: string }) {
  const T = useT();
  return (
    <div className={cls('grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-start', className)}>
      <div className="min-w-0"><p className="kicker mb-2">{referenceLabel ?? T('char.ref.yours')}</p>{reference}</div>
      <IconArrowRight aria-hidden className="mx-auto mt-24 hidden size-5 text-ink-500 sm:block rtl:rotate-180" />
      <div className="min-w-0"><p className="kicker mb-2">{resultLabel ?? T('char.ref.result')}</p>{result}</div>
    </div>
  );
}

/** The result frame while nothing exists yet: the reason in words (never a placeholder picture). */
export function ResultSlot({ ratio = 'portrait', icon, children, tone = 'empty' }: { ratio?: Ratio; icon?: ReactNode; children: ReactNode; tone?: 'empty' | 'busy' | 'bad' }) {
  return (
    <div className={cls('media media-empty flex-col gap-1.5 p-4 text-center text-[12.5px]', RATIO[ratio], tone === 'busy' && 'border-solid border-accent/50 text-body', tone === 'bad' && 'border-bad/50 text-bad')} role="status" aria-live="polite">
      {icon && <span className="[&>svg]:size-5" aria-hidden>{icon}</span>}
      <span dir="auto">{children}</span>
    </div>
  );
}
