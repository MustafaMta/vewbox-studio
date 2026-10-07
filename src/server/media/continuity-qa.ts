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
  /** two consecutive frames whose mean absolute difference is under this are duplicates — or, in a still shot, under
   *  `duplicateRelative` × the take's own median frame change (never under `duplicateFloor`): a locked-off camera on a
   *  still subject changes by 0.1–0.3 luma a frame, which is motion, not a repeated frame (Arthur 1.1, 2026-10-06: 49 %
   *  flagged, 0 identical frames) */
  duplicateDiff: 0.35,
  duplicateRelative: 0.15,
  duplicateFloor: 0.02,
  /** duplicates allowed (an engine may hold a frame on a still subject): more than this fraction of frames, or a run
   *  longer than `duplicateRun`, is flagged */
  duplicateFraction: 0.05,
  duplicateRun: 3,
  /** a frame change is a cut when it is over `cutFloor` and over `cutFactor` × the take's median frame change */
  cutFloor: 18,
  cutFactor: 6,
  /** …and only when the frame's structure changes too: 1 − correlation with the frame before over this (a new picture
   *  correlates weakly with the old; a flash of light or a fade keeps the picture, correlation stays high) */
  cutStructure: 0.35,
  /** a planned cut matches a measured one within this many seconds */
  cutTolerance: 0.5,
  /** a line is heard on time when its start is within this many seconds of where the take placed it, and its heard
   *  length within this fraction of its recording */
  lineStartTolerance: 0.6,
  lineLengthTolerance: 0.45,
  basis: 'START values (docs/research/FILM-PIPELINE-RESEARCH-2026-10-05.md §D); calibrate over real H3 takes',
} as const;

/** `structure`: 1 − the Pearson correlation of each frame with the one before (0 for the first) — blind to a change of
 *  brightness or contrast over the whole picture, high when the picture itself changes. */
export interface FrameSeries { means: number[]; diffs: number[]; fps: number; structure?: number[] }

const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (a: Uint8Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; };

/** Pearson correlation of two equal-length frames (1 for a flat frame pair: nothing to compare). */
export function frameCorrelation(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length); if (!n) return 1;
  let sa = 0, sb = 0; for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; cov += x * y; va += x * x; vb += y * y; }
  return va && vb ? cov / Math.sqrt(va * vb) : 1;
}

/** The per-frame series a take's checks read: each frame's mean luma, its difference from the previous frame, and how
 *  much of its structure changed (`structure`). */
