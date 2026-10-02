import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { StudioError } from '@/domain/errors';
import type { Language } from '@/domain/vocabulary';
import { ffprobe } from '../media';
import { ffmpeg } from './ffmpeg';

const execFileP = promisify(execFile);

/** VOICE REFERENCE MEASUREMENT — pure helpers on a local file with ffmpeg/ffprobe, no GPU: what a recording is
 *  (duration, rate, channels), how loud it is (EBU R128 integrated loudness and true peak), whether it clips, where
 *  the speech is (silence boundaries), and the static-gain trim that makes the 24 kHz mono window the engines clone
 *  from. `validateVoiceReference` fills the contract's `VoiceReferenceValidation` except the ASR fields, which the
 *  voice handler adds from the transcription service. */

export interface AudioFacts { durationSeconds: number; sampleRate: number; channels: number; codec?: string; container?: string }
export interface Loudness { integratedLufs: number; truePeakDbtp: number; loudnessRange: number; threshold: number }
export interface Clipping { clippedSamples: number; totalSamples: number; ratio: number; flatFactor: number; peakDbfs: number }
export interface SpeechWindow { from: number; to: number; seconds: number; /** a single run of speech longer than the limit had to be cut inside it */ cutMidSpeech?: boolean }
export type VoiceReferenceRefusal = 'TOO_SHORT' | 'TOO_LONG' | 'NO_SPEECH' | 'TOO_QUIET' | 'CLIPPING' | 'WRONG_LANGUAGE' | 'BAD_FORMAT';

/** The contract's validation record (CONTRACTS-CHARACTER-VOICE §1.4). Everything but `speech` is measured here. */
export interface VoiceReferenceValidation {
  ok: boolean; code?: VoiceReferenceRefusal; message?: string; reasons: string[];
  durationSeconds: number; sampleRate: number; channels: number; codec?: string;
  integratedLufs: number; truePeakDbtp: number; loudnessRange?: number;
  clipping: Clipping;
  /** seconds above the silence floor, and the window that would be sent to the engine */
  speechSeconds: number; window?: SpeechWindow;
  /** the language the character speaks; the ASR pass compares `speech.language` with it (WRONG_LANGUAGE) */
  expectedLanguage?: Language;
  /** filled by the voice handler from the transcription service: ≥ 3 words, detected language */
  speech?: { present: boolean; words: number; language: Language | 'UNKNOWN'; transcript: string; confidence: number };
}

export const REFERENCE_RULES = { minSeconds: 3, maxSeconds: 30, minSampleRate: 16000, minLufs: -30, maxLufs: -10, maxClippingRatio: 0.001, minSpeechSeconds: 1, windowSeconds: 12, targetLufs: -20, ceilingDbtp: -1 } as const;

const seek = (w?: { from: number; to: number }) => (w ? ['-ss', Math.max(0, w.from).toFixed(3), '-t', Math.max(0.1, w.to - w.from).toFixed(3)] : []);

/** Container and stream facts; a file ffprobe cannot read or that has no audio stream is BAD_FORMAT. */
export async function audioFacts(file: string): Promise<AudioFacts> {
  let p: Awaited<ReturnType<typeof ffprobe>>;
  try { p = await ffprobe(file); } catch (e) { throw new StudioError('INVALID', `The file could not be decoded (${(e as Error).message.split('\n')[0].slice(0, 200)}).`, { code: 'BAD_FORMAT' }); }
  if (!p.hasAudio || !p.sampleRate) throw new StudioError('INVALID', 'The file has no audio stream.', { code: 'BAD_FORMAT' });
  return { durationSeconds: p.durationSeconds ?? 0, sampleRate: p.sampleRate, channels: p.channels ?? 1, codec: p.audioCodec, container: p.container };
}

/** EBU R128 integrated loudness, true peak and range of a file or a window of it (loudnorm pass 1). A silent file
 *  measures -Infinity. */
