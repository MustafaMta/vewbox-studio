import fsp from 'node:fs/promises';
import path from 'node:path';
import { StudioError } from '@/domain/errors';
import { env } from '../env';
import { guardedEngineUrl } from '../gpu/lease-db';
import { followJobSignal, stopReasonOf } from '../jobs/context';

/** THE ALIGNMENT AND PICTURE-QA CLIENT — the `asr` service's /align, /qa/mouth and /qa/identity (docker/asr/align.py,
 *  qa.py; docs/research/FILM-PIPELINE-RESEARCH-2026-10-05.md §B, §C.2 Tier 1, §D). Same service and URL as
 *  transcription (ASR_URL, src/server/providers/speech.ts).
 *
 *  Measuring is optional, never a reason to stop a job: when the service, a capability or its weights are offline, or
 *  the service refuses the input, every call answers `{ available: false, reason }` instead of throwing. It throws
 *  only for programmer errors (bad arguments, a local file that does not exist) and rethrows a stopped job's reason.
 *  The judges turn answers into PASS / REVIEW / FAIL / NOT_MEASURED; every threshold is a START value to calibrate on
 *  real H3 takes on the workstation (research §4 G1, G2, G5, G7) — none was measured yet. */

export interface QaUnavailable { available: false; reason: string; status?: number }
export type QaAnswer<T> = T | QaUnavailable;
export const isQaUnavailable = (x: unknown): x is QaUnavailable => typeof x === 'object' && x !== null && (x as { available?: unknown }).available === false;

export type QaVerdict = 'PASS' | 'REVIEW' | 'FAIL' | 'NOT_MEASURED';

// ------------------------------------------------------------------------------------------------ answers

export interface AlignedWord { text: string; norm: string; start: number | null; end: number | null; score: number | null; aligned: boolean }
export interface AlignedChar { char: string; word: number; start: number | null; end: number | null; score: number | null }
export interface AlignResult {
  available: true; language: 'en' | 'ar'; model: string; device: string; vocabMode: string; duration: number;
  words: AlignedWord[]; chars?: AlignedChar[];
  /** Share of script words with at least one aligned character; `charCoverage` the share of characters in the model's vocabulary. */
  coverage: number; charCoverage: number; meanScore: number | null; unalignedWords: string[];
  scoreFloor: number; frameSeconds: number; frames: number; tokens: number; ms: number;
}

export type MouthFlag = 'MOUTH_STILL_WHILE_SPEAKING' | 'MOUTH_MOVING_WHILE_SILENT' | 'NON_SPEAKER_TALKING' | 'EXTRA_SINGER' | 'LAG_AT_SEARCH_EDGE';
export interface MouthTrack {
  id: number; frames: number; firstFrame: number; lastFrame: number; meanBox: number[]; faceHeightPx: number;
  scored: boolean; reason?: string;
  /** Mean |dMAR/dt| (mouth-aperture units per second) inside and outside the speech frames, and their ratio. */
  activityInside?: number | null; activityOutside?: number | null; activityRatio?: number | null; insideFrames?: number; outsideFrames?: number;
  corrLag0?: number | null; corrBest?: number | null;
  /** Positive: the mouth moves LATER than the sound (picture late); delaying the audio by this many frames lines them up. */
  bestLagFrames?: number | null; bestLagMs?: number | null; lagAtSearchEdge?: boolean;
  isSpeaker: boolean; flags: MouthFlag[];
}
export interface MouthResult {
  available: true; fps: number; frames: number; duration: number; size: number[];
  audioSource: 'upload' | 'video'; audioOffset: number; windowsSource: 'windows' | 'energy'; speechFrames: number; facesPerFrameMax: number;
  maxLagFrames: number; mode: 'speech' | 'singing'; tracks: MouthTrack[]; speakerTracks: number[];
  thresholds: Record<string, number>; syncnet: { available: boolean; reason?: string }; model: string; ms: number;
}

