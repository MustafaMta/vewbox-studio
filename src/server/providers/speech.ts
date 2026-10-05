import fsp from 'node:fs/promises';
import path from 'node:path';
import { StudioError } from '@/domain/errors';
import type { Dialect, Language } from '@/domain/vocabulary';
import { env } from '../env';
import { log } from '../log';
import { followJobSignal, stopReasonOf } from '../jobs/context';

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

/** POST and read the WHOLE answer under the same timeout and job signal. The body is read inside: a service that
 *  restarts or dies while sending it (the connection reset mid-body: "terminated") is UNAVAILABLE — a retryable
 *  infrastructure failure — never an unclassified error, and a stalled body cannot hang the job past its timeout. */
async function post(url: string, fd: FormData, timeoutMs: number): Promise<{ res: Response; body: Buffer }> {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const unlink = followJobSignal(ctrl); // a stopped job aborts the request (src/server/jobs/context.ts)
  try {
    const res = await fetch(url, { method: 'POST', body: fd, signal: ctrl.signal });
    if (!res.ok) { const text = await res.text().catch(() => ''); let detail = text; try { detail = (JSON.parse(text) as { detail?: string }).detail ?? text; } catch { /* plain */ } throw new StudioError(res.status === 503 ? 'NOT_CONFIGURED' : 'PROVIDER', `${url.replace(/^https?:\/\/[^/]+/, '')}: ${detail.slice(0, 400)}`, { status: res.status }); }
    const body = Buffer.from(await res.arrayBuffer());
    return { res, body };
  } catch (e) {
    if (e instanceof StudioError) throw e;
    if (stopReasonOf(ctrl.signal)) throw stopReasonOf(ctrl.signal);
    const cause = (e as Error & { cause?: { code?: string; message?: string } }).cause;
    const why = cause?.code ?? cause?.message ?? (e as Error).message;
    const timedOut = (e as Error).name === 'AbortError' || /TIMEOUT/i.test(why);
    throw new StudioError('UNAVAILABLE', timedOut ? `${url.replace(/^https?:\/\/[^/]+/, '')} did not answer in time (${why}); the service may be busy loading or downloading a model.` : `${url.replace(/^https?:\/\/[^/]+/, '')} is not reachable (${why}). Start the service.`);
  } finally { clearTimeout(t); unlink(); }
}

/** Why a WAV a service returned cannot be used, or null. Pure (tested): empty, not RIFF/WAVE, no fmt or data chunk, a
 *  data chunk cut short (a truncated transfer or a service that died mid-write), or no audio at all. A streaming
 *  header's unknown size (0 or 0xFFFFFFFF) is accepted when audio follows. */
export function wavProblem(buf: Buffer): string | null {
  if (!buf.length) return 'empty (0 bytes)';
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return `not a WAV file (${buf.length} bytes)`;
  let off = 12; let fmt = false;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4); const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = true;
    if (id === 'data') {
      if (!fmt) return 'the data chunk comes before its format';
      const have = buf.length - off - 8;
      if (size === 0 || size === 0xffffffff) return have > 0 ? null : 'no audio samples';
      if (have < size) return `truncated: ${have} of ${size} audio bytes`;
      return size > 0 ? null : 'no audio samples';
    }
    off += 8 + size + (size % 2);
  }
  return 'no audio data chunk';
}

/** Which engine speaks this character: Iraqi Arabic → Habibi (IRQ model); everything else → IndexTTS 2.5. */
export function pickEngine(language: Language, dialect?: Dialect, preferred?: TtsEngine): Exclude<TtsEngine, 'auto'> {
  if (preferred && preferred !== 'auto') return preferred;
  if (language === 'AR' && dialect === 'IRAQI_BAGHDADI') return 'habibi';
  return 'indextts';
}

/** What a line is written in, for routing and for the ASR language — THE one implementation (the worker's handlers,
 *  take.ts and scripts/iraqi-voice-suite.mjs all route through it). Punctuation, symbols and digits are not script:
 *  an Arabic comma «،» or Arabic-Indic digits in an English line do not make it Arabic. MIXED is two or more Latin
 *  letters in a row next to Arabic letters, so a lone initial or unit does not switch engines. LATIN covers any line
 *  without Arabic letters (other scripts included); NUMERIC has digits but no letters. */
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

/** The language a mixed line is mostly in, by letters: «شغّل الـ wifi» is Arabic with a loanword, "I said مرحبا to
 *  her" is English with one. */
