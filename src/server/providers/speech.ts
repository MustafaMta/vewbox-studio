import fsp from 'node:fs/promises';
import path from 'node:path';
import { StudioError } from '@/domain/errors';
import type { Dialect, Language } from '@/domain/vocabulary';
import { env } from '../env';
import { log } from '../log';

/** THE VOICE AND TRANSCRIPTION SERVICES — two small HTTP services on the local GPU (docker/tts, docker/asr). The
 *  contract is the studio's own: synthesize one line from a reference recording with an engine chosen by language
 *  and dialect; transcribe a file with word timings. Both expose /health and /unload for the GPU lease. */

export type TtsEngine = 'indextts' | 'habibi' | 'auto';

/** The knobs an identity pins so a line can be spoken again identically. `seed` is honoured by both engines; `nfeStep`,
 *  `cfgStrength` and `swaySamplingCoef` by Habibi (F5) only; `emotionAlpha` by IndexTTS only. */
export interface SynthesizeParams { seed?: number; speed?: number; nfeStep?: number; cfgStrength?: number; swaySamplingCoef?: number; emotionAlpha?: number }
export interface SynthesizeInput extends SynthesizeParams { text: string; language: Language; dialect?: Dialect; referenceWav: string; referenceText?: string; emotion?: string; engine?: TtsEngine }
export interface SynthesizeResult {
  file: string; sampleRate: number; durationSeconds: number; engine: string; model: string; ms: number;
  /** Package/model versions as the service reports them (x-engine-version); 'unknown' from an older service. */
  engineVersion: string;
  /** The seed actually used (the service draws one when none was sent). */
  seed?: number;
  /** Every parameter the engine honoured, as echoed back by the service (x-params). */
  params: Record<string, number>;
  /** True peak after the service's limiter, dBTP; and how much gain it took off at the loudest point. */
  truePeakDbtp?: number; gainReductionDb?: number;
}

const tts = (engine: Exclude<TtsEngine, 'auto'>) => (engine === 'habibi' ? env().TTS_HABIBI_URL : env().TTS_URL).replace(/\/$/, '');
const asr = () => env().ASR_URL.replace(/\/$/, '');

async function post(url: string, fd: FormData, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'POST', body: fd, signal: ctrl.signal });
    if (!res.ok) { const text = await res.text().catch(() => ''); let detail = text; try { detail = (JSON.parse(text) as { detail?: string }).detail ?? text; } catch { /* plain */ } throw new StudioError(res.status === 503 ? 'NOT_CONFIGURED' : 'PROVIDER', `${url.replace(/^https?:\/\/[^/]+/, '')}: ${detail.slice(0, 400)}`, { status: res.status }); }
    return res;
  } catch (e) {
    if (e instanceof StudioError) throw e;
    const cause = (e as Error & { cause?: { code?: string; message?: string } }).cause;
    const why = cause?.code ?? cause?.message ?? (e as Error).message;
    const timedOut = (e as Error).name === 'AbortError' || /TIMEOUT/i.test(why);
    throw new StudioError('UNAVAILABLE', timedOut ? `${url.replace(/^https?:\/\/[^/]+/, '')} did not answer in time (${why}); the service may be busy loading or downloading a model.` : `${url.replace(/^https?:\/\/[^/]+/, '')} is not reachable (${why}). Start the service.`);
  } finally { clearTimeout(t); }
}

/** Which engine speaks this character: Iraqi Arabic → Habibi (IRQ model); everything else → IndexTTS 2.5. */
export function pickEngine(language: Language, dialect?: Dialect, preferred?: TtsEngine): Exclude<TtsEngine, 'auto'> {
  if (preferred && preferred !== 'auto') return preferred;
  if (language === 'AR' && dialect === 'IRAQI_BAGHDADI') return 'habibi';
  return 'indextts';
}

/** What a line is written in, for routing and for the ASR language. MIXED is the worker's rule — two or more Latin
 *  letters in a row next to Arabic — so a lone initial or unit does not switch engines. LATIN covers any line without
 *  Arabic letters (other scripts included); NUMERIC has digits but no letters. */