export interface IdentityFrame { t: number; cosine: number | null; box: number[] | null }
export interface IdentitySummary { frames: number; framesWithFace: number; min: number | null; median: number | null; mean: number | null; p10: number | null; belowThreshold: number; shareBelow: number | null; drift: number | null; threshold: number }
export interface IdentityCharacter { reference: { available: boolean; reason?: string; facesInReference?: number; faceBox?: number[]; score?: number }; series: IdentityFrame[]; summary: IdentitySummary | null }
export interface IdentityResult {
  available: true; sampleFps: number; frames: number; facesPerFrameMax: number; size: number[];
  /** Keyed by the characterIds sent. */
  characters: Record<string, IdentityCharacter>;
  threshold: number; reviewBelow: number; driftReview: number; model: string; ms: number;
}

// ------------------------------------------------------------------------------------------------ transport

const base = () => guardedEngineUrl(env().ASR_URL.replace(/\/$/, ''), 'the QA service'); // one card, one lease (gpu/lease-db.ts)

const camelKey = (k: string) => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
/** snake_case keys → camelCase, deep; the keys of a `characters` map are ids and stay as sent. */
export function camelize(v: unknown, keepKeys = false): unknown {
  if (Array.isArray(v)) return v.map((x) => camelize(x));
  if (v === null || typeof v !== 'object') return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[keepKeys ? k : camelKey(k)] = camelize(x, !keepKeys && k === 'characters');
  return out;
}

async function call<T>(route: string, fd: FormData, timeoutMs: number): Promise<QaAnswer<T>> {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const unlink = followJobSignal(ctrl); // a stopped job aborts the request (src/server/jobs/context.ts)
  try {
    const res = await fetch(`${base()}${route}`, { method: 'POST', body: fd, signal: ctrl.signal });
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      let detail: unknown = text; try { detail = (JSON.parse(text) as { detail?: unknown }).detail ?? text; } catch { /* plain text */ }
      if (typeof detail !== 'string') detail = JSON.stringify(detail);
      const why = res.status === 404 ? `the asr service has no ${route} (an older image: rebuild docker/asr)` : (detail as string).slice(0, 400) || `HTTP ${res.status}`;
      return { available: false, reason: `${route}: ${why}`, status: res.status };
    }
    let j: unknown;
    try { j = JSON.parse(text); } catch { return { available: false, reason: `${route}: the answer is not JSON`, status: res.status }; }
    if (typeof j !== 'object' || j === null) return { available: false, reason: `${route}: the answer is not an object`, status: res.status };
    return { ...(camelize(j) as T & object), available: true } as T;
  } catch (e) {
    const stop = stopReasonOf(ctrl.signal);
    if (stop) throw stop; // the job was stopped: not "offline"
    const cause = (e as Error & { cause?: { code?: string; message?: string } }).cause;
    const why = cause?.code ?? cause?.message ?? (e as Error).message;
    const timedOut = (e as Error).name === 'AbortError' || /TIMEOUT/i.test(why);
    return { available: false, reason: timedOut ? `${route} did not answer within ${Math.round(timeoutMs / 1000)} s (${why})` : `${route}: the asr service is not reachable (${why})` };
  } finally { clearTimeout(t); unlink(); }
}

async function blob(file: string, what: string): Promise<[Blob, string]> {
  try { return [new Blob([await fsp.readFile(file)]), path.basename(file)]; } catch (e) { throw new StudioError('INVALID', `${what}: ${file} cannot be read (${(e as NodeJS.ErrnoException).code ?? (e as Error).message})`); }
}

const finite = (v: unknown, name: string, lo: number, hi: number) => {
  if (v === undefined) return;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new StudioError('INVALID', `${name} must be a number within ${lo}–${hi}`);
};

// ------------------------------------------------------------------------------------------------ calls

/** Word (and character) times of the KNOWN script text in an audio file. `start`/`end` crop the file first (times stay
 *  in file time); one call aligns at most ALIGN_MAX_AUDIO_S (180 s) — align per line or lyric section. */