const mostlyArabic = (text: string) => (text.match(/(?=\p{L})\p{Script=Arabic}/gu)?.length ?? 0) >= (text.match(/[A-Za-zÀ-ɏ]/g)?.length ?? 0);

/** Routing parity for voice.ts, take.ts and the suite: the engine and the ASR language follow the line's script.
 *  Arabic script → the character's engine; Latin-only or mixed → IndexTTS (Habibi has no English), with `fallback`
 *  naming the switch so the job can log it; a mixed line is heard in the language most of its letters are in. The
 *  identity's model is never changed by this. */
export function routeLine(text: string, language: Language, dialect?: Dialect, preferred?: TtsEngine): { script: LineScript; engine: Exclude<TtsEngine, 'auto'>; asrLanguage: 'ar' | 'en'; fallback?: string } {
  const script = lineScript(text);
  const base = pickEngine(language, dialect, preferred);
  if (script === 'MIXED') return { script, engine: 'indextts', asrLanguage: mostlyArabic(text) ? 'ar' : 'en', fallback: base !== 'indextts' ? `mixed Arabic/Latin line: ${base} has no English, spoken by indextts` : undefined };
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
  const { res, body: buf } = await post(`${tts(engine)}/synthesize`, fd, 10 * 60_000);
  const file = path.join(outDir, `line-${Date.now().toString(36)}.wav`);
  await fsp.writeFile(file, buf);
  // A CORRUPT ANSWER (zero bytes, a truncated or malformed WAV) is the service's failure, named as such
  // (OUTPUT_CORRUPTION) — not left for a later step to misreport; the bytes stay in the work folder as evidence
  const bad = wavProblem(buf);
  if (bad) throw Object.assign(new StudioError('PROVIDER', `The ${engine} voice service returned an unusable recording: ${bad}.`, { engine, bytes: buf.length, file }), { failureClass: 'OUTPUT_CORRUPTION' });
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
  const { body } = await post(`${asr()}/transcribe`, fd, 10 * 60_000);
  let j: { language: string; language_probability: number; duration: number; text: string; segments: Transcript['segments']; ms: number; model: string };
  try { j = JSON.parse(body.toString('utf8')); } catch { throw Object.assign(new StudioError('PROVIDER', `The transcription service returned a malformed answer (${body.length} bytes).`), { failureClass: 'OUTPUT_CORRUPTION' }); }
  return { language: j.language, languageProbability: j.language_probability, duration: j.duration, text: j.text, segments: j.segments, ms: j.ms, model: j.model };
}

/** Split a mix into stems (Demucs in the audio service). Writes `vocals.wav` and `no_vocals.wav` (or four stems)
 *  into outDir and returns their paths. */
export async function separateStems(file: string, outDir: string, opts: { four?: boolean } = {}): Promise<{ files: Record<string, string>; ms: number; model: string }> {
  const fd = new FormData();
  fd.set('file', new Blob([await fsp.readFile(file)]), path.basename(file));
  fd.set('stems', opts.four ? 'four' : 'two');
  const { res, body: zip } = await post(`${asr()}/separate`, fd, 20 * 60_000);
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
  // hundreds in folded orthography (ئ → ي and ة → ه have been applied: «مئة» is «ميه», «مائة» is «مايه»)
  [word('ثلثميه|ثلاثميه|تلتميه|ثلاثمايه|ثلثمايه|ثلاث ميه|ثلث ميه'), '300'], [word('اربعميه|اربعمايه|اربع ميه'), '400'], [word('خمسميه|خمسمايه|خمس ميه'), '500'], [word('ستميه|ستمايه|ست ميه'), '600'],
  [word('سبعميه|سبعمايه|سبع ميه'), '700'], [word('ثمنميه|ثمانميه|ثمانيميه|ثمنمايه|ثمانمايه|ثمان ميه|ثمن ميه'), '800'], [word('تسعميه|تسعمايه|تسع ميه'), '900'],
  [word('ميتين|مايتين'), '200'], [word('ميه|مايه|ميت'), '100'], [word('الفين'), '2000'], [word('الف|تالاف|تلاف|الاف'), '1000'], [word('مليونين'), '2000000'], [word('مليون|ملايين'), '1000000'],
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
  [word('بالميه|بالمايه|في الميه|في المايه|بالمئويه'), 'بالميه'],
];

