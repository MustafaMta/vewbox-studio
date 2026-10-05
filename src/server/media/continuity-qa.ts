import type { QaCheck } from '@/domain/types';
import type { Probe } from '@/server/media';
import { greyFrames, meanAbsDiff } from './assembly-joins';

/** CONTINUITY QA OF ONE TAKE (cloud directive 2026-10-05 §10), the checks that need no model: measured on the decoded
 *  picture (64×36 grey, the join QA's measure) and on what was heard, beside the existing picture check
 *  (src/server/media/ffmpeg.ts qaTake: decodable, duration, size, black, freeze, flicker, silence, peak).
 *
 *  - ACCIDENTAL FADES: the picture ramps from or to near-black at the start or end of the take, or dips to black inside
 *    it (the directive: "Do not use fades or black frames to hide failed continuity");
 *  - FRAME DUPLICATION: consecutive frames that are identical (a stutter, a repeated guide that was not trimmed);
 *  - UNPLANNED CUTS: a hard picture change inside the take that the shot did not plan (H3 cuts inside a take to reach a
 *    framing — acceptance 2026-10-05); planned in-take cuts (`[Shot N]`, ShotStaging beats with `cut`) are allowed;
 *  - REPEATED SPEECH: the take says a script phrase more often than the script does (H3 fills a short line's silence by
 *    repeating it — "Thank you" twice, acceptance shot 1.3);
 *  - DIALOGUE TIMING: each line is heard where and as long as its recording says (the authoritative audio);
 *  - CONTAINER: what the cut needs — H.264/H.265 video in yuv420p at the engine's frame rate, audio present.
 *
 *  Every threshold is a START value (docs/research/FILM-PIPELINE-RESEARCH-2026-10-05.md §D: calibrate on the RTX 5090)
 *  and every finding is a REVIEW flag with its numbers: nothing here rejects a take or regenerates one; the failures
 *  stay in the take's QA record and in production history. */

export const CONTINUITY_QA = {
  /** a frame mean under this (0–255 luma) counts as black for the fade check */
  blackLuma: 16,
  /** a ramp is a fade when the luma climbs (or falls) from black over at least this many frames, monotonically */
  fadeMinFrames: 6,
  /** two consecutive frames whose mean absolute difference is under this are duplicates */
  duplicateDiff: 0.35,
  /** duplicates allowed (an engine may hold a frame on a still subject): more than this fraction of frames, or a run
   *  longer than `duplicateRun`, is flagged */
  duplicateFraction: 0.05,
  duplicateRun: 3,
  /** a frame change is a cut when it is over `cutFloor` and over `cutFactor` × the take's median frame change */
  cutFloor: 18,
  cutFactor: 6,
  /** a planned cut matches a measured one within this many seconds */
  cutTolerance: 0.5,
  /** a line is heard on time when its start is within this many seconds of where the take placed it, and its heard
   *  length within this fraction of its recording */
  lineStartTolerance: 0.6,
  lineLengthTolerance: 0.45,
  basis: 'START values (docs/research/FILM-PIPELINE-RESEARCH-2026-10-05.md §D); calibrate over real H3 takes',
} as const;

export interface FrameSeries { means: number[]; diffs: number[]; fps: number }

const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (a: Uint8Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; };

/** The per-frame series a take's checks read: each frame's mean luma and its difference from the previous frame. */
export function frameSeries(frames: Uint8Array[], fps: number): FrameSeries {
  return { means: frames.map(mean), diffs: frames.map((f, i) => (i ? meanAbsDiff(frames[i - 1], f) : 0)), fps };
}

/** The length of a ramp out of black at the start (or, reversed, into black at the end): frames rising steadily from
 *  a black first frame; 0 when the clip does not start black. */
function rampFrames(means: number[], fromStart: boolean): number {
  const xs = fromStart ? means : [...means].reverse();
  if (!xs.length || xs[0] >= CONTINUITY_QA.blackLuma) return 0;
  let n = 1;
  while (n < xs.length && xs[n] > xs[n - 1] + 0.5) n++;
  return n;
}