export type LineScript = 'AR' | 'LATIN' | 'MIXED' | 'NUMERIC' | 'EMPTY';
export function lineScript(text: string): LineScript {
  const t = text.replace(/[\s\p{P}\p{S}]/gu, '');
  if (!t) return 'EMPTY';
  const arabic = /(?=\p{L})\p{Script=Arabic}/u.test(t);
  const latinWord = /[A-Za-zÀ-ɏ]{2,}/.test(t);
  const letters = /\p{L}/u.test(t);
  if (arabic && latinWord) return 'MIXED';
  if (arabic) return 'AR';
  if (letters) return 'LATIN';
  return 'NUMERIC';
}

/** Routing parity for voice.ts, take.ts and the suite: the engine and the ASR language follow the line's script.
 *  Arabic script → the character's engine; Latin-only or mixed → IndexTTS (Habibi has no English), with `fallback`
 *  naming the switch so the job can log it. The identity's model is never changed by this. */
export function routeLine(text: string, language: Language, dialect?: Dialect, preferred?: TtsEngine): { script: LineScript; engine: Exclude<TtsEngine, 'auto'>; asrLanguage: 'ar' | 'en'; fallback?: string } {
  const script = lineScript(text);
  const base = pickEngine(language, dialect, preferred);
  if (script === 'MIXED') return { script, engine: 'indextts', asrLanguage: 'ar', fallback: base !== 'indextts' ? `mixed Arabic/Latin line: ${base} has no English, spoken by indextts` : undefined };
  if (script === 'LATIN') return { script, engine: 'indextts', asrLanguage: 'en', fallback: base !== 'indextts' ? `Latin-script line: spoken by indextts, not ${base}` : undefined };
  if (script === 'AR') return { script, engine: base, asrLanguage: 'ar' };
  return { script, engine: base, asrLanguage: language === 'AR' ? 'ar' : 'en' };
}

export async function synthesize(i: SynthesizeInput, outDir: string): Promise<SynthesizeResult> {
  const engine = pickEngine(i.language, i.dialect, i.engine);
  const fd = new FormData();
  fd.set('text', i.text);
  fd.set('language', i.language === 'AR' ? 'ar' : 'en');
  if (i.dialect) fd.set('dialect', i.dialect);
  fd.set('engine', engine);
  fd.set('reference', new Blob([await fsp.readFile(i.referenceWav)]), path.basename(i.referenceWav));
  if (i.referenceText) fd.set('reference_text', i.referenceText);
  if (i.emotion) fd.set('emotion', i.emotion);
  if (i.emotionAlpha !== undefined) fd.set('emotion_alpha', String(i.emotionAlpha));
  if (i.speed !== undefined) fd.set('speed', String(i.speed));
  if (i.seed !== undefined) fd.set('seed', String(Math.trunc(i.seed)));
  if (i.nfeStep !== undefined) fd.set('nfe_step', String(Math.trunc(i.nfeStep)));
  if (i.cfgStrength !== undefined) fd.set('cfg_strength', String(i.cfgStrength));
  if (i.swaySamplingCoef !== undefined) fd.set('sway_sampling_coef', String(i.swaySamplingCoef));
  const t0 = Date.now();
  const res = await post(`${tts(engine)}/synthesize`, fd, 10 * 60_000);
  const buf = Buffer.from(await res.arrayBuffer());
  const file = path.join(outDir, `line-${Date.now().toString(36)}.wav`);
  await fsp.writeFile(file, buf);
  const meta = parseSynthesisHeaders(res.headers, engine);
  log.info({ engine: meta.engine, version: meta.engineVersion, seed: meta.seed, ms: Date.now() - t0, chars: i.text.length, seconds: meta.durationSeconds, truePeak: meta.truePeakDbtp }, 'tts line');
  return { file, ...meta, ms: Date.now() - t0 };
}