export function frameSeries(frames: Uint8Array[], fps: number): FrameSeries {
  return { means: frames.map(mean), diffs: frames.map((f, i) => (i ? meanAbsDiff(frames[i - 1], f) : 0)), structure: frames.map((f, i) => (i ? 1 - frameCorrelation(frames[i - 1], f) : 0)), fps };
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
/** A shot whose own light goes dark on purpose — a flickering lamp, lightning, a blackout (its continuity says so) —
 *  dips to black by design: the dip is reported, not flagged ("The Last Crossing" 1.3: "the bulb sputters, dimming to
 *  near-black before flaring back" read as a fade). Pure (tested). */
export function lightGoesDark(lighting: string | undefined): boolean {
  return /\b(flicker\w*|sputter\w*|strob\w*|lightning|blackout|power cut|goes? (out|dark))\b/i.test(lighting ?? '');
}

export function judgeFades(s: FrameSeries, head = 0, opts: { lightGoesDark?: boolean } = {}): QaCheck {
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
  const dipWords = dips.map((d) => `dips to black at ${((d.from + head) / s.fps).toFixed(2)}–${((d.to + head + 1) / s.fps).toFixed(2)} s`);
  if (opts.lightGoesDark && dipWords.length && !problems.length) return { name: 'no-accidental-fade', ok: true, value: 0, threshold: 'the shot’s own light goes dark', detail: `${dipWords.join('; ')} — the shot’s light flickers or goes out by design, not a fade` };
  problems.push(...dipWords);
  return { name: 'no-accidental-fade', ok: problems.length === 0, value: problems.length, threshold: `no ramp from or to luma < ${CONTINUITY_QA.blackLuma} over ≥ ${CONTINUITY_QA.fadeMinFrames} frames, no black dip`, detail: problems.length ? `${problems.join('; ')} — a fade never hides a continuity problem (review)` : 'no fade or black dip' };
}

/** Identical consecutive frames: their count and the longest run. */
export function judgeDuplicates(s: FrameSeries, head = 0): QaCheck {
  const d = s.diffs.slice(head + 1);
  const limit = Math.min(CONTINUITY_QA.duplicateDiff, Math.max(CONTINUITY_QA.duplicateFloor, CONTINUITY_QA.duplicateRelative * median(d)));
  let dup = 0, run = 0, longest = 0, at = -1, longestAt = -1;
  d.forEach((x, i) => { if (x < limit) { dup++; run++; if (run === 1) at = i; if (run > longest) { longest = run; longestAt = at; } } else run = 0; });
  const fraction = d.length ? dup / d.length : 0;
  const ok = fraction <= CONTINUITY_QA.duplicateFraction && longest <= CONTINUITY_QA.duplicateRun;
  return { name: 'no-duplicate-frames', ok, value: dup, threshold: `≤ ${Math.round(CONTINUITY_QA.duplicateFraction * 100)} % of frames, runs ≤ ${CONTINUITY_QA.duplicateRun}`, detail: ok ? `${dup} repeated frame(s) of ${d.length}` : `${dup} repeated frame(s) of ${d.length} (${(fraction * 100).toFixed(1)} %), longest run ${longest} at ${((longestAt + head + 1) / s.fps).toFixed(2)} s (review)` };
}

/** The picture's hard changes (cuts) inside the take, in seconds from the take's start. */
export function measuredCuts(s: FrameSeries, head = 0): number[] {
  const body = s.diffs.slice(head + 1);
  const floor = Math.max(CONTINUITY_QA.cutFloor, CONTINUITY_QA.cutFactor * median(body));
  // A CUT CHANGES THE PICTURE, NOT ONLY ITS LIGHT: lightning in a storm swung every pixel's level and read as two cuts
  // in a continuous shot (2026-10-08, "The Last Crossing" 1.3); a change counts only when the frame's structure changes
  const structure = s.structure?.slice(head + 1);
  const out: number[] = [];
  body.forEach((x, i) => {
    const restructured = !structure || structure[i] > CONTINUITY_QA.cutStructure;
    if (x > floor && restructured && (!out.length || (i + head + 1) / s.fps - out[out.length - 1] > 0.25)) out.push((i + head + 1) / s.fps);
  });
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

// ------------------------------------------------------------------------------------------------ colour continuity

/** COLOUR CONTINUITY ACROSS A JOIN (research T5(d), decided 2026-10-05 and built 2026-10-06; final directive §24
 *  "stable lighting"): the mean luma and chroma (8-bit Y, U, V) of the first new frames of a take against the last
 *  frames the audience sees of the shot before it. Chained generations drift in white balance and grade (the community's
 *  ColorMatch nodes exist for this); a cut on the same moment should keep the light and the grade too, within a wider
 *  margin since the framing changes. FLAG ONLY — never auto-graded, never a rejection. START thresholds. */
export const COLOUR_QA = {
  /** frames compared on each side of the join */
  frames: { CONTINUATION: 12, CUT: 24 },
  /** largest |ΔU| or |ΔV| (8-bit levels) before the join is flagged */
  chroma: { CONTINUATION: 4, CUT: 8 },
  /** largest |ΔY| (8-bit levels) */
  luma: { CONTINUATION: 12, CUT: 25 },
  basis: 'START (research T5(d), G12): calibrate on real H3 joins',
} as const;

const CW = 64, CH = 36;
export interface ColourMeans { y: number; u: number; v: number; frames: number }

/** Every frame of a file at 64×36, planar 8-bit YUV 4:4:4. */
export async function colourFrames(file: string): Promise<Uint8Array[]> {
  const { execFile } = await import('node:child_process');
  const stdout = await new Promise<Buffer>((resolve, reject) => execFile('ffmpeg', ['-v', 'error', '-i', file, '-an', '-vf', `scale=${CW}:${CH}:flags=area,format=yuv444p`, '-f', 'rawvideo', '-'], { encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 }, (e, out) => (e ? reject(e) : resolve(out))));
  const size = CW * CH * 3; const out: Uint8Array[] = [];
  for (let o = 0; o + size <= stdout.byteLength; o += size) out.push(new Uint8Array(stdout.buffer, stdout.byteOffset + o, size));
  return out;
}

/** The mean Y, U, V of a run of planar 4:4:4 frames. */
export function colourMeansOf(frames: Uint8Array[]): ColourMeans {
  const plane = CW * CH; let y = 0, u = 0, v = 0;
  for (const f of frames) { for (let i = 0; i < plane; i++) { y += f[i]; u += f[plane + i]; v += f[2 * plane + i]; } }
  const n = Math.max(1, frames.length * plane);
  return { y: y / n, u: u / n, v: v / n, frames: frames.length };
}

/** The join's colour against the shot before it. */
export function judgeColourMatch(before: ColourMeans, after: ColourMeans, relation: 'CONTINUATION' | 'CUT'): QaCheck {
  const dy = after.y - before.y, du = after.u - before.u, dv = after.v - before.v;
  const chroma = Math.max(Math.abs(du), Math.abs(dv));
  const ok = chroma <= COLOUR_QA.chroma[relation] && Math.abs(dy) <= COLOUR_QA.luma[relation];
  const f = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}`;
  return { name: 'colour-continuity', ok, value: Number(chroma.toFixed(2)), threshold: `|ΔU|,|ΔV| ≤ ${COLOUR_QA.chroma[relation]}, |ΔY| ≤ ${COLOUR_QA.luma[relation]} (${relation === 'CONTINUATION' ? 'continuous' : 'cut on the same moment'})`, detail: `against the end of the shot before: ΔY ${f(dy)}, ΔU ${f(du)}, ΔV ${f(dv)} over ${before.frames}/${after.frames} frames${ok ? '' : ' — the light or the grade shifts at the join (review; never graded automatically)'}` };
}

/** The colour of the last `n` frames the cut shows of the previous take (its window ending at `endFrame`, else its file
 *  end) against this take's first `n` new frames (after `head`). */
export async function colourJoin(previousFile: string, file: string, opts: { previousEndFrame?: number; head: number; relation: 'CONTINUATION' | 'CUT' }): Promise<QaCheck> {
  const n = COLOUR_QA.frames[opts.relation];
  const [prev, cur] = await Promise.all([colourFrames(previousFile), colourFrames(file)]);
  const end = Math.min(prev.length, opts.previousEndFrame ?? prev.length);
  return judgeColourMatch(colourMeansOf(prev.slice(Math.max(0, end - n), end)), colourMeansOf(cur.slice(opts.head, opts.head + n)), opts.relation);
}

/** The model-free continuity checks of one take file. `head`: frames repeating the previous shot (a continuation);
 *  `plannedCuts`: seconds from the take's start; `script`/`heard`: for the repeated-speech check; `colour`: the shot
 *  before it in the same scene (its file, where its window ends), for the colour join. */
export async function continuityChecks(file: string, opts: { fps: number; head: number; plannedCuts: number[]; script?: string[]; heard?: string; colour?: { previousFile: string; previousEndFrame?: number; relation: 'CONTINUATION' | 'CUT' }; lighting?: string }): Promise<QaCheck[]> {
  const frames = await greyFrames(file);
  const s = frameSeries(frames, opts.fps);
  const checks = [judgeFades(s, opts.head, { lightGoesDark: lightGoesDark(opts.lighting) }), judgeDuplicates(s, opts.head), judgeCuts(s, opts.plannedCuts, opts.head)];
  if (opts.script?.length && opts.heard !== undefined) checks.push(judgeRepeatedSpeech(opts.script, opts.heard));
  if (opts.colour) {
    try { checks.push(await colourJoin(opts.colour.previousFile, file, { previousEndFrame: opts.colour.previousEndFrame, head: opts.head, relation: opts.colour.relation })); } catch (e) { checks.push({ name: 'colour-continuity', ok: true, detail: `not measured (${(e as Error).message.split('\n')[0]})` }); }
  }
  return checks;
}