export async function alignScript(file: string, text: string, language: 'en' | 'ar', opts: { start?: number; end?: number; chars?: boolean; timeoutMs?: number } = {}): Promise<QaAnswer<AlignResult>> {
  if (language !== 'en' && language !== 'ar') throw new StudioError('INVALID', `alignScript: language must be 'en' or 'ar', got ${String(language)}`);
  if (typeof text !== 'string' || !text.trim()) throw new StudioError('INVALID', 'alignScript: the text is empty');
  finite(opts.start, 'start', 0, 86_400); finite(opts.end, 'end', 0, 86_400);
  if (opts.start !== undefined && opts.end !== undefined && opts.end <= opts.start) throw new StudioError('INVALID', 'alignScript: end must be after start');
  const fd = new FormData();
  const [b, name] = await blob(file, 'alignScript');
  fd.set('file', b, name);
  fd.set('text', text);
  fd.set('language', language);
  if (opts.start !== undefined) fd.set('start', String(opts.start));
  if (opts.end !== undefined) fd.set('end', String(opts.end));
  fd.set('chars', opts.chars === false ? '0' : '1');
  return call<AlignResult>('/align', fd, opts.timeoutMs ?? 5 * 60_000);
}

/** Qwen3-ASR-1.7B (the primary recogniser): the text and the language the model DETECTED. `language` forces one —
 *  never a check: forced to Arabic on English speech it translated the line (measured 2026-10-07), so a forced
 *  answer has `detectedLanguage: null`. */
export interface QwenTranscript { model: string; detectedLanguage: string | null; forcedLanguage: string | null; text: string; ms: number; duration: number }
export async function transcribeQwen(file: string, opts: { language?: 'ar' | 'en'; timeoutMs?: number } = {}): Promise<QaAnswer<QwenTranscript>> {
  const fd = new FormData();
  const [b, name] = await blob(file, 'transcribeQwen');
  fd.set('file', b, name);
  fd.set('language', opts.language ?? 'auto');
  return call<QwenTranscript>('/transcribe_qwen', fd, opts.timeoutMs ?? 5 * 60_000);
}

/** The phonemes heard in each dialect word (چ/گ) of a KNOWN Arabic line — the Iraqi phonology gate's evidence
 *  (judged by src/server/media/iraqi-phonology.ts). */
export interface PhonemeAnswer { model: string; alignModel?: string; coverage?: number; words: import('@/server/media/iraqi-phonology').HeardWord[]; duration: number; ms: number }
export async function dialectPhonemes(file: string, text: string, opts: { every?: boolean; timeoutMs?: number } = {}): Promise<QaAnswer<PhonemeAnswer>> {
  if (typeof text !== 'string' || !text.trim()) throw new StudioError('INVALID', 'dialectPhonemes: the text is empty');
  const fd = new FormData();
  const [b, name] = await blob(file, 'dialectPhonemes');
  fd.set('file', b, name);
  fd.set('text', text);
  fd.set('language', 'ar');
  fd.set('every', opts.every ? '1' : '0');
  return call<PhonemeAnswer>('/qa/phonemes', fd, opts.timeoutMs ?? 5 * 60_000);
}

export interface MouthOptions {
  /** The audio that will play in the cut (the authoritative line or the vocal stem); default: the video's own track. */
  audio?: string;
  /** Where `audio` starts in the clip, seconds (the line's planned offset in the shot); negative cuts its head. */
  audioOffset?: number;
  /** Speech or word windows in seconds (e.g. the words of an alignScript answer); default: an energy VAD on the audio. */
  windows?: Array<{ start: number; end: number }>;
  fps?: number; mode?: 'speech' | 'singing'; speakers?: number; maxLagMs?: number; timeoutMs?: number;
}