/** The service's answer headers as a record; tolerant of an older service that sends only the first four. */
export function parseSynthesisHeaders(h: { get(name: string): string | null }, engine: string): Omit<SynthesizeResult, 'file' | 'ms'> {
  const num = (name: string) => { const v = h.get(name); if (v === null || v === '') return undefined; const n = Number(v); return Number.isFinite(n) ? n : undefined; };
  let params: Record<string, number> = {};
  try { const raw = h.get('x-params'); if (raw) { const j = JSON.parse(raw) as Record<string, unknown>; for (const [k, v] of Object.entries(j)) if (typeof v === 'number' && Number.isFinite(v)) params[k] = v; } } catch { params = {}; }
  const seed = num('x-seed') ?? params.seed;
  if (seed !== undefined && params.seed === undefined) params.seed = seed;
  return {
    sampleRate: num('x-sample-rate') ?? 24000, durationSeconds: num('x-duration') ?? 0,
    engine: h.get('x-engine') ?? engine, model: h.get('x-model') ?? engine, engineVersion: h.get('x-engine-version') ?? 'unknown',
    seed, params, truePeakDbtp: num('x-true-peak'), gainReductionDb: num('x-gain-reduction'),
  };
}

export interface Transcript { language: string; languageProbability: number; duration: number; text: string; segments: Array<{ start: number; end: number; text: string; words: Array<{ start: number; end: number; word: string; probability: number }> }>; ms: number; model: string }

export async function transcribe(file: string, opts: { language?: 'ar' | 'en' | 'auto'; prompt?: string } = {}): Promise<Transcript> {
  const fd = new FormData();
  fd.set('file', new Blob([await fsp.readFile(file)]), path.basename(file));
  fd.set('language', opts.language ?? 'auto');
  if (opts.prompt) fd.set('prompt', opts.prompt);
  fd.set('words', '1');
  const res = await post(`${asr()}/transcribe`, fd, 10 * 60_000);
  const j = await res.json() as { language: string; language_probability: number; duration: number; text: string; segments: Transcript['segments']; ms: number; model: string };
  return { language: j.language, languageProbability: j.language_probability, duration: j.duration, text: j.text, segments: j.segments, ms: j.ms, model: j.model };
}

/** Split a mix into stems (Demucs in the audio service). Writes `vocals.wav` and `no_vocals.wav` (or four stems)
 *  into outDir and returns their paths. */
export async function separateStems(file: string, outDir: string, opts: { four?: boolean } = {}): Promise<{ files: Record<string, string>; ms: number; model: string }> {
  const fd = new FormData();
  fd.set('file', new Blob([await fsp.readFile(file)]), path.basename(file));
  fd.set('stems', opts.four ? 'four' : 'two');
  const res = await post(`${asr()}/separate`, fd, 20 * 60_000);
  const zip = Buffer.from(await res.arrayBuffer());
  const files = await unzipTo(zip, outDir);
  return { files, ms: Number(res.headers.get('x-separation-ms') ?? 0), model: res.headers.get('x-demucs-model') ?? 'htdemucs' };
}

/** A minimal zip reader (stored or deflated entries) so the worker needs no extra dependency for a handful of WAVs. */
async function unzipTo(zip: Buffer, outDir: string): Promise<Record<string, string>> {
  const { inflateRawSync } = await import('node:zlib');
  const out: Record<string, string> = {};
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new StudioError('PROVIDER', 'The stems archive is malformed.');
  const count = zip.readUInt16LE(eocd + 10); let off = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(off) !== 0x02014b50) break;
    const method = zip.readUInt16LE(off + 10), csize = zip.readUInt32LE(off + 20), nameLen = zip.readUInt16LE(off + 28), extraLen = zip.readUInt16LE(off + 30), commentLen = zip.readUInt16LE(off + 32), local = zip.readUInt32LE(off + 42);
    const name = zip.subarray(off + 46, off + 46 + nameLen).toString('utf8');
    const lnameLen = zip.readUInt16LE(local + 26), lextraLen = zip.readUInt16LE(local + 28);
    const start = local + 30 + lnameLen + lextraLen;
    const data = zip.subarray(start, start + csize);
    const bytes = method === 8 ? inflateRawSync(data) : data;
    const safe = path.basename(name).replace(/[^\w.-]/g, '_');
    const dest = path.join(outDir, safe);
    await fsp.writeFile(dest, bytes);
    out[safe.replace(/\.wav$/i, '')] = dest;
    off += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export async function unloadTts(): Promise<void> { for (const e of ['indextts', 'habibi'] as const) { try { await fetch(`${tts(e)}/unload`, { method: 'POST', signal: AbortSignal.timeout(20_000) }); } catch { /* not running */ } } }
