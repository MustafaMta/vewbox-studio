'use client';

import { useId } from 'react';
import { useT } from './locale';

/** THE VEWBOX MARK — a lens barrel opened by a shutter whose negative space is a V: the frame you view through.
 *  Drawn with geometry so it stays crisp from the favicon to a title card. Gradient ids are unique per instance,
 *  so the sidebar's mark and the phone bar's mark never share definitions. */
export function VewboxMark({ size = 36, className = '' }: { size?: number; className?: string }) {
  const id = `vbx${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8B7BF8" /><stop offset="0.55" stopColor="#6A57EE" /><stop offset="1" stopColor="#4A3AD0" />
        </linearGradient>
        <linearGradient id={`${id}-v`} x1="12" y1="12" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" /><stop offset="1" stopColor="#E4DEFF" />
        </linearGradient>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="0" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" stopOpacity="0.28" /><stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="0.75" y="0.75" width="38.5" height="38.5" rx="11.5" fill={`url(#${id}-tile)`} />
      <rect x="0.75" y="0.75" width="38.5" height="38.5" rx="11.5" fill={`url(#${id}-sheen)`} />
      <rect x="0.75" y="0.75" width="38.5" height="38.5" rx="11.5" stroke="#FFFFFF" strokeOpacity="0.22" strokeWidth="1.5" />
      <path d="M28.6 10.6a12 12 0 1 0 3.1 6.1" stroke="#FFFFFF" strokeOpacity="0.5" strokeWidth="2" strokeLinecap="round" />
      <path d="M13.4 14.2 20 26.4l6.6-12.2" stroke={`url(#${id}-v)`} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="20" cy="26.4" r="1.5" fill="#FFFFFF" />
    </svg>
  );
}

export function VewboxLogo({ compact = false }: { compact?: boolean }) {
  const T = useT();
  return (
    <span className="flex items-center gap-3">
      <VewboxMark size={compact ? 30 : 34} />
      <span className="leading-none">
        <span className="block text-[15px] font-semibold tracking-[-0.01em] text-fg">{T('app.name')}</span>
        {!compact && <span className="mt-1 block text-[11px] text-faint">{T('app.tagline')}</span>}
      </span>
    </span>
  );
}
