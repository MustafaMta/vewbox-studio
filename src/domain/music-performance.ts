import type { Song } from './types';
import { sectionFor } from './timeline';

/** THE PERFORMANCE PLAN OF A SONG (cloud directive 2026-10-05 §8: "Music video generation must not use the same
 *  simplistic dialogue workflow as a normal film"). The song master is the authoritative audio and the clock; the plan
 *  says, line by line on the song's own timeline, WHO sings and in which role:
 *  - each lyric line is a segment with its time (the aligned vocal stem's `lineTimes` when they exist, a section's own
 *    per-line timing for alternating vocals, else an even spread — marked SPREAD so nobody mistakes it for measured);
 *  - LEAD singers carry the words; BACKING singers harmonise under them (sung softly, never on camera as the lead);
 *  - an instrumental stretch has no singer at all.
 *  Read by the shot planner and the prompt (who may move their lips when), the preflight (a shot cut in the middle of a
 *  sung line) and the singing QA (anyone else whose mouth follows the vocals is an extra singer). Pure. */

export interface PerformanceSegment {
  sectionId: string;
  index: number;
  from: number;
  to: number;
  text: string;
  textAr?: string;
  lead: string[];
  backing: string[];
  timing: 'ALIGNED' | 'SECTION' | 'SPREAD';
}

export function performanceSegments(song: Song): PerformanceSegment[] {
  const out: PerformanceSegment[] = [];
  for (const sec of [...song.sections].sort((a, b) => a.from - b.from)) {
    if (sec.kind === 'INSTRUMENTAL' || sec.performanceMode === 'INSTRUMENTAL') continue;
    const span = Math.max(0.001, sec.to - sec.from);
    const backing = (sec.backingIds ?? []).filter((id) => !sec.singerIds.includes(id));
    if (sec.lines?.length) {
      const n = sec.lines.length;
      sec.lines.forEach((l, i) => {
        const timed = l.from !== undefined && l.to !== undefined;
        out.push({ sectionId: sec.id, index: i, from: l.from ?? sec.from + (span * i) / n, to: l.to ?? sec.from + (span * (i + 1)) / n, text: l.text, lead: l.role === 'BACKING' ? [] : [l.singerId], backing: l.role === 'BACKING' ? [l.singerId] : backing, timing: timed ? 'SECTION' : 'SPREAD' });
      });
      continue;
    }
    const en = sec.text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    const ar = (sec.textAr ?? '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    const n = Math.max(en.length, ar.length);
    if (!n || !sec.singerIds.length) continue;
    const timed = sec.lineTimes?.length === n ? [...sec.lineTimes].sort((a, b) => a.index - b.index) : undefined;
    for (let i = 0; i < n; i++) {
      const t = timed?.[i];
      out.push({ sectionId: sec.id, index: i, from: t ? t.from : sec.from + (span * i) / n, to: t ? t.to : sec.from + (span * (i + 1)) / n, text: en[i] ?? ar[i], textAr: ar[i], lead: sec.singerIds, backing, timing: t ? (t.method === 'ALIGNED' ? 'ALIGNED' : 'SPREAD') : 'SPREAD' });
    }
  }
  return out.sort((a, b) => a.from - b.from || a.index - b.index);
}

/** Who sings at a moment of the song (seconds on the song's clock). */
export function singersAt(segments: PerformanceSegment[], t: number): { lead: string[]; backing: string[] } {
  const now = segments.filter((s) => t >= s.from && t < s.to);
  return { lead: [...new Set(now.flatMap((s) => s.lead))], backing: [...new Set(now.flatMap((s) => s.backing))] };
}

/** The segments a shot's window covers (partly or wholly). */
export const segmentsIn = (segments: PerformanceSegment[], w: { from: number; to: number }): PerformanceSegment[] => segments.filter((s) => s.from < w.to && s.to > w.from);

/** The sung lines a window boundary cuts through (a cut in the middle of a word reads as a broken performance): the
 *  boundary is strictly inside a line, more than `margin` seconds from either end. Only measured timing counts —
 *  an even spread is not where the words are. */
export function linesCutAt(segments: PerformanceSegment[], w: { from: number; to: number }, margin = 0.15): Array<{ at: number; segment: PerformanceSegment }> {
  const out: Array<{ at: number; segment: PerformanceSegment }> = [];
  for (const at of [w.from, w.to]) for (const s of segments) if (s.timing !== 'SPREAD' && at > s.from + margin && at < s.to - margin) out.push({ at, segment: s });
  return out;
}

/** The performers a shot shows singing and who must keep their lips closed: of the people in the shot, the lead and
 *  backing singers of its window, and everyone else (listeners, bystanders, extras). */
export function shotPerformers(song: Song, w: { from: number; to: number }, inShot: string[]): { lead: string[]; backing: string[]; silent: string[]; section?: string } {
  const segs = segmentsIn(performanceSegments(song), w);
  const lead = [...new Set(segs.flatMap((s) => s.lead))].filter((id) => inShot.includes(id));
  const backing = [...new Set(segs.flatMap((s) => s.backing))].filter((id) => inShot.includes(id) && !lead.includes(id));
  return { lead, backing, silent: inShot.filter((id) => !lead.includes(id) && !backing.includes(id)), section: sectionFor(song, w)?.id };
}
