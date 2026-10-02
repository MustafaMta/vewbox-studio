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

const tts = (engine: Exclude<TtsEngine, 'auto'>) => (engine === 'habibi' ? (process.env.TTS_HABIBI_URL || env().TTS_URL.replace(/:8020\b/, ':8021')) : env().TTS_URL).replace(/\/$/, '');
const asr = () => env().ASR_URL.replace(/\/$/, '');

async function post(url: string, fd: FormData, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'POST', body: fd, signal: ctrl.signal });
    if (!res.ok) { const text = await res.text().catch(() => ''); let detail = text; try { detail = (JSON.parse(text) as { detail?: string }).detail ?? text; } catch { /* plain */ } throw new StudioError(res.status === 503 ? 'NOT_CONFIGURED' : 'PROVIDER', `${url.replace(/^https?:\/\/[^/]+/, '')}: ${detail.slice(0, 400)}`, { status: res.status }); }
    return res;
  } catch (e) {
    if (e instanceof StudioError) throw e;
    throw new StudioError('UNAVAILABLE', `${url.replace(/^https?:\/\/[^/]+/, '')} is not reachable (${(e as Error).message}). Start the service.`);
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

export async function unloadTts(): Promise<void> { for (const e of ['indextts', 'habibi'] as const) { try { await fetch(`${tts(e)}/unload`, { method: 'POST', signal: AbortSignal.timeout(20_000) }); } catch { /* not running */ } } }
export async function unloadAsr(): Promise<void> { try { await fetch(`${asr()}/unload`, { method: 'POST', signal: AbortSignal.timeout(20_000) }); } catch { /* not running */ } }

/** Normalise Arabic for comparing what was said with what was written: strip diacritics and tatweel, unify alef,
 *  taa marbuta and yaa, drop punctuation. */
export function normalizeArabic(s: string): string {
  return s.replace(/[ً-ْٰـ]/g, '').replace(/[إأآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Word error rate between the intended line and the transcript (both normalised). */
export function wordErrorRate(reference: string, hypothesis: string, lang: Language): number {
  const norm = (x: string) => (lang === 'AR' ? normalizeArabic(x) : x.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').replace(/\s+/g, ' ').trim());
  const r = norm(reference).split(' ').filter(Boolean); const h = norm(hypothesis).split(' ').filter(Boolean);
  if (r.length === 0) return h.length === 0 ? 0 : 1;
  const d: number[][] = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return d[r.length][h.length] / r.length;
}