export async function loudness(file: string, window?: { from: number; to: number }, opts: { /** the container when it is known (a file this module wrote), so ffmpeg does not have to probe it */ format?: string } = {}): Promise<Loudness> {
  const { stderr } = await ffmpeg([...seek(window), ...(opts.format ? ['-f', opts.format] : []), '-i', file, '-vn', '-af', `loudnorm=I=${REFERENCE_RULES.targetLufs}:TP=${REFERENCE_RULES.ceilingDbtp}:LRA=9:print_format=json`, '-f', 'null', '-'], { timeoutMs: 5 * 60_000 });
  const m = /\{[\s\S]*"input_i"[\s\S]*?\}/.exec(stderr);
  if (!m) throw new StudioError('PROVIDER', 'ffmpeg did not report loudness.');
  const j = JSON.parse(m[0]) as Record<string, string>;
  const num = (v: string | undefined) => { if (v === undefined) return NaN; if (/^-?inf$/i.test(v.trim())) return v.trim().startsWith('-') ? -Infinity : Infinity; return Number(v); };
  return { integratedLufs: num(j.input_i), truePeakDbtp: num(j.input_tp), loudnessRange: num(j.input_lra), threshold: num(j.input_thresh) };
}

/** Clipping: samples at full scale counted on the decoded float signal (every channel, native rate), plus astats'
 *  flat factor — runs of identical samples at the peak, the signature of a hard-clipped recording. */
export async function clipping(file: string, window?: { from: number; to: number }): Promise<Clipping> {
  const { stdout } = await execFileP('ffmpeg', ['-hide_banner', '-nostdin', '-v', 'error', ...seek(window), '-i', file, '-vn', '-f', 'f32le', '-c:a', 'pcm_f32le', '-'], { encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 });
  const samples = new Float32Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.byteLength / 4));
  let peak = 0, clipped = 0;
  for (let i = 0; i < samples.length; i++) { const a = Math.abs(samples[i]); if (a > peak) peak = a; if (a >= 0.999) clipped++; }
  let flatFactor = 0;
  try {
    const { stderr } = await ffmpeg([...seek(window), '-i', file, '-vn', '-af', 'astats=metadata=0', '-f', 'null', '-'], { timeoutMs: 5 * 60_000 });
    const flats = [...stderr.matchAll(/Flat factor:\s*([\d.]+)/g)].map((m) => Number(m[1]));
    flatFactor = flats.length ? flats[flats.length - 1] : 0; // the Overall block comes last
  } catch { /* the sample count above is the measurement; the flat factor is a detail */ }
  return { clippedSamples: clipped, totalSamples: samples.length, ratio: samples.length ? clipped / samples.length : 0, flatFactor, peakDbfs: peak > 0 ? 20 * Math.log10(peak) : -Infinity };
}

/** Where the speech is: the complement of silencedetect's gaps (below `noiseDb` for at least `minSilence` s). */
export async function speechRegions(file: string, opts: { noiseDb?: number; minSilence?: number; durationSeconds?: number } = {}): Promise<{ regions: Array<{ from: number; to: number }>; speechSeconds: number; durationSeconds: number }> {
  const duration = opts.durationSeconds ?? (await audioFacts(file)).durationSeconds;
  const { stderr } = await ffmpeg(['-i', file, '-vn', '-af', `silencedetect=n=${opts.noiseDb ?? -35}dB:d=${opts.minSilence ?? 0.3}`, '-f', 'null', '-'], { timeoutMs: 5 * 60_000 });
  const silences: Array<{ from: number; to: number }> = [];
  let open: number | undefined;
  for (const m of stderr.matchAll(/silence_(start|end): ([\d.]+)/g)) {
    if (m[1] === 'start') open = Number(m[2]);
    else { silences.push({ from: open ?? 0, to: Number(m[2]) }); open = undefined; }
  }
  if (open !== undefined) silences.push({ from: open, to: duration });
  const regions: Array<{ from: number; to: number }> = [];
  let cursor = 0;
  for (const s of silences) { if (s.from - cursor > 0.05) regions.push({ from: cursor, to: s.from }); cursor = Math.max(cursor, s.to); }
  if (duration - cursor > 0.05) regions.push({ from: cursor, to: duration });
  return { regions, speechSeconds: regions.reduce((a, r) => a + (r.to - r.from), 0), durationSeconds: duration };
}