/** Fades in or out of black and black dips inside the take (after its `head` frames, which repeat another shot). */
export function judgeFades(s: FrameSeries, head = 0): QaCheck {
  const body = s.means.slice(head);
  const rampIn = rampFrames(body, true), rampOut = rampFrames(body, false);
  // a ramp counts as a fade when it is long and climbs out of black into a lit picture
  const lit = (i: number) => (body[i] ?? 0) >= CONTINUITY_QA.blackLuma * 3;
  const fadeIn = rampIn >= CONTINUITY_QA.fadeMinFrames && lit(rampIn - 1) ? rampIn : 0;
  const fadeOut = rampOut >= CONTINUITY_QA.fadeMinFrames && lit(body.length - rampOut) ? rampOut : 0;
  const dips: Array<{ from: number; to: number }> = [];
  let start = -1;
  for (let i = Math.max(1, rampIn); i < body.length - Math.max(1, rampOut); i++) {
    const black = body[i] < CONTINUITY_QA.blackLuma;
    if (black && start < 0) start = i;
    if (!black && start >= 0) { dips.push({ from: start, to: i - 1 }); start = -1; }
  }
  const problems: string[] = [];
  if (fadeIn >= CONTINUITY_QA.fadeMinFrames) problems.push(`fades in from black over ${fadeIn} frames`);
  if (fadeOut >= CONTINUITY_QA.fadeMinFrames) problems.push(`fades out to black over ${fadeOut} frames`);
  for (const d of dips) problems.push(`dips to black at ${((d.from + head) / s.fps).toFixed(2)}–${((d.to + head + 1) / s.fps).toFixed(2)} s`);
  return { name: 'no-accidental-fade', ok: problems.length === 0, value: problems.length, threshold: `no ramp from or to luma < ${CONTINUITY_QA.blackLuma} over ≥ ${CONTINUITY_QA.fadeMinFrames} frames, no black dip`, detail: problems.length ? `${problems.join('; ')} — a fade never hides a continuity problem (review)` : 'no fade or black dip' };
}

/** Identical consecutive frames: their count and the longest run. */
export function judgeDuplicates(s: FrameSeries, head = 0): QaCheck {
  const d = s.diffs.slice(head + 1);
  let dup = 0, run = 0, longest = 0, at = -1, longestAt = -1;
  d.forEach((x, i) => { if (x < CONTINUITY_QA.duplicateDiff) { dup++; run++; if (run === 1) at = i; if (run > longest) { longest = run; longestAt = at; } } else run = 0; });
  const fraction = d.length ? dup / d.length : 0;
  const ok = fraction <= CONTINUITY_QA.duplicateFraction && longest <= CONTINUITY_QA.duplicateRun;
  return { name: 'no-duplicate-frames', ok, value: dup, threshold: `≤ ${Math.round(CONTINUITY_QA.duplicateFraction * 100)} % of frames, runs ≤ ${CONTINUITY_QA.duplicateRun}`, detail: ok ? `${dup} repeated frame(s) of ${d.length}` : `${dup} repeated frame(s) of ${d.length} (${(fraction * 100).toFixed(1)} %), longest run ${longest} at ${((longestAt + head + 1) / s.fps).toFixed(2)} s (review)` };
}

/** The picture's hard changes (cuts) inside the take, in seconds from the take's start. */
export function measuredCuts(s: FrameSeries, head = 0): number[] {
  const body = s.diffs.slice(head + 1);
  const floor = Math.max(CONTINUITY_QA.cutFloor, CONTINUITY_QA.cutFactor * median(body));
  const out: number[] = [];
  body.forEach((x, i) => { if (x > floor && (!out.length || (i + head + 1) / s.fps - out[out.length - 1] > 0.25)) out.push((i + head + 1) / s.fps); });
  return out;
}

/** Cuts inside the take that the shot did not plan. `planned` are seconds from the take's start (in-take `[Shot N]`
 *  cuts); `head` frames repeat the previous shot (the cut from them into new picture is the join, not a cut here). */
export function judgeCuts(s: FrameSeries, planned: number[], head = 0): QaCheck {
  const cuts = measuredCuts(s, head);
  const unplanned = cuts.filter((t) => !planned.some((p) => Math.abs(p - t) <= CONTINUITY_QA.cutTolerance));
  const missing = planned.filter((p) => !cuts.some((t) => Math.abs(p - t) <= CONTINUITY_QA.cutTolerance));
  const ok = unplanned.length === 0;
  const fmt = (xs: number[]) => xs.map((t) => `${t.toFixed(2)} s`).join(', ');
  return { name: 'no-unplanned-cut', ok, value: unplanned.length, threshold: `planned: ${planned.length ? fmt(planned) : 'none'}`, detail: `${cuts.length ? `cuts at ${fmt(cuts)}` : 'no cut'}${unplanned.length ? `; unplanned: ${fmt(unplanned)} (the engine cut inside the take — review)` : ''}${missing.length ? `; planned but not seen: ${fmt(missing)}` : ''}` };
}

const words = (t: string) => t.toLowerCase().normalize('NFKC').replace(/[ً-ْـ]/g, '').replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter(Boolean);

/** Speech the take repeats beyond the script: every script phrase of 2+ words (or a one-word line) heard more times
 *  than the script says it. */
