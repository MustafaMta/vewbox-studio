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

export interface SynthesizeInput { text: string; language: Language; dialect?: Dialect; referenceWav: string; referenceText?: string; emotion?: string; emotionAlpha?: number; speed?: number; engine?: TtsEngine; seed?: number }
export interface SynthesizeResult { file: string; sampleRate: number; durationSeconds: number; engine: string; model: string; ms: number }

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
  if (i.seed !== undefined) fd.set('seed', String(i.seed));
  const t0 = Date.now();
  const res = await post(`${tts(engine)}/synthesize`, fd, 10 * 60_000);
  const buf = Buffer.from(await res.arrayBuffer());
  const file = path.join(outDir, `line-${Date.now().toString(36)}.wav`);
  await fsp.writeFile(file, buf);
  const meta = { sampleRate: Number(res.headers.get('x-sample-rate') ?? 24000), durationSeconds: Number(res.headers.get('x-duration') ?? 0), engine: res.headers.get('x-engine') ?? engine, model: res.headers.get('x-model') ?? engine };
  log.info({ engine: meta.engine, ms: Date.now() - t0, chars: i.text.length, seconds: meta.durationSeconds }, 'tts line');
  return { file, ...meta, ms: Date.now() - t0 };
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

/** Normalise Arabic for comparing what was said with what was written: strip diacritics and tatweel, unify alef,
 *  taa marbuta and yaa, drop punctuation. */
export function normalizeArabic(s: string): string {
  return s.replace(/[ً-ْٰـ]/g, '').replace(/[إأآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Share of the intended words heard in order (longest common subsequence over normalised words). Insertions —
 *  a repeated phrase, a filler — do not lower it; missing or wrong words do. */
/** English words as the comparison sees them: typographic apostrophes folded to the plain one (a script's “I’ll” and
 *  Whisper's "I'll" are one word), everything that is not a letter, digit or apostrophe dropped. */
export function normalizeLatin(s: string): string {
  return s.replace(/[‘’ʼ`´]/g, "'").toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function scriptCoverage(reference: string, hypothesis: string, lang: Language): number {
  const norm = (x: string) => (lang === 'AR' ? normalizeArabic(x) : normalizeLatin(x));
  const r = norm(reference).split(' ').filter(Boolean); const h = norm(hypothesis).split(' ').filter(Boolean);
  if (r.length === 0) return 1;
  const dp: number[][] = Array.from({ length: r.length + 1 }, () => Array<number>(h.length + 1).fill(0));
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++) dp[i][j] = r[i - 1] === h[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[r.length][h.length] / r.length;
}

/** Word error rate between the intended line and the transcript (both normalised). */
export function wordErrorRate(reference: string, hypothesis: string, lang: Language): number {
  const norm = (x: string) => (lang === 'AR' ? normalizeArabic(x) : normalizeLatin(x));
  const r = norm(reference).split(' ').filter(Boolean); const h = norm(hypothesis).split(' ').filter(Boolean);
  if (r.length === 0) return h.length === 0 ? 0 : 1;
  const d: number[][] = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return d[r.length][h.length] / r.length;
}