/** Tier-1 lip-sync: every face track's mouth activity against the speech of the audio that plays in the cut. */
export async function mouthActivity(video: string, opts: MouthOptions = {}): Promise<QaAnswer<MouthResult>> {
  finite(opts.fps, 'fps', 1, 120); finite(opts.speakers, 'speakers', 0, 8); finite(opts.maxLagMs, 'maxLagMs', 0, 2000); finite(opts.audioOffset, 'audioOffset', -600, 600);
  if (opts.audioOffset !== undefined && !opts.audio) throw new StudioError('INVALID', 'mouthActivity: audioOffset needs audio');
  if (opts.mode !== undefined && opts.mode !== 'speech' && opts.mode !== 'singing') throw new StudioError('INVALID', `mouthActivity: mode must be speech or singing`);
  for (const w of opts.windows ?? []) if (!Number.isFinite(w.start) || !Number.isFinite(w.end) || w.end < w.start) throw new StudioError('INVALID', `mouthActivity: bad speech window ${JSON.stringify(w)}`);
  const fd = new FormData();
  const [v, vname] = await blob(video, 'mouthActivity video');
  fd.set('video', v, vname);
  if (opts.audio) { const [a, aname] = await blob(opts.audio, 'mouthActivity audio'); fd.set('audio', a, aname); }
  if (opts.audioOffset !== undefined) fd.set('audio_offset', String(opts.audioOffset));
  if (opts.windows) fd.set('windows', JSON.stringify(opts.windows.map((w) => ({ start: w.start, end: w.end }))));
  if (opts.fps !== undefined) fd.set('fps', String(opts.fps));
  fd.set('mode', opts.mode ?? 'speech');
  fd.set('speakers', String(Math.trunc(opts.speakers ?? 1)));
  fd.set('max_lag_ms', String(opts.maxLagMs ?? 200));
  return call<MouthResult>('/qa/mouth', fd, opts.timeoutMs ?? 10 * 60_000);
}

