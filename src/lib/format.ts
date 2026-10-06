import { createElement, type ReactElement } from 'react';
import { ASPECT_INFO, DIALECT_LABELS, type Aspect, type Dialect } from '@/domain/vocabulary';

/* ================================================================================================================
   NUMBERS — owned by DS (docs/DESIGN-SYSTEM-V5.md §9.4 and §3.3 `.ro`, as amended 2026-10-03: the interface is
   English-only and always left to right, so every number is written in Western digits). What still depends on the
   KIND of number is its face and its isolation:

     kind              examples                                                face             isolation
     readout           timecodes, clock times in readout columns, m:ss         Plex Mono        LTR isolate
                       durations, frame rates, resolutions, format names
     duration, time    (readouts by another name)                              Plex Mono        LTR isolate
     identifier        shot, take, cut, version, scene, episode, season and    Plex Mono        LTR isolate
                       note numbers; track-list row numbers ("2.3" everywhere)
     file              file sizes                                              Plex Mono        LTR isolate
     count             "4 decisions", "8 shots", "4 / 4"                       interface sans   —
     date, datetime    "3 Oct", "3 Oct, 09:29"                                 interface sans   —
     duration-words    "7 min 11 s", "7.3 s"                                   interface sans   —

   Readouts, identifiers and file sizes are isolated even in the LTR interface because they sit beside
   user-authored content in other scripts (an Arabic dialogue line, a character's Arabic name): an isolate keeps
   "1344×768" and "2.1–2.4" in their order whatever text surrounds them. A digit typed in another script (٣, ۳) is
   read back as its Western digit: the interface writes one numeral system.
   ================================================================================================================ */

/** The kinds of number (§9.4). `range` is not a kind: use formatRange(). */
export type NumberKind = 'count' | 'date' | 'datetime' | 'duration-words' | 'readout' | 'duration' | 'time' | 'identifier' | 'file';

export interface NumberOptions {
  /** dates: add the year */
  year?: boolean;
  /** a readout given in seconds: `mss` (0:56, the default), `timecode` (00:00:03:12), `seconds` (7.3 s) */
  as?: 'mss' | 'timecode' | 'seconds';
  /** timecode frame rate (default 24) */
  fps?: number;
}

/** Arabic-Indic and Persian digits → Western, with their decimal (٫) and grouping (٬) separators. */
export function toWesternDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/٫/g, '.').replace(/٬/g, ',');
}

/** Whether a kind is set in the mono as an LTR isolate. */
export function isReadoutKind(kind: NumberKind): boolean { return kind === 'readout' || kind === 'duration' || kind === 'time' || kind === 'identifier' || kind === 'file'; }

const oneDecimal = (n: number) => String(Number(n.toFixed(1)));
const pad2 = (n: number) => String(n).padStart(2, '0');
const asDate = (d: Date | string | number) => (d instanceof Date ? d : new Date(d));