/** The window to clone from: the longest run of speech regions whose gaps are short pauses (≤ `mergeGap`), bounded by
 *  `maxSeconds`, padded a little into the surrounding silence — chosen by content, not the head of the file. A single
 *  region longer than the limit is cut at the limit and says so. */
export function pickReferenceWindow(regions: Array<{ from: number; to: number }>, durationSeconds: number, opts: { maxSeconds?: number; minSeconds?: number; mergeGap?: number; pad?: number } = {}): SpeechWindow | null {
  const max = opts.maxSeconds ?? REFERENCE_RULES.windowSeconds, min = opts.minSeconds ?? REFERENCE_RULES.minSpeechSeconds, gap = opts.mergeGap ?? 0.8, pad = opts.pad ?? 0.15;
  let best: { from: number; to: number; speech: number } | null = null;
  for (let i = 0; i < regions.length; i++) {
    let speech = 0;
    for (let j = i; j < regions.length; j++) {
      if (j > i && regions[j].from - regions[j - 1].to > gap) break;
      const span = regions[j].to - regions[i].from;
      if (span > max) { if (j === i) { const cut = { from: regions[i].from, to: regions[i].from + max, speech: max }; if (!best || cut.speech > best.speech) best = cut; } break; }
      speech += regions[j].to - regions[j].from;
      if (!best || speech > best.speech) best = { from: regions[i].from, to: regions[j].to, speech };
    }
  }
  if (!best || best.speech < min) return null;
  const cutMidSpeech = regions.some((r) => r.from === best!.from && r.to > best!.to);
  const from = Math.max(0, best.from - pad); let to = Math.min(durationSeconds, best.to + pad);
  if (to - from > max) to = from + max;
  return { from, to, seconds: to - from, ...(cutMidSpeech ? { cutMidSpeech: true } : {}) };
}

/** Cut the window to 24 kHz mono PCM-16 with one static gain that brings its integrated loudness to `targetLufs`,
 *  capped so the true peak stays at or under -1 dBTP. Measured, never dynamic: the timbre reference keeps its
 *  micro-dynamics (a dynamic loudnorm on the reference was defect D7 in VOICE-STACK.md). */
export async function trimReference(file: string, out: string, window: { from: number; to: number }, targetLufs: number = REFERENCE_RULES.targetLufs): Promise<{ file: string; from: number; to: number; gainDb: number; integratedLufs: number; truePeakDbtp: number }> {
  const before = await loudness(file, window);
  let gainDb = Number.isFinite(before.integratedLufs) ? targetLufs - before.integratedLufs : 0;
  if (Number.isFinite(before.truePeakDbtp)) gainDb = Math.min(gainDb, REFERENCE_RULES.ceilingDbtp - before.truePeakDbtp);
  gainDb = Math.max(-40, Math.min(40, gainDb));
  await ffmpeg(['-v', 'error', ...seek(window), '-i', file, '-vn', '-af', `volume=${gainDb.toFixed(2)}dB`, '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', out], { timeoutMs: 5 * 60_000 });
  const after = await loudness(out, undefined, { format: 'wav' });
  return { file: out, from: window.from, to: window.to, gainDb: Number(gainDb.toFixed(2)), integratedLufs: after.integratedLufs, truePeakDbtp: after.truePeakDbtp };
}

/** Everything the contract measures on the CPU, in the order a producer needs to hear it: format, length, speech
 *  present, level, clipping. The first failing rule gives the code; every failing rule is in `reasons`. */