/** SFace cosine of each character's canonical face against the faces of frames sampled at `sampleFps` (default 2). */
export async function faceIdentity(video: string, refs: Array<{ characterId: string; image: string }>, opts: { sampleFps?: number; timeoutMs?: number } = {}): Promise<QaAnswer<IdentityResult>> {
  if (!Array.isArray(refs) || refs.length === 0) throw new StudioError('INVALID', 'faceIdentity: at least one reference image is needed');
  const ids = refs.map((r) => r.characterId);
  if (ids.some((id) => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) throw new StudioError('INVALID', 'faceIdentity: characterIds must be non-empty and unique (one canonical image each)');
  finite(opts.sampleFps, 'sampleFps', 0.1, 30);
  const fd = new FormData();
  const [v, vname] = await blob(video, 'faceIdentity video');
  fd.set('video', v, vname);
  for (const r of refs) { const [b, name] = await blob(r.image, `faceIdentity reference of ${r.characterId}`); fd.append('references', b, name); }
  fd.set('characters', JSON.stringify(ids)); // in file order
  fd.set('sample_fps', String(opts.sampleFps ?? 2));
  return call<IdentityResult>('/qa/identity', fd, opts.timeoutMs ?? 10 * 60_000);
}

/** Face boxes on one still picture, in its own pixels, largest first (YuNet; `POST /qa/faces`). */
export interface FacesResult { width: number; height: number; faces: Array<{ box: [number, number, number, number]; score: number }>; detector: string; ms?: number }
export async function detectFaces(image: string, opts: { timeoutMs?: number } = {}): Promise<QaAnswer<FacesResult>> {
  const fd = new FormData();
  const [b, name] = await blob(image, 'detectFaces');
  fd.set('image', b, name);
  return call<FacesResult>('/qa/faces', fd, opts.timeoutMs ?? 60_000);
}

// ------------------------------------------------------------------------------------------------ judges

const RANK: Record<QaVerdict, number> = { PASS: 0, NOT_MEASURED: 1, REVIEW: 2, FAIL: 3 };
const worst = (vs: QaVerdict[]): QaVerdict => vs.reduce<QaVerdict>((a, b) => (RANK[b] > RANK[a] ? b : a), 'PASS');

/** START (research §C.2/§C.4; calibrate on G1/G2). Correlation is MAR against the speech envelope at the best lag. */
export const LIPSYNC_THRESHOLDS_START = {
  corrPass: 0.3, corrFail: 0.1, ratioPass: 1.3, ratioFail: 1.0,
  /** |lag| ≤ this passes; up to `lagRepairMaxFrames` an audio shift repairs it (REVIEW + offsetRepair); beyond, FAIL. */
  lagPassFrames: 1, lagRepairMaxFrames: 6,
  minSpeechFrames: 12, minVisibleShare: 0.5,
} as const;
export type LipSyncThresholds = { [K in keyof typeof LIPSYNC_THRESHOLDS_START]: number };

export interface LipSyncJudgement {
  ok: boolean; verdict: QaVerdict; lagFrames: number | null; lagMs: number | null; speakerTrack: number | null;
  /** True when the only problem is an offset an audio shift of `lagFrames` would repair (research §C.2 step 4). */
  offsetRepair: boolean; flags: Array<{ track: number; flag: MouthFlag }>; detail: string[];
}

/** One clip's lip-sync verdict. `speakerTrack` names the track that must be speaking (from identity); default: the
 *  track the service found following the audio best. */
export function judgeLipSync(result: QaAnswer<MouthResult>, thresholds: LipSyncThresholds = LIPSYNC_THRESHOLDS_START, opts: { speakerTrack?: number } = {}): LipSyncJudgement {
  const out = (verdict: QaVerdict, detail: string[], rest: Partial<LipSyncJudgement> = {}): LipSyncJudgement => ({ ok: verdict === 'PASS', verdict, lagFrames: null, lagMs: null, speakerTrack: null, offsetRepair: false, flags: [], detail, ...rest });
  if (isQaUnavailable(result)) return out('NOT_MEASURED', [`not measured: ${result.reason}`]);
  const flags = result.tracks.flatMap((t) => t.flags.map((flag) => ({ track: t.id, flag })));
  if (result.speechFrames < thresholds.minSpeechFrames) return out('NOT_MEASURED', [`not measured: ${result.speechFrames} speech frames in the audio (< ${thresholds.minSpeechFrames})`], { flags });
  if (result.tracks.length === 0) return out('NOT_MEASURED', ['not measured: no face found in the clip'], { flags });
  const id = opts.speakerTrack ?? result.speakerTracks[0];
  const sp = result.tracks.find((t) => t.id === id);
  if (id === undefined || !sp) return out('NOT_MEASURED', [`not measured: ${id === undefined ? 'no scored face track (all tracks too short)' : `track ${id} is not in the answer`}`], { flags });
  if (!sp.scored) return out('NOT_MEASURED', [`not measured: speaker track ${sp.id} ${sp.reason ?? 'was not scored'}`], { flags, speakerTrack: sp.id });
  const lag = sp.bestLagFrames ?? null;
  const lagMs = sp.bestLagMs ?? null;
  const fail: string[] = []; const review: string[] = [];
  let offsetRepair = false;
  const r = sp.corrBest ?? null; const ratio = sp.activityRatio ?? null;
  if (sp.flags.includes('MOUTH_STILL_WHILE_SPEAKING')) fail.push(`speaker track ${sp.id}: the mouth stays still while the line plays (activity ${fmt(sp.activityInside)})`);
  if (r !== null && r < thresholds.corrFail && (ratio === null || ratio < thresholds.ratioFail)) fail.push(`speaker track ${sp.id}: the mouth does not follow the audio (r ${fmt(r)}, activity ratio ${fmt(ratio)})`);
  if (lag !== null && Math.abs(lag) > thresholds.lagRepairMaxFrames) fail.push(`offset ${lag} frames (> ${thresholds.lagRepairMaxFrames})`);
  else if (lag !== null && Math.abs(lag) > thresholds.lagPassFrames) { offsetRepair = true; review.push(`offset ${lag} frames (${lagMs} ms): shift the audio by ${lag} frames and re-score`); }
  if (sp.lagAtSearchEdge) review.push(`the best lag is at the edge of the ±${result.maxLagFrames}-frame search: the true offset may be larger`);
  if (r === null) review.push(`speaker track ${sp.id}: no correlation could be computed`);
  else if (r < thresholds.corrPass) review.push(`speaker track ${sp.id}: weak correlation with the audio (r ${fmt(r)} < ${thresholds.corrPass})`);
  if (ratio !== null && ratio < thresholds.ratioPass) review.push(`speaker track ${sp.id}: mouth activity inside speech only ${fmt(ratio)}× outside (< ${thresholds.ratioPass})`);
  if (sp.flags.includes('MOUTH_MOVING_WHILE_SILENT')) review.push(`speaker track ${sp.id}: the mouth moves while nothing is said`);
  const visible = (sp.insideFrames ?? 0) / Math.max(1, result.speechFrames);
  if (visible < thresholds.minVisibleShare) review.push(`speaker track ${sp.id} is visible in ${Math.round(visible * 100)} % of the speech frames`);
  if (opts.speakerTrack !== undefined && result.speakerTracks.length > 0 && !result.speakerTracks.includes(opts.speakerTrack)) review.push(`track ${result.speakerTracks[0]} follows the audio better than the expected speaker (track ${opts.speakerTrack})`);
  for (const t of result.tracks) {
    if (t.id === sp.id) continue;
    for (const f of t.flags) if (f === 'NON_SPEAKER_TALKING' || f === 'EXTRA_SINGER') review.push(`track ${t.id}: ${f === 'EXTRA_SINGER' ? 'an extra singer — the mouth moves with the vocals' : 'a non-speaker whose mouth moves with the speech'} (r ${fmt(t.corrBest)})`);
  }
  const verdict: QaVerdict = fail.length ? 'FAIL' : review.length ? 'REVIEW' : 'PASS';
  return { ok: verdict === 'PASS', verdict, lagFrames: lag, lagMs, speakerTrack: sp.id, offsetRepair: offsetRepair && !fail.length, flags, detail: [...fail, ...review] };
}

/** START (research §D): fail < 0.363 (OpenCV's SFace same-identity cosine), review 0.363–0.50, pass ≥ 0.50; facial
 *  drift within a take reviewed above 0.15. Realistic faces only: SFace is advisory on stylised faces. */
export const IDENTITY_THRESHOLDS_START = { fail: 0.363, review: 0.5, drift: 0.15, minFramesWithFace: 2 } as const;

export interface IdentityJudgement {
  ok: boolean; verdict: QaVerdict; detail: string[];
  characters: Record<string, { verdict: QaVerdict; median: number | null; min: number | null; framesWithFace: number; detail: string[] }>;
}

/** Every character's verdict on the median of its per-frame cosine, and the worst of them for the clip. */
export function judgeIdentity(result: QaAnswer<IdentityResult>, threshold: number = IDENTITY_THRESHOLDS_START.fail, opts: { review?: number; drift?: number; minFramesWithFace?: number } = {}): IdentityJudgement {
  if (isQaUnavailable(result)) return { ok: false, verdict: 'NOT_MEASURED', detail: [`not measured: ${result.reason}`], characters: {} };
  const review = Math.max(threshold, opts.review ?? IDENTITY_THRESHOLDS_START.review);
  const driftMax = opts.drift ?? IDENTITY_THRESHOLDS_START.drift;
  const minFrames = opts.minFramesWithFace ?? IDENTITY_THRESHOLDS_START.minFramesWithFace;
  const characters: IdentityJudgement['characters'] = {};
  for (const [id, c] of Object.entries(result.characters)) {
    const s = c.summary;
    const d: string[] = [];
    let v: QaVerdict;
    if (!c.reference.available || !s) { v = 'NOT_MEASURED'; d.push(`${id}: ${c.reference.reason ?? 'no reference face'}`); }
    else if (s.framesWithFace === 0) { v = 'REVIEW'; d.push(`${id}: not found in any of ${s.frames} sampled frames`); }
    else if (s.framesWithFace < minFrames) { v = 'REVIEW'; d.push(`${id}: found in only ${s.framesWithFace} of ${s.frames} sampled frames`); }
    else if ((s.median ?? 0) < threshold) { v = 'FAIL'; d.push(`${id}: median SFace cosine ${fmt(s.median)} < ${threshold}`); }
    else {
      v = 'PASS';
      if ((s.median ?? 0) < review) { v = 'REVIEW'; d.push(`${id}: median SFace cosine ${fmt(s.median)} < ${review}`); }
      if (s.min !== null && s.min < threshold) { v = 'REVIEW'; d.push(`${id}: ${s.belowThreshold} frame(s) below ${threshold} (min ${fmt(s.min)})`); }
      if (s.drift !== null && s.drift > driftMax) { v = 'REVIEW'; d.push(`${id}: identity drifts ${fmt(s.drift)} from the first frame (> ${driftMax})`); }
    }
    characters[id] = { verdict: v, median: s?.median ?? null, min: s?.min ?? null, framesWithFace: s?.framesWithFace ?? 0, detail: d };
  }
  const all = Object.values(characters);
  if (all.length === 0) return { ok: false, verdict: 'NOT_MEASURED', detail: ['not measured: no character in the answer'], characters };
  const verdict = worst(all.map((c) => c.verdict));
  return { ok: verdict === 'PASS', verdict, detail: all.flatMap((c) => c.detail), characters };
}

/** START (research §B.2; calibrate on G5). */
export const ALIGNMENT_THRESHOLDS_START = { coveragePass: 0.95, coverageFail: 0.8 } as const;

export interface AlignmentJudgement {
  ok: boolean; verdict: QaVerdict; coverage: number | null; meanScore: number | null; scoreFloor: number | null;
  words: Array<{ text: string; start: number | null; end: number | null; score: number | null; aligned: boolean }>;
  unaligned: string[]; lowScore: string[]; detail: string[];
}

/** The script's words as the service counts them: whitespace tokens holding a letter or a digit. */
export const scriptWords = (script: string) => script.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t));