/** A number of seconds as a readout: "0:56", "1:02:05"; `as: 'timecode'` "00:00:03:12"; `as: 'seconds'` "7.3 s". */
export function readoutDuration(seconds: number, o: Pick<NumberOptions, 'as' | 'fps'> = {}): string {
  if (!Number.isFinite(seconds)) return '';
  const neg = seconds < 0 ? '-' : ''; const s = Math.abs(seconds);
  if (o.as === 'seconds') return `${neg}${oneDecimal(s)} s`;
  if (o.as === 'timecode') {
    const fps = o.fps ?? 24; const whole = Math.floor(s); const frames = Math.min(fps - 1, Math.round((s - whole) * fps));
    return `${neg}${pad2(Math.floor(whole / 3600))}:${pad2(Math.floor((whole % 3600) / 60))}:${pad2(whole % 60)}:${pad2(frames)}`;
  }
  const whole = Math.round(s); const h = Math.floor(whole / 3600); const m = Math.floor((whole % 3600) / 60); const r = whole % 60;
  return h ? `${neg}${h}:${pad2(m)}:${pad2(r)}` : `${neg}${m}:${pad2(r)}`;
}
/** A width and a height as one readout: "1344×768". */
export function resolution(width: number, height: number): string { return `${Math.round(width)}×${Math.round(height)}`; }
/** A clock time as a readout ("09:29", 24-hour). */
export function clockTime(d: Date | string | number): string { const x = asDate(d); return Number.isNaN(x.getTime()) ? '' : `${pad2(x.getHours())}:${pad2(x.getMinutes())}`; }
/** A file size as a readout: "512 B", "48 KB", "56.3 MB", "1.2 GB". */
export function fileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${oneDecimal(bytes / 1024 ** 2)} MB`;
  return `${oneDecimal(bytes / 1024 ** 3)} GB`;
}
/** "3 Oct" (with `year`: "3 Oct 2026"). */
function dateText(d: Date | string | number, o: NumberOptions): string {
  const x = asDate(d); if (Number.isNaN(x.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', ...(o.year ? { year: 'numeric' } : {}) }).format(x);
}
/** "56 s", "7.3 s", "7 min 11 s", "2 min", "1 h 4 min". */
function durationWords(seconds: number): string {
  if (!Number.isFinite(seconds)) return '';
  const s = Math.abs(seconds);
  const [uh, um, us] = ['h', 'min', 's'];
  if (s < 60) return `${oneDecimal(s)} ${us}`;
  const whole = Math.round(s); const h = Math.floor(whole / 3600); const m = Math.floor((whole % 3600) / 60); const r = whole % 60;
  if (h) return m ? `${h} ${uh} ${m} ${um}` : `${h} ${uh}`;
  return r ? `${m} ${um} ${r} ${us}` : `${m} ${um}`;
}

/** formatNumber(value, kind) → the text, in Western digits. Render readouts, identifiers and file sizes through
 *  formatNumberNode() (or an element carrying `numberProps(kind)`) so they are set in the mono and isolated. */
export function formatNumber(value: number | string | Date, kind: NumberKind, o: NumberOptions = {}): string {
  if (typeof value === 'string' && kind !== 'date' && kind !== 'datetime') {
    const w = toWesternDigits(value);
    if (kind === 'duration-words' && /^-?\d+(\.\d+)?$/.test(w.trim())) return durationWords(Number(w));
    return w;
  }
  switch (kind) {
    case 'readout': case 'duration': return value instanceof Date ? clockTime(value) : readoutDuration(Number(value), o);
    case 'time': return clockTime(value as Date | number);
    case 'file': return fileSize(Number(value));
    case 'identifier': return String(value);
    case 'date': return dateText(value as Date | string | number, o);
    case 'datetime': { const x = asDate(value as Date | string | number); return Number.isNaN(x.getTime()) ? '' : `${dateText(x, o)}, ${clockTime(x)}`; }
    case 'duration-words': return durationWords(Number(value));
    case 'count': default: return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(Number(value));
  }
}

/** A range, both ends of the same kind: "2.1–2.4", "1–2", "0:12–0:30". */
export function formatRange(from: number | string, to: number | string, kind: NumberKind, o: NumberOptions = {}, sep = '–'): string {
  return `${formatNumber(from, kind, o)}${sep}${formatNumber(to, kind, o)}`;
}

/** How to render a number of this kind: the mono LTR isolate for readouts, identifiers and file sizes. */
export function numberProps(kind: NumberKind): { className: string; dir?: 'ltr' } {
  if (isReadoutKind(kind)) return { className: 'num-ltr', dir: 'ltr' };
  return { className: kind === 'date' || kind === 'datetime' ? 'date' : 'count' };
}

/** The number as an element: `<span class="num-ltr" dir="ltr">1344×768</span>` for readouts, identifiers and file
 *  sizes; `<span class="count">4</span>` / `<span class="date">3 Oct</span>` otherwise. */
export function formatNumberNode(value: number | string | Date, kind: NumberKind, o: NumberOptions = {}, key?: string | number): ReactElement {
  const p = numberProps(kind);
  return createElement('span', { key, className: p.className, ...(p.dir ? { dir: p.dir } : {}) }, formatNumber(value, kind, o));
}
/** A range as one element, always an LTR isolate, so its two ends can never be swapped by surrounding RTL content. */
export function formatRangeNode(from: number | string, to: number | string, kind: NumberKind, o: NumberOptions = {}, sep = '–'): ReactElement {
  return createElement('span', { className: isReadoutKind(kind) ? 'num-ltr' : 'count num', dir: 'ltr' }, formatRange(from, to, kind, o, sep));
}

/** v4's date line ("3 Oct 2026"), English. The second argument is ignored: the website is English-only
 *  (2026-10-03); it stays optional so callers that still pass a locale compile until the cleanup removes it. */
export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(date);
}

/** "3 min ago", English (the second argument is ignored, as fmtDate). */
export function fmtAgo(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' });
  if (s < 45) return rtf.format(0, 'second').replace(/^in /, '');
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  if (s < 86400 * 30) return rtf.format(-Math.round(s / 86400), 'day');
  return fmtDate(d);
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
/** The dialect's English name (the second argument is ignored, as fmtDate). */
export function dialectLabel(d: Dialect | null | undefined): string { return d ? DIALECT_LABELS[d].en : '—'; }

/** Human words for a finite option: 'MEDIUM_CLOSE_UP' → 'Medium close up'. */
export function words(v: string | null | undefined): string {
  if (!v) return '—';
  return v.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/** Tailwind ratio class for an aspect. */
/** The same, as a CSS aspect-ratio value. */
export function ratioCss(a: Aspect): string { return a === 'VERTICAL_9_16' ? '9 / 16' : a === 'SQUARE_1_1' ? '1 / 1' : a === 'CINEMA_2_39' ? '2.39 / 1' : '16 / 9'; }