export function judgeRepeatedSpeech(script: string[], heard: string): QaCheck {
  const h = words(heard);
  const count = (seq: string[]) => { let n = 0; for (let i = 0; i + seq.length <= h.length; i++) if (seq.every((w, k) => h[i + k] === w)) n++; return n; };
  const repeats: string[] = [];
  const all = script.map(words);
  const seen = new Set<string>();
  for (const line of all) {
    if (!line.length) continue;
    // the line's opening (two words, or the one word of a one-word line) and the whole line: H3 says the start of a
    // short line again to fill the clip ("Thank you, Clara. Thank you.")
    for (const phrase of [line.slice(0, Math.min(2, line.length)), line]) {
      const key = phrase.join(' ');
      if (seen.has(key)) continue;
      seen.add(key);
      const inScript = all.reduce((a, l) => { let c = 0; for (let i = 0; i + phrase.length <= l.length; i++) if (phrase.every((w, k) => l[i + k] === w)) c++; return a + c; }, 0);
      const got = count(phrase);
      if (got > inScript) repeats.push(`“${key}” heard ${got}× (script ${inScript}×)`);
    }
  }
  return { name: 'no-repeated-speech', ok: repeats.length === 0, value: repeats.length, detail: repeats.length ? `${repeats.join('; ')} — the take repeats speech (review; the cut keeps only the line's window)` : 'no phrase repeated beyond the script' };
}

/** Each line heard where the take placed it and about as long as its recording. `placed` are the windows the speech
 *  check found in the take; `recorded` the authoritative recordings' lengths (src/domain/production-context.ts). */
export function judgeLineTiming(lines: Array<{ lineId: string; recordedSeconds?: number; expectedFrom?: number }>, placed: Array<{ lineId: string; from: number; to: number }>): QaCheck {
  const problems: string[] = [];
  let measured = 0;
  for (const l of lines) {
    const w = placed.find((x) => x.lineId === l.lineId);
    if (!w) { problems.push(`${l.lineId} not placed`); continue; }
    measured++;
    if (l.expectedFrom !== undefined && Math.abs(w.from - l.expectedFrom) > CONTINUITY_QA.lineStartTolerance) problems.push(`${l.lineId} starts at ${w.from.toFixed(2)} s, expected ${l.expectedFrom.toFixed(2)} s`);
    if (l.recordedSeconds) { const len = w.to - w.from; if (Math.abs(len - l.recordedSeconds) > l.recordedSeconds * CONTINUITY_QA.lineLengthTolerance) problems.push(`${l.lineId} heard for ${len.toFixed(2)} s, recorded ${l.recordedSeconds.toFixed(2)} s`); }
  }
  return { name: 'dialogue-timing', ok: problems.length === 0, value: measured, threshold: `start ±${CONTINUITY_QA.lineStartTolerance} s, length ±${Math.round(CONTINUITY_QA.lineLengthTolerance * 100)} %`, detail: problems.length ? `${problems.join('; ')} (review)` : `${measured} line(s) on time` };
}

/** What the cut and the export need of a take's file. */
export function judgeContainer(p: Probe, opts: { fps: number; expectAudio: boolean }): QaCheck {
  const problems: string[] = [];
  if (!p.hasVideo) problems.push('no video stream');
  if (p.videoCodec && !['h264', 'hevc'].includes(p.videoCodec)) problems.push(`video codec ${p.videoCodec}`);
  if (p.pixFmt && !['yuv420p', 'yuvj420p'].includes(p.pixFmt)) problems.push(`pixel format ${p.pixFmt}`);
  if (p.fps !== undefined && Math.abs(p.fps - opts.fps) > 0.01) problems.push(`${p.fps.toFixed(3)} fps, not ${opts.fps}`);
  if (opts.expectAudio && !p.hasAudio) problems.push('no audio stream');
  if (p.frames !== undefined && p.durationSeconds !== undefined && Math.abs(p.frames / opts.fps - p.durationSeconds) > 2 / opts.fps + 0.05) problems.push(`${p.frames} frames for ${p.durationSeconds.toFixed(3)} s`);
  return { name: 'container-valid', ok: problems.length === 0, value: `${p.videoCodec ?? '?'} ${p.pixFmt ?? '?'} ${p.fps?.toFixed(2) ?? '?'} fps${p.hasAudio ? ` + ${p.audioCodec}` : ''}`, detail: problems.length ? problems.join('; ') : undefined };
}

/** The model-free continuity checks of one take file. `head`: frames repeating the previous shot (a continuation);
 *  `plannedCuts`: seconds from the take's start; `script`/`heard`: for the repeated-speech check. */
export async function continuityChecks(file: string, opts: { fps: number; head: number; plannedCuts: number[]; script?: string[]; heard?: string }): Promise<QaCheck[]> {
  const frames = await greyFrames(file);
  const s = frameSeries(frames, opts.fps);
  const checks = [judgeFades(s, opts.head), judgeDuplicates(s, opts.head), judgeCuts(s, opts.plannedCuts, opts.head)];
  if (opts.script?.length && opts.heard !== undefined) checks.push(judgeRepeatedSpeech(opts.script, opts.heard));
  return checks;
}