/** Coverage of the script and the per-word timings. FAIL below `coverageFail`, REVIEW below `coveragePass`, when the
 *  mean character score is under the service's floor, or when the word count disagrees with the script. */
export function judgeAlignment(result: QaAnswer<AlignResult>, script: string, opts: { coveragePass?: number; coverageFail?: number; scoreFloor?: number } = {}): AlignmentJudgement {
  if (isQaUnavailable(result)) return { ok: false, verdict: 'NOT_MEASURED', coverage: null, meanScore: null, scoreFloor: null, words: [], unaligned: [], lowScore: [], detail: [`not measured: ${result.reason}`] };
  const pass = opts.coveragePass ?? ALIGNMENT_THRESHOLDS_START.coveragePass;
  const failBelow = opts.coverageFail ?? ALIGNMENT_THRESHOLDS_START.coverageFail;
  const floor = opts.scoreFloor ?? result.scoreFloor;
  const expected = scriptWords(script);
  const words = result.words.map((w) => ({ text: w.text, start: w.start, end: w.end, score: w.score, aligned: w.aligned }));
  const alignedCount = words.filter((w) => w.aligned).length;
  const coverage = expected.length ? Math.min(1, alignedCount / expected.length) : 0;
  const unaligned = words.filter((w) => !w.aligned).map((w) => w.text);
  const lowScore = words.filter((w) => w.aligned && w.score !== null && w.score < floor).map((w) => w.text);
  const detail: string[] = [];
  let verdict: QaVerdict = 'PASS';
  const bump = (v: QaVerdict) => { verdict = worst([verdict, v]); };
  if (expected.length === 0) { bump('NOT_MEASURED'); detail.push('the script has no words'); }
  if (words.length !== expected.length) { bump('REVIEW'); detail.push(`the service aligned ${words.length} words, the script has ${expected.length}`); }
  else if (words.some((w, i) => w.text !== expected[i])) { bump('REVIEW'); detail.push('the aligned words are not the script\'s words (a different script was sent?)'); }
  if (coverage < failBelow) { bump('FAIL'); detail.push(`coverage ${fmt(coverage)} < ${failBelow}`); }
  else if (coverage < pass) { bump('REVIEW'); detail.push(`coverage ${fmt(coverage)} < ${pass}`); }
  if (unaligned.length) detail.push(`unaligned (timed from their neighbours): ${unaligned.join(' ')}`);
  if (result.meanScore !== null && result.meanScore < floor) { bump('REVIEW'); detail.push(`mean score ${fmt(result.meanScore)} < floor ${floor}`); }
  if (lowScore.length) detail.push(`low-score words: ${lowScore.join(' ')}`);
  return { ok: verdict === 'PASS', verdict, coverage, meanScore: result.meanScore, scoreFloor: floor, words, unaligned, lowScore, detail };
}

function fmt(x: number | null | undefined): string { return x === null || x === undefined ? 'n/a' : x.toFixed(2); }
