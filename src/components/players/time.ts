/** TIME AS THE PLAYERS WRITE IT (docs/DESIGN-SYSTEM-V4.md §3.5): "1:12 / 6:12" in a lobby transport, the timecode
 *  `00:01:12:08` (hours:minutes:seconds:frames) in the cutting room, "45 s" and "6 min" in slates. Always Western
 *  digits; the caller sets them LTR (`.tc`, `dir="ltr"`). */

export { fmtClock } from './coordinator';

export function timecode(t: number, fps = 24): string {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const f = Math.max(1, Math.round(fps));
  const total = Math.round(t * f);
  const frames = total % f;
  const s = Math.floor(total / f);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}:${p(frames)}`;
}

/** A runtime in words for slates: "45 s" under a minute, else "6 min" (rounded). Locale words come from the caller. */
export function runtime(seconds: number, words: { s: string; min: string } = { s: 's', min: 'min' }): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  return seconds < 60 ? `${Math.round(seconds)} ${words.s}` : `${Math.round(seconds / 60)} ${words.min}`;
}

/** A range "0:12–0:46". */
export const clockRange = (from: number, to: number, clock: (t: number) => string) => `${clock(from)}–${clock(to)}`;