export async function validateVoiceReference(file: string, opts: { language?: Language } = {}): Promise<VoiceReferenceValidation> {
  const R = REFERENCE_RULES;
  const empty: VoiceReferenceValidation = { ok: false, reasons: [], durationSeconds: 0, sampleRate: 0, channels: 0, integratedLufs: -Infinity, truePeakDbtp: -Infinity, clipping: { clippedSamples: 0, totalSamples: 0, ratio: 0, flatFactor: 0, peakDbfs: -Infinity }, speechSeconds: 0, expectedLanguage: opts.language };
  let facts: AudioFacts;
  try { facts = await audioFacts(file); } catch (e) { return { ...empty, code: 'BAD_FORMAT', message: (e as Error).message, reasons: [(e as Error).message] }; }
  const v: VoiceReferenceValidation = { ...empty, durationSeconds: facts.durationSeconds, sampleRate: facts.sampleRate, channels: facts.channels, codec: facts.codec };
  const refuse = (code: VoiceReferenceRefusal, message: string) => { v.reasons.push(message); if (!v.code) { v.code = code; v.message = message; } };
  if (facts.sampleRate < R.minSampleRate) refuse('BAD_FORMAT', `The recording is sampled at ${facts.sampleRate} Hz; at least ${R.minSampleRate / 1000} kHz is needed (telephone-quality audio cannot carry a voice).`);
  if (facts.durationSeconds < R.minSeconds) refuse('TOO_SHORT', `The recording is ${facts.durationSeconds.toFixed(1)} s long; record ${R.minSeconds}–${R.maxSeconds} s of clear speech (6–12 s is ideal).`);
  else if (facts.durationSeconds > R.maxSeconds) refuse('TOO_LONG', `The recording is ${facts.durationSeconds.toFixed(0)} s long; keep it under ${R.maxSeconds} s — the engines use at most ${R.windowSeconds} s.`);
  if (v.code) return v; // a file this short or long is not worth a signal analysis
  const [loud, clip, speech] = await Promise.all([loudness(file), clipping(file), speechRegions(file, { durationSeconds: facts.durationSeconds })]);
  v.integratedLufs = loud.integratedLufs; v.truePeakDbtp = loud.truePeakDbtp; v.loudnessRange = loud.loudnessRange; v.clipping = clip; v.speechSeconds = Number(speech.speechSeconds.toFixed(2));
  const window = pickReferenceWindow(speech.regions, facts.durationSeconds);
  if (window) v.window = { ...window, from: Number(window.from.toFixed(3)), to: Number(window.to.toFixed(3)), seconds: Number(window.seconds.toFixed(3)) };
  // level before presence: a recording at -50 LUFS has a voice in it, the message is "too quiet"; silence has none
  if (!Number.isFinite(loud.integratedLufs)) refuse('NO_SPEECH', 'The recording is silent.');
  else if (loud.integratedLufs < R.minLufs) refuse('TOO_QUIET', `The recording is too quiet (${loud.integratedLufs.toFixed(1)} LUFS; ${R.minLufs} LUFS or louder is needed); record closer to the microphone.`);
  else if (!window || speech.speechSeconds < R.minSpeechSeconds) refuse('NO_SPEECH', `No speech was found above the noise floor (${speech.speechSeconds.toFixed(1)} s of signal); the recording may be noise or music.`);
  if (clip.ratio > R.maxClippingRatio || loud.truePeakDbtp > 0) refuse('CLIPPING', `The recording is clipped (${clip.clippedSamples} samples at full scale, peak ${loud.truePeakDbtp.toFixed(1)} dBTP); record again at a lower input level.`);
  else if (loud.integratedLufs > R.maxLufs) refuse('CLIPPING', `The recording is too loud (${loud.integratedLufs.toFixed(1)} LUFS; ${R.maxLufs} LUFS or quieter); record again at a lower input level.`);
  v.ok = !v.code;
  return v;
}
