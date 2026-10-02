import type { LyricSection, Production, Shot, Song } from './types';

/** TIME ON THE CUT — where each shot sits in the production's running order, and for a music video which part of
 *  the song (and which sung lines) a shot covers. Pure functions shared by planning, prompting and assembly. */

export interface Window { from: number; to: number }

/** Shots in cut order: scenes by number, shots by number within the scene. */
export function orderedShots(p: Production): Shot[] {
  const sceneOrder = new Map(p.scenes.map((sc) => [sc.id, sc.number]));
  return [...p.shots].sort((a, b) => (sceneOrder.get(a.sceneId) ?? 0) - (sceneOrder.get(b.sceneId) ?? 0) || a.number - b.number);
}

/** The window of every shot on the timeline, from the sum of the durations before it. */
export function shotWindows(p: Production): Map<string, Window> {
  const out = new Map<string, Window>();
  let t = 0;
  for (const sh of orderedShots(p)) { const d = Math.max(0, sh.durationSeconds || 0); out.set(sh.id, { from: t, to: t + d }); t += d; }
  return out;
}

/** The song section that owns most of a window (ties go to the earlier section). */
export function sectionFor(song: Song, w: Window): LyricSection | undefined {
  let best: LyricSection | undefined; let bestOverlap = 0;
  for (const sec of song.sections) {
    const overlap = Math.min(sec.to, w.to) - Math.max(sec.from, w.from);
    if (overlap > bestOverlap) { best = sec; bestOverlap = overlap; }
  }
  return best ?? song.sections.find((s) => w.from < s.to && w.to > s.from);
}

export interface SungLine { singerId: string; text: string; textAr?: string }

/** The lyric lines a shot's window covers, with their singers. Alternating sections carry their own per-line
 *  assignment; otherwise the section's lines are spread evenly over its duration and every assigned singer sings. */
export function sungLinesFor(song: Song, w: Window, language: 'EN' | 'AR'): SungLine[] {
  const sec = sectionFor(song, w);
  if (!sec || sec.performanceMode === 'INSTRUMENTAL' || sec.kind === 'INSTRUMENTAL') return [];
  const span = Math.max(0.001, sec.to - sec.from);
  if (sec.lines?.length) {
    const n = sec.lines.length;
    return sec.lines.map((l, i) => ({ ...l, from: l.from ?? sec.from + (span * i) / n, to: l.to ?? sec.from + (span * (i + 1)) / n }))
      .filter((l) => l.from < w.to && l.to > w.from)
      .map((l) => ({ singerId: l.singerId, text: l.text }));
  }
  const source = (language === 'AR' ? sec.textAr || sec.text : sec.text) || '';
  const lines = source.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (lines.length === 0 || sec.singerIds.length === 0) return [];
  const n = lines.length;
  const picked = lines.map((text, i) => ({ text, from: sec.from + (span * i) / n, to: sec.from + (span * (i + 1)) / n })).filter((l) => l.from < w.to && l.to > w.from);
  const en = sec.text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return picked.flatMap((l) => sec.singerIds.map((singerId) => ({ singerId, text: language === 'AR' ? (en[lines.indexOf(l.text)] ?? l.text) : l.text, textAr: language === 'AR' ? l.text : undefined })));
}

/** Who performs in a shot's window: the section's singers (and, for LISTENER sections, who listens). */
export function performanceFor(song: Song, w: Window): Shot['performance'] | undefined {
  const sec = sectionFor(song, w);
  if (!sec) return undefined;
  const mode = sec.performanceMode ?? (sec.kind === 'INSTRUMENTAL' || sec.singerIds.length === 0 ? 'INSTRUMENTAL' : sec.singerIds.length === 1 ? 'SOLO' : sec.singerIds.length === 2 ? 'DUET' : 'ENSEMBLE');
  return { mode, singerIds: mode === 'INSTRUMENTAL' ? [] : sec.singerIds, listenerIds: mode === 'LISTENER' ? song.singerIds.filter((id) => !sec.singerIds.includes(id)) : undefined };
}