export async function unloadAsr(): Promise<void> { try { await fetch(`${asr()}/unload`, { method: 'POST', signal: AbortSignal.timeout(20_000) }); } catch { /* not running */ } }

// ------------------------------------------------------------------------------------------------ text metrics

/** Normalise Arabic for comparing what was said with what was written: strip diacritics and tatweel, unify alef,
 *  taa marbuta and yaa, drop punctuation. Orthography only — the raw view that WER reports on. */
export function normalizeArabic(s: string): string {
  return s.replace(/[ً-ْٰـ]/g, '').replace(/[إأآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** English words as the comparison sees them: typographic apostrophes folded to the plain one (a script's “I’ll” and
 *  Whisper's "I'll" are one word), everything that is not a letter, digit or apostrophe dropped. */
export function normalizeLatin(s: string): string {
  return s.replace(/[‘’ʼ`´]/g, "'").toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** A whole-word match that tolerates an attached conjunction («وخمسه» is still «خمسه»); the replacement keeps it. */
const word = (alternatives: string) => new RegExp(`(?<=^|\\s)(و?)(?:${alternatives})(?=\\s|$)`, 'gu');

/** Spelled numbers the Iraqi way and the MSA way Whisper writes them back, in folded orthography (ة→ه, ى→ي, أ→ا,
 *  ق→ك already applied). Teens before tens before units, so «خمسه عشر» is 15 before «خمسه» could become 5. */
const IRAQI_NUMBERS: Array<[RegExp, string]> = [
  [word('احدعش|حدعش|احد عشر|احدي عشر|احدي عشره|حداش'), '11'], [word('اثنعش|ثنعش|اثناعش|اثنعشر|اثنا عشر|اثني عشر|اثنتا عشر|اثنتي عشر|اطنعش'), '12'],
  [word('ثلطعش|ثلثطعش|ثلاثتعش|ثلاثه عشر|ثلاث عشر|ثلاثة عشر'), '13'], [word('اربعطعش|اربعتعش|اربعه عشر|اربع عشر'), '14'], [word('خمسطعش|خمستعش|خمسه عشر|خمس عشر'), '15'],
  [word('سطعش|ستطعش|ستتعش|سته عشر|ست عشر'), '16'], [word('سبعطعش|سبعتعش|سبعه عشر|سبع عشر'), '17'], [word('ثمنطعش|ثمنتعش|ثمانيه عشر|ثماني عشر'), '18'], [word('تسعطعش|تسعتعش|تسعه عشر|تسع عشر'), '19'],
  [word('عشرين'), '20'], [word('ثلاثين|تلاتين'), '30'], [word('اربعين'), '40'], [word('خمسين'), '50'], [word('ستين'), '60'], [word('سبعين'), '70'], [word('ثمانين'), '80'], [word('تسعين'), '90'],
  [word('ميتين|مئتين|مائتين'), '200'], [word('ميه|مئه|مائه|ميت'), '100'], [word('الف'), '1000'],
  [word('واحد|وحده|واحده'), '1'], [word('اثنين|ثنين|اثنان|اثنتين|ثنتين'), '2'], [word('ثلاث|ثلاثه|تلاته|تلات'), '3'], [word('اربع|اربعه'), '4'], [word('خمس|خمسه'), '5'],
  [word('ست|سته'), '6'], [word('سبع|سبعه'), '7'], [word('ثمان|ثمانيه|ثمانه|ثمن'), '8'], [word('تسع|تسعه'), '9'], [word('عشر|عشره'), '10'],
];

/** Iraqi spellings and the MSA forms ASR writes instead, in folded orthography, each mapped to one key. */
const IRAQI_WORDS: Array<[RegExp, string]> = [
  [word('اني|انا'), 'انا'], [word('احنا|حنا|احنه|نحن'), 'احنا'], [word('انت|انته|انتي|انتا'), 'انت'],
  [word('هسه|هسا|هسع|الان|الحين|هاي الساعه'), 'هسه'], [word('شلون|شلونه|كيف|اشلون'), 'شلون'], [word('شنو|شنهو|شنهي|ايش|شو|ماذا|ما هو|ما هي|شني'), 'شنو'],
  [word('ليش|لماذا|ليه|لويش'), 'ليش'], [word('وين|اين|فين|وينه'), 'وين'], [word('هيجي|هيج|هيكي|هكذا|هيك'), 'هيجي'], [word('هاي|هذه|هذي|هاذي'), 'هاي'], [word('هذا|هاذا|هاذ'), 'هذا'],
  [word('ماكو|ما كو|ما اكو|لا يوجد|مافي|ما في|مافيش'), 'ماكو'], [word('اكو|يوجد'), 'اكو'], [word('هوايه|هواي|هوايا|واجد|كثير|كتير|هلبه'), 'هوايه'],
  [word('باجر|بكره|بكرا|باكر|بوكره|غدا|بجر'), 'باجر'], [word('زين|زينه|كويس|تمام|طيب|خوش'), 'زين'], [word('يلا|يالله|يله|هيا'), 'يلا'], [word('شويه|شوي|كليل'), 'شويه'],
  [word('ماظل|ما ظل|لم يبك|ما بكي|ما بكه'), 'ماظل'], [word('راح|رايح|سوف|حيروح|رح'), 'راح'], [word('ويا|مع|وياه|وياي'), 'ويا'], [word('عله|علي'), 'علي'], [word('لمن|لما|عندما'), 'لمن'],
  [word('ادري|اعرف|عارف'), 'ادري'], [word('لعد|اذن|لعاد'), 'لعد'], [word('كلش|جدا'), 'كلش'], [word('دير بالك|دير بالج|ديربالك|انتبه|خلي بالك'), 'ديربالك'],
];

/** Fold Iraqi Arabic and the MSA spellings an ASR writes back onto one orthography so that a correct pronunciation
 *  is not charged as an error: diacritics, tatweel and digits normalised; hamza forms, ة/ه, ى/ي and the Persian
 *  letters unified; one class each for /g/ (گ ق ك ک) and /tʃ/ (چ ج, «تش»); a word-final چ is the feminine "you" clitic
 *  (شلونچ) that ASR writes ك; the conjunction و and the negation ما are attached to the next word (ASR is inconsistent
 *  about the space); spelled numbers become digits («خمسه وعشرين» → 25); a table of Iraqi words and their MSA
 *  equivalents (اني/انا, هسه/الان, شلون/كيف…). Lenient on purpose — it is the gate, not the report; `normalizeArabic`
 *  stays the raw view for WER. Applied to both sides before `charErrorRate` and `scriptCoverage`. */
export function normalizeIraqi(s: string): string {
  let t = s.normalize('NFC')
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[‘’ʼ`´]/g, "'").replace(/[^\p{L}\p{N}\s']/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
    .replace(/[إأآٱ]/g, 'ا').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ء/g, '')
    .replace(/ة/g, 'ه').replace(/[ىیے]/g, 'ي').replace(/ک/g, 'ك').replace(/پ/g, 'ب').replace(/ڤ/g, 'ف')
    .replace(/چ(?=\s|$)/g, 'ك').replace(/تش/g, 'چ').replace(/[گقك]/g, 'ك').replace(/[چج]/g, 'ج')
    .replace(/(\p{L})\1{2,}/gu, '$1');
  for (const [re, to] of IRAQI_WORDS) t = t.replace(re, `$1${to}`);
  for (const [re, to] of IRAQI_NUMBERS) t = t.replace(re, `$1${to}`);
  t = t.replace(/(?<=^|\s)(ما|و|يا|لا) (?=\S)/g, '$1');
  t = t.replace(/(?<=^|\s)(و?)(\d+) و(\d+)(?=\s|$)/g, (_, w: string, a: string, b: string) => `${w}${Number(a) + Number(b)}`);
  return t.replace(/\s+/g, ' ').trim();
}

const fold = (x: string, lang: Language) => (lang === 'AR' ? normalizeIraqi(x) : normalizeLatin(x));

/** Share of the intended words heard in order (longest common subsequence over folded words). Insertions — a
 *  repeated phrase, a filler — do not lower it; missing or wrong words do. Arabic goes through the dialect fold. */
export function scriptCoverage(reference: string, hypothesis: string, lang: Language): number {
  const r = fold(reference, lang).split(' ').filter(Boolean); const h = fold(hypothesis, lang).split(' ').filter(Boolean);
  if (r.length === 0) return 1;
  const dp: number[][] = Array.from({ length: r.length + 1 }, () => Array<number>(h.length + 1).fill(0));
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++) dp[i][j] = r[i - 1] === h[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[r.length][h.length] / r.length;
}

function levenshtein<T>(r: T[], h: T[]): number {
  let prev = Array.from({ length: h.length + 1 }, (_, j) => j);
  for (let i = 1; i <= r.length; i++) {
    const cur = [i];
    for (let j = 1; j <= h.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[h.length];
}

/** Word error rate between the intended line and the transcript, on the raw orthographic normalisation (reported,
 *  not gated: it charges Whisper's own dialect spellings as errors). */
export function wordErrorRate(reference: string, hypothesis: string, lang: Language): number {
  const norm = (x: string) => (lang === 'AR' ? normalizeArabic(x) : normalizeLatin(x));
  const r = norm(reference).split(' ').filter(Boolean); const h = norm(hypothesis).split(' ').filter(Boolean);
  if (r.length === 0) return h.length === 0 ? 0 : 1;
  return levenshtein(r, h) / r.length;
}

/** Character error rate after the dialect fold (spaces count as characters): the gate metric for Arabic, where a
 *  dialect has no standard spelling and a word-level rate punishes orthography. */
export function charErrorRate(reference: string, hypothesis: string, lang: Language): number {
  const r = Array.from(fold(reference, lang)); const h = Array.from(fold(hypothesis, lang));
  if (r.length === 0) return h.length === 0 ? 0 : 1;
  return levenshtein(r, h) / r.length;
}

/** The contract's thresholds: a take is proven at coverage ≥ 0.7, a recorded line at ≥ 0.85, both with CER ≤ 0.15.
 *  Well below the gate the line is regenerated (FAIL); just below, or unmeasured (ASR outage), a person listens (REVIEW). */
export const VOICE_GATES = { coverage: { take: 0.7, line: 0.85 }, cer: 0.15, fail: { coverageBelowGate: 0.2, cer: 0.35 } } as const;
export type VoiceVerdict = { status: 'PASS' | 'REVIEW' | 'FAIL'; reasons: string[]; thresholds: { coverage: number; cer: number } };
export function verdict(m: { coverage?: number; cer?: number; context: 'take' | 'line' }): VoiceVerdict {
  const thresholds = { coverage: VOICE_GATES.coverage[m.context], cer: VOICE_GATES.cer };
  const reasons: string[] = [];
  const has = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v);
  if (!has(m.coverage) || !has(m.cer)) {
    reasons.push(`not verified: ${[!has(m.coverage) ? 'coverage' : '', !has(m.cer) ? 'CER' : ''].filter(Boolean).join(' and ')} missing (transcription unavailable)`);
    return { status: 'REVIEW', reasons, thresholds };
  }
  let fail = false;
  if (m.coverage < thresholds.coverage) { reasons.push(`coverage ${m.coverage.toFixed(2)} < ${thresholds.coverage} (${m.context})`); if (m.coverage < thresholds.coverage - VOICE_GATES.fail.coverageBelowGate) fail = true; }
  if (m.cer > thresholds.cer) { reasons.push(`CER ${m.cer.toFixed(2)} > ${thresholds.cer}`); if (m.cer > VOICE_GATES.fail.cer) fail = true; }
  if (reasons.length === 0) return { status: 'PASS', reasons: [], thresholds };
  return { status: fail ? 'FAIL' : 'REVIEW', reasons, thresholds };
}
