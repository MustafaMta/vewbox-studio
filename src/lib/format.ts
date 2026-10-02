import { ASPECT_INFO, DIALECT_LABELS, type Aspect, type Dialect } from '@/domain/vocabulary';
import type { Locale } from '@/lib/i18n';

export function fmtDate(d: Date | string | null | undefined, locale: Locale = 'en'): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-IQ-u-nu-latn' : 'en-GB', { dateStyle: 'medium' }).format(date);
}

/** "3 min ago" / "منذ ٣ دقائق", in the interface language. */
export function fmtAgo(d: Date | string | null | undefined, locale: Locale = 'en'): string {
  if (!d) return '—';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', { numeric: 'auto' });
  if (s < 45) return rtf.format(0, 'second').replace(/^in /, '');
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  if (s < 86400 * 30) return rtf.format(-Math.round(s / 86400), 'day');
  return fmtDate(d, locale);
}

/** 95 → "1:35"; 4.5 → "4.5s" */
export function fmtSeconds(s: number | null | undefined): string {
  if (s === null || s === undefined || Number.isNaN(s)) return '—';
  const m = Math.floor(s / 60); const r = s - m * 60;
  return m ? `${m}:${String(Math.round(r)).padStart(2, '0')}` : `${Number.isInteger(r) ? r : r.toFixed(1)}s`;
}

export function fmtBytes(b: number | null | undefined): string {
  if (!b) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 ** 2).toFixed(1)} MB`;
}

export function aspectLabel(a: Aspect): string { return ASPECT_INFO[a].label; }
export function aspectShort(a: Aspect): string { return ASPECT_INFO[a].label.split(' · ')[0]; }
export function dialectLabel(d: Dialect | null | undefined, locale: Locale = 'en'): string { return d ? DIALECT_LABELS[d][locale] : '—'; }

/** Human words for a finite option: 'MEDIUM_CLOSE_UP' → 'Medium close up'. */
export function words(v: string | null | undefined): string {
  if (!v) return '—';
  return v.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export function isArabic(s: string | null | undefined): boolean { return Boolean(s && /[؀-ۿ]/.test(s)); }

export function clip(s: string | null | undefined, n = 120): string { if (!s) return ''; return s.length > n ? `${s.slice(0, n - 1)}…` : s; }

/** Tailwind ratio class for an aspect. */
/** The same, as a CSS aspect-ratio value. */
export function ratioCss(a: Aspect): string { return a === 'VERTICAL_9_16' ? '9 / 16' : a === 'SQUARE_1_1' ? '1 / 1' : a === 'CINEMA_2_39' ? '2.39 / 1' : '16 / 9'; }

export function ratioClass(a: Aspect): string {
  return a === 'VERTICAL_9_16' ? 'aspect-[9/16]' : a === 'SQUARE_1_1' ? 'aspect-square' : a === 'CINEMA_2_39' ? 'aspect-[2.39/1]' : 'aspect-video';
}