/** Fold Iraqi Arabic and the MSA spellings an ASR writes back onto one orthography so that a correct pronunciation
 *  is not charged as an error: diacritics, tatweel and digits normalised; hamza forms, ة/ه, ى/ي and the Persian
 *  letters unified; one class each for /g/ (گ ق ك ک) and /tʃ/ (چ ج, «تش»); a word-final چ is the feminine "you" clitic
 *  (شلونچ) that ASR writes ك; the conjunction و and the negation ما are attached to the next word (ASR is inconsistent
 *  about the space); spelled numbers become digits («خمسه وعشرين» → 25, «ميتين وخمسين الف» → 250000, «سبعه ونص» →
 *  «7 30», the way `prepareLineText` spells a digit line for the engine); a table of Iraqi words and their MSA
 *  equivalents (اني/انا, هسه/الان, شلون/كيف…). Lenient on purpose — it is the gate, not the report; `normalizeArabic`
 *  stays the raw view for WER. Applied to both sides before `charErrorRate` and `scriptCoverage`. */
export function normalizeIraqi(s: string): string {
  let t = s.normalize('NFC')
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/(\d)[,٬.](?=\d{3}(?!\d))/g, '$1') // thousands separators («2,500» is one number)
    .replace(/[%٪]/g, ' بالميه ') // «25 %» is said «خمسة وعشرين بالمية»
    .replace(/(?<![\d.])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/g, (_, h: string, m: string) => `${Number(h) % 12 || 12} ${m}`) // «19:45» is said «ثمانية الا ربع»: the 12-hour clock
    .replace(/[‘’ʼ`´]/g, "'").replace(/[^\p{L}\p{N}\s']/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
    .replace(/[إأآٱ]/g, 'ا').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ء/g, '')
    .replace(/ة/g, 'ه').replace(/[ىیے]/g, 'ي').replace(/ک/g, 'ك').replace(/پ/g, 'ب').replace(/ڤ/g, 'ف')
    .replace(/چ(?=\s|$)/g, 'ك').replace(/تش/g, 'چ').replace(/[گقك]/g, 'ك').replace(/[چج]/g, 'ج')
    .replace(/(\p{L})\1{2,}/gu, '$1');
  for (const [re, to] of IRAQI_WORDS) t = t.replace(re, `$1${to}`);
  for (const [re, to] of IRAQI_NUMBERS) t = t.replace(re, `$1${to}`);
  t = t.replace(/(?<=^|\s)(ما|و|يا|لا) (?=\S)/g, '$1');
  // the fractions of the hour as said («سبعة ونص» is 7:30, which the text side folds to «7 30»)
  t = t.replace(/(?<=^|\s)(و?\d+) ونص(?=\s|$)/g, '$1 30').replace(/(?<=^|\s)(و?\d+) وربع(?=\s|$)/g, '$1 15').replace(/(?<=^|\s)(و?\d+) وثلث(?=\s|$)/g, '$1 20')
    .replace(/(?<=^|\s)(و?)(\d+) الا ربع(?=\s|$)/g, (_, w: string, h: string) => `${w}${Number(h) === 1 ? 12 : Number(h) - 1} 45`);
  t = t.replace(/(?<=^|\s)(و?)\d+(?: و\d+| (?:100|1000|1000000))+(?=\s|$)/g, (run: string) => `${run.startsWith('و') ? 'و' : ''}${numberRun(run)}`);
  return t.replace(/\s+/g, ' ').trim();
}

/** A spelled number as a run of folded tokens («ميتين وخمسين الف وخمسمية» → «200 و50 1000 و500»), read the way Arabic
 *  counts: a bare multiplier (100, 1000, 1000000) multiplies everything said so far, a «و»-joined number is added. So
 *  «200 و50 1000» is 250 000, «3 1000 و500» is 3 500, «1000 و900 و7 و80» is 1987 and «200 و50» is 250. */
function numberRun(run: string): number {
  let acc = 0;
  for (const tok of run.split(' ')) {
    const joined = tok.startsWith('و');
    const n = Number(tok.replace(/^و/, ''));
    if (!joined && acc > 0 && (n === 100 || n === 1000 || n === 1000000)) { const small = acc % n; acc = acc - small + small * n; } // «مليونين وخمسمية الف»: only what is smaller than the multiplier is multiplied
    else acc += n;
  }
  return acc;
}

const EN_UNITS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const EN_TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

const UNIT_WORD = Object.fromEntries(Object.entries(EN_UNITS).map(([w, n]) => [n, w])) as Record<number, string>;
const TENS_WORD = Object.fromEntries(Object.entries(EN_TENS).map(([w, n]) => [n, w])) as Record<number, string>;
function spellBelowThousand(n: number): string[] {
  const out: string[] = [];
  if (n >= 100) { out.push(UNIT_WORD[Math.floor(n / 100)], 'hundred'); n %= 100; }
  if (n >= 20) { out.push(TENS_WORD[Math.floor(n / 10) * 10]); n %= 10; if (n) out.push(UNIT_WORD[n]); }
  else if (n > 0 || out.length === 0) out.push(UNIT_WORD[n]);
  return out;
}
/** Spell a whole number in English words ("32" → "thirty two"); numbers beyond a million stay digits. */
function spellNumber(digits: string): string {
  const n = Number(digits);
  if (!Number.isSafeInteger(n) || n >= 1_000_000 || digits.length > 1 && digits.startsWith('0')) return digits;
  if (n < 1000) return spellBelowThousand(n).join(' ');
  return [...spellBelowThousand(Math.floor(n / 1000)), 'thousand', ...(n % 1000 ? spellBelowThousand(n % 1000) : [])].join(' ');
}

/** English numbers in ONE spelled form on both sides of the gate: digits become words ("32 ships" → "thirty two
 *  ships"), the "and" inside a spelled number goes, and thousands separators go ("1,000" → "one thousand"). Whisper
 *  writes "Thirty-two" back as "32"; spelling digits (rather than parsing words into digits) keeps a near miss like
 *  "nine ten" → "nina tin" close at the letter level (found 2026-10-03: a correct preview scored CER 0.14 only because
 *  of "Thirty-two" vs "32"). */
export function foldEnglishNumbers(normalized: string): string {
  return normalized.replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/\b\d+\b/g, (d) => spellNumber(d))
    .replace(/\b(hundred|thousand) and (?=(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b)/g, '$1 ')
    .replace(/\s+/g, ' ').trim();
}

/** Contractions written out, the way Whisper sometimes writes them back ("That's… not possible." heard as "That is
 *  not possible": coverage 0.67 for a correct line, D27). Ambiguous ones take one reading on both sides. */
const EN_CONTRACTIONS: Record<string, string> = {
  "it's": 'it is', "that's": 'that is', "there's": 'there is', "here's": 'here is', "what's": 'what is', "who's": 'who is', "where's": 'where is', "how's": 'how is', "he's": 'he is', "she's": 'she is', "let's": 'let us',
  "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not', "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "can't": 'can not', cannot: 'can not', "couldn't": 'could not', "won't": 'will not', "wouldn't": 'would not', "shouldn't": 'should not', "haven't": 'have not', "hasn't": 'has not', "hadn't": 'had not', "mustn't": 'must not', "needn't": 'need not',
  "i'm": 'i am', "you're": 'you are', "we're": 'we are', "they're": 'they are',
  "i'll": 'i will', "you'll": 'you will', "he'll": 'he will', "she'll": 'she will', "we'll": 'we will', "they'll": 'they will', "it'll": 'it will', "that'll": 'that will',
  "i've": 'i have', "you've": 'you have', "we've": 'we have', "they've": 'they have', "could've": 'could have', "would've": 'would have', "should've": 'should have',
  "i'd": 'i would', "you'd": 'you would', "he'd": 'he would', "she'd": 'she would', "we'd": 'we would', "they'd": 'they would',
};

/** English contractions written out and every other apostrophe dropped ("'87" → "87", "static's" → "statics"), on
 *  both sides of the gate. Input: `normalizeLatin` output. */
export function foldEnglishContractions(normalized: string): string {
  return normalized.split(' ').map((w) => EN_CONTRACTIONS[w] ?? w.replace(/'/g, '')).join(' ').replace(/\s+/g, ' ').trim();
}

const fold = (x: string, lang: Language) => (lang === 'AR' ? normalizeIraqi(x) : foldEnglishNumbers(foldEnglishContractions(normalizeLatin(x.replace(/(\p{L})-(\p{L})/gu, '$1 $2')))));

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

/** The contract's thresholds (§1.4): a take is proven at coverage ≥ 0.7, a recorded line at ≥ 0.85, both with
 *  CER ≤ 0.15 after the dialect fold. Well below the gate the line is regenerated (FAIL); just below, or unmeasured
 *  (ASR outage), a person listens (REVIEW). Applied by verifyLine / judgeHeard in src/worker/handlers/voice.ts. */
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
