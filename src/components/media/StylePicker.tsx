'use client';

import { useId, type ReactNode } from 'react';
import { STYLES, type Style } from '@/domain/vocabulary';
import { PickerIcon, PicturePicker } from '@/components/ui/kit/Pickers';
import { IconAuto } from '@/components/ui/icons';

/** THE STYLE CHOICE (lifted from the creation flows) — the three looks as small drawings (not pictures from anywhere),
 *  on the kit's PicturePicker: one radio group, the arrows move the choice. `auto` adds "Studio decides" as a first
 *  option (null). */

import { STYLE_WORDS } from './styles';
export { STYLE_WORDS };

const AUTO = '__auto' as const;

export function StylePicker({ value, onChange, label = 'Style', auto }: { value: Style | null; onChange: (s: Style | null) => void; label?: ReactNode; /** "Studio decides" as a first choice */ auto?: string }) {
  const options = [
    ...(auto ? [{ value: AUTO as Style | typeof AUTO, label: auto, hint: 'From the story', picture: <PickerIcon><IconAuto /></PickerIcon> }] : []),
    ...STYLES.map((s) => ({ value: s as Style | typeof AUTO, label: STYLE_WORDS[s].label, hint: STYLE_WORDS[s].hint, picture: <StylePreview style={s} /> })),
  ];
  return <PicturePicker label={label} value={value ?? (auto ? AUTO : null)} onChange={(v) => onChange(v === AUTO ? null : (v as Style))} options={options} />;
}

/** A small drawing that says what a style is (decorative; its colours are the drawing's, like a picture's). */
export function StylePreview({ style }: { style: Style }) {
  const id = useId();
  if (style === 'CARTOON') return <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" className="ppick-drawing" aria-hidden><rect width="160" height="90" fill="#e8c46a" /><circle cx="52" cy="46" r="24" fill="#d9573b" /><rect x="88" y="26" width="46" height="40" rx="8" fill="#2f6fb5" /><path d="M0 74 Q40 58 80 74 T160 74 V90 H0Z" fill="#3f8a5a" /></svg>; // v5-lint: allow raw-colour — a drawing of the style, not interface colour
  if (style === 'ANIME') return <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" className="ppick-drawing" aria-hidden><defs><linearGradient id={`${id}-an`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b8d4e8" /><stop offset="1" stopColor="#3a5a8a" /></linearGradient></defs><rect width="160" height="90" fill={`url(#${id}-an)`} /><circle cx="118" cy="26" r="12" fill="#fff6d6" /><path d="M0 90 L30 44 L52 70 L78 30 L110 68 L130 52 L160 90 Z" fill="#1e2433" /><path d="M0 90 L30 44 L52 70 L78 30" fill="none" stroke="#eef4fb" strokeWidth="1.2" /></svg>; // v5-lint: allow raw-colour — a drawing of the anime style (a painted dusk sky), not interface colour
  return <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" className="ppick-drawing" aria-hidden><defs><linearGradient id={`${id}-re`} x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stopColor="#5f7ea0" /><stop offset="1" stopColor="#1a1712" /></linearGradient><radialGradient id={`${id}-rg`} cx="0.7" cy="0.3" r="0.6"><stop offset="0" stopColor="#f2d59a" stopOpacity="0.9" /><stop offset="1" stopColor="#f2d59a" stopOpacity="0" /></radialGradient></defs><rect width="160" height="90" fill={`url(#${id}-re)`} /><rect width="160" height="90" fill={`url(#${id}-rg)`} /><ellipse cx="60" cy="64" rx="14" ry="26" fill="#14110d" opacity="0.9" /><rect y="80" width="160" height="10" fill="#0c0a08" /></svg>; // v5-lint: allow raw-colour — a drawing of the style
}
