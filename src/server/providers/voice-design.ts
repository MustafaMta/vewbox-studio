import { createHash } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { StudioError } from '@/domain/errors';
import type { Language } from '@/domain/vocabulary';
import { env } from '../env';
import { log } from '../log';

/** THE VOICE-DESIGN SERVICE — docker/tts-design on the local GPU (:8022). VoxCPM2 designs a synthetic voice from a text
 *  description alone (English and MSA; no audio goes in, so the voice belongs to nobody — Rule V-DESIGN in
 *  docs/research/VOICE-IDENTITY-V2.md §2.3), and an ECAPA speaker encoder turns a recording into a 192-d vector for
 *  similarity, seed-to-seed consistency and cast distinctness. Every answer is validated here; a service that is not
 *  configured, not running or not ready, and one that answers nonsense, become the studio's own error classes:
 *    NOT_CONFIGURED  TTS_DESIGN_URL empty, or the service has no weights yet (503)
 *    UNAVAILABLE     not reachable, or no answer in time
 *    INVALID         the service refused the request (400/422: e.g. a description that names a resemblance)
 *    PROVIDER        any other failure, or an answer that does not match the contract (sha256, shape, sizes) */

export const DESIGN_MAX_CANDIDATES = 3;

const finiteOrNull = z.number().finite().nullable();

const DesignFileSchema = z.object({
  sample_rate: z.number().int().positive(),
  channels: z.literal(1),
  subtype: z.string(),
  bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  duration: z.number().positive(),
  true_peak_dbtp: finiteOrNull,
  input_true_peak_dbtp: finiteOrNull,
  gain_reduction_db: finiteOrNull,
  limited_samples: z.number().int().nonnegative(),
  trim_db: z.number().optional(),
  lufs: finiteOrNull,
  ebur128_true_peak_dbtp: finiteOrNull,
  clipped_samples: z.number().int().nonnegative(),
  wav_base64: z.string().min(16),
});

const EmbeddingSchema = z.array(z.number().finite()).length(192);

const DesignResponseSchema = z.object({
  ok: z.literal(true),
  design_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  engine: z.string(),
  model: z.string(),
  engine_version: z.string().min(1),
  language: z.enum(['en', 'ar']),
  description: z.string(),
  text: z.string(),
  seed: z.number().int().nonnegative(),
  seeds: z.array(z.number().int().nonnegative()).min(1).max(DESIGN_MAX_CANDIDATES),
  params: z.object({ seed: z.number().int(), n: z.number().int(), cfg_value: z.number(), inference_timesteps: z.number().int(), loudness_target: z.number().optional() }).passthrough(),
  ms: z.number().nonnegative(),
  candidates: z.array(z.object({
    index: z.number().int().positive(),
    seed: z.number().int().nonnegative(),
    generation_ms: z.number().nonnegative(),
    native: DesignFileSchema,
    reference: DesignFileSchema,
    embedding: EmbeddingSchema.optional(),
    static_gain_db: z.number().optional(),
  })).min(1).max(DESIGN_MAX_CANDIDATES),
  similarity: z.object({ model: z.string(), version: z.string().optional(), matrix: z.array(z.array(z.number())).optional(), error: z.string().optional() }).nullable(),
  label: z.string(),
});

const HealthSchema = z.object({
  ok: z.boolean(),
  engine: z.string(),
  engine_version: z.string(),
  ecapa_version: z.string(),
  loaded: z.boolean(),
  ecapa_loaded: z.boolean(),
  weights_present: z.boolean(),
  ecapa_weights_present: z.boolean(),
  gpu: z.object({ used_mb: z.number(), total_mb: z.number() }).nullable(),
  torch: z.object({ allocated_mb: z.number(), reserved_mb: z.number(), peak_reserved_mb: z.number() }).nullable(),
  peak_ceiling_dbtp: z.number(),
  max_candidates: z.number().int(),
}).passthrough();

const EmbedSchema = z.object({ ok: z.literal(true), model: z.string(), version: z.string(), dim: z.literal(192), embedding: EmbeddingSchema, duration: z.number().positive(), ms: z.number().nonnegative() });
const SimilaritySchema = z.object({ ok: z.literal(true), model: z.string(), version: z.string(), cosine: z.number().min(-1).max(1), a: z.object({ duration: z.number() }), b: z.object({ duration: z.number() }), ms: z.number().nonnegative() });

export type DesignHealth = z.infer<typeof HealthSchema>;

export interface DesignInput {
  /** Attributes only (sex, age, pitch, pace, timbre, accent, mood, recording quality) — never a person (Rule V-DESIGN §4). */
  description: string;
  /** The sentence(s) every candidate speaks: the same text for all, so they can be compared (§2.7). */
  text: string;
  language: Language;
  /** Candidate k uses seed + k; the service draws one when absent and reports it. */
  seed?: number;
  /** 1–3 candidates (default 3). */
  n?: number;
  cfgValue?: number;
  inferenceTimesteps?: number;
  /** The VoiceDesignRecord id; written into every file's provenance tag. Drawn by the service when absent. */
  designId?: string;
  /** Static gain to this integrated loudness (LUFS) before the limiter; off by default. */
  loudnessTarget?: number;
}

export interface DesignFile {
  file?: string;
  sampleRate: number; durationSeconds: number; bytes: number; sha256: string;
  truePeakDbtp: number | null; inputTruePeakDbtp: number | null; gainReductionDb: number | null; limitedSamples: number;
  /** Extra static trim (dB, ≤ 0) applied so ffmpeg's true-peak meter also reads ≤ the ceiling. */
  trimDb: number;
  lufs: number | null; ebur128TruePeakDbtp: number | null; clippedSamples: number;
}

export interface DesignCandidate {
  index: number; seed: number; generationMs: number;
  /** VoxCPM2's own 48 kHz output (peak-limited). */
  native: DesignFile;
  /** 24 kHz mono, what IndexTTS / Habibi take as a reference. Its sha256 is the one a VoiceDesignRecord pins. */
  reference: DesignFile;
  /** ECAPA 192-d, L2-normalised, of the 24 kHz reference (absent when the service has no ECAPA weights). */
  embedding?: number[];
  staticGainDb?: number;
}

export interface DesignResult {
  designId: string; engine: string; model: string; engineVersion: string; language: Language;
  description: string; text: string; seed: number; seeds: number[];
  params: Record<string, number>; ms: number; candidates: DesignCandidate[];
  /** Pairwise ECAPA cosine between the candidates (index order), when available. */
  similarity: number[][] | null; similarityModel?: string;
  label: string;
}

const base = (): string => {
  const u = (env().TTS_DESIGN_URL ?? '').trim();
  if (!u) throw new StudioError('NOT_CONFIGURED', 'Automatic voice creation needs the voice-design engine: set TTS_DESIGN_URL and start the tts-design service.');
  return u.replace(/\/$/, '');
};

const route = (url: string) => url.replace(/^https?:\/\/[^/]+/, '');

async function call(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let detail = text; try { const d = (JSON.parse(text) as { detail?: unknown }).detail; detail = typeof d === 'string' ? d : d !== undefined ? JSON.stringify(d) : text; } catch { /* plain */ }
      const code = res.status === 503 ? 'NOT_CONFIGURED' : res.status === 400 || res.status === 422 ? 'INVALID' : 'PROVIDER';
      throw new StudioError(code, `${route(url)}: ${detail.slice(0, 400)}`, { status: res.status });
    }
    return res;
  } catch (e) {
    if (e instanceof StudioError) throw e;
    const cause = (e as Error & { cause?: { code?: string; message?: string } }).cause;
    const why = cause?.code ?? cause?.message ?? (e as Error).message;
    const timedOut = (e as Error).name === 'AbortError' || /TIMEOUT/i.test(why);
    throw new StudioError('UNAVAILABLE', timedOut ? `${route(url)} did not answer in time (${why}); the voice-design engine may be loading.` : `${route(url)} is not reachable (${why}). Start the tts-design service.`);
  } finally { clearTimeout(t); }
}

async function json<T>(res: Response, schema: z.ZodType<T>, what: string): Promise<T> {
  let body: unknown;
  try { body = await res.json(); } catch { throw new StudioError('PROVIDER', `${what}: the voice-design service did not answer with JSON.`); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new StudioError('PROVIDER', `${what}: unexpected answer (${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}).`);
  return parsed.data;
}

export async function designHealth(timeoutMs = 5_000): Promise<DesignHealth> {
  const res = await call(`${base()}/health`, { method: 'GET' }, timeoutMs);
  return json(res, HealthSchema, '/health');
}

/** Design 1–3 candidate voices. With `outDir`, both files of every candidate are written there (after checking that
 *  their bytes hash to the sha256 the service reported) and their paths returned; without it, nothing is written. */
export async function designVoice(i: DesignInput, outDir?: string, timeoutMs = 15 * 60_000): Promise<DesignResult> {
  const fd = new FormData();
  fd.set('description', i.description);
  fd.set('text', i.text);
  fd.set('language', i.language === 'AR' ? 'ar' : 'en');
  if (i.seed !== undefined) fd.set('seed', String(Math.trunc(i.seed)));
  if (i.n !== undefined) fd.set('n', String(Math.trunc(i.n)));
  if (i.cfgValue !== undefined) fd.set('cfg_value', String(i.cfgValue));
  if (i.inferenceTimesteps !== undefined) fd.set('inference_timesteps', String(Math.trunc(i.inferenceTimesteps)));
  if (i.designId) fd.set('design_id', i.designId);
  if (i.loudnessTarget !== undefined) fd.set('loudness_target', String(i.loudnessTarget));
  const t0 = Date.now();
  const res = await call(`${base()}/design`, { method: 'POST', body: fd }, timeoutMs);
  const headerVersion = res.headers.get('x-engine-version');
  const headerSeed = res.headers.get('x-seed');
  const j = await json(res, DesignResponseSchema, '/design');
  if (headerVersion !== null && headerVersion !== j.engine_version) throw new StudioError('PROVIDER', '/design: x-engine-version header and body disagree.');
  if (headerSeed !== null && Number(headerSeed) !== j.seed) throw new StudioError('PROVIDER', '/design: x-seed header and body disagree.');
  if (outDir) await fsp.mkdir(outDir, { recursive: true });

  const candidates: DesignCandidate[] = [];
  for (const c of j.candidates) {
    const files: { native?: string; reference?: string } = {};
    for (const kind of ['native', 'reference'] as const) {
      const f = c[kind];
      const bytes = Buffer.from(f.wav_base64, 'base64');
      const sha = createHash('sha256').update(bytes).digest('hex');
      if (bytes.length !== f.bytes || sha !== f.sha256) throw new StudioError('PROVIDER', `/design: candidate ${c.index} ${kind} file does not match its reported size/sha256.`);
      if (outDir) {
        const name = `${j.design_id}-c${c.index}-s${c.seed}-${Math.round(f.sample_rate / 1000)}k.wav`;
        files[kind] = path.join(outDir, name);
        await fsp.writeFile(files[kind]!, bytes);
      }
    }
    const meta = (f: z.infer<typeof DesignFileSchema>, file?: string): DesignFile => ({
      file, sampleRate: f.sample_rate, durationSeconds: f.duration, bytes: f.bytes, sha256: f.sha256,
      truePeakDbtp: f.true_peak_dbtp, inputTruePeakDbtp: f.input_true_peak_dbtp, gainReductionDb: f.gain_reduction_db, limitedSamples: f.limited_samples, trimDb: f.trim_db ?? 0,
      lufs: f.lufs, ebur128TruePeakDbtp: f.ebur128_true_peak_dbtp, clippedSamples: f.clipped_samples,
    });
    candidates.push({ index: c.index, seed: c.seed, generationMs: c.generation_ms, native: meta(c.native, files.native), reference: meta(c.reference, files.reference), embedding: c.embedding, staticGainDb: c.static_gain_db });
  }
  const params: Record<string, number> = {};
  for (const [k, v] of Object.entries(j.params)) if (typeof v === 'number' && Number.isFinite(v)) params[k] = v;
  log.info({ designId: j.design_id, engine: j.engine, version: j.engine_version, seeds: j.seeds, candidates: candidates.length, ms: Date.now() - t0 }, 'voice design');
  return {
    designId: j.design_id, engine: j.engine, model: j.model, engineVersion: j.engine_version, language: j.language === 'ar' ? 'AR' : 'EN',
    description: j.description, text: j.text, seed: j.seed, seeds: j.seeds, params, ms: j.ms, candidates,
    similarity: j.similarity?.matrix ?? null, similarityModel: j.similarity?.model, label: j.label,
  };
}

const audioBlob = async (file: string) => new Blob([await fsp.readFile(file)]);

/** ECAPA speaker embedding of a recording: 192 numbers, L2-normalised (so a dot product is the cosine). */
export async function embedVoice(file: string, timeoutMs = 120_000): Promise<{ embedding: number[]; model: string; version: string; durationSeconds: number }> {
  const fd = new FormData();
  fd.set('audio', await audioBlob(file), path.basename(file));
  const j = await json(await call(`${base()}/embed`, { method: 'POST', body: fd }, timeoutMs), EmbedSchema, '/embed');
  const norm = Math.sqrt(j.embedding.reduce((s, v) => s + v * v, 0));
  if (Math.abs(norm - 1) > 1e-3) throw new StudioError('PROVIDER', `/embed: the embedding is not normalised (|v| = ${norm.toFixed(4)}).`);
  return { embedding: j.embedding, model: j.model, version: j.version, durationSeconds: j.duration };
}

/** ECAPA cosine similarity of two recordings (1 = same vector; VoxCeleb-trained, so relative, never an identity proof). */
export async function voiceSimilarity(a: string, b: string, timeoutMs = 120_000): Promise<{ cosine: number; model: string; version: string }> {
  const fd = new FormData();
  fd.set('a', await audioBlob(a), path.basename(a));
  fd.set('b', await audioBlob(b), path.basename(b));
  const j = await json(await call(`${base()}/similarity`, { method: 'POST', body: fd }, timeoutMs), SimilaritySchema, '/similarity');
  return { cosine: j.cosine, model: j.model, version: j.version };
}

/** Cosine of two already-normalised embeddings (from embedVoice or a design candidate). */
export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) throw new StudioError('INVALID', 'Embeddings of different lengths cannot be compared.');
  let dot = 0, na = 0, nb = 0;
  for (let k = 0; k < a.length; k++) { dot += a[k] * b[k]; na += a[k] * a[k]; nb += b[k] * b[k]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/** Free the GPU (VoxCPM2) and the encoder; quiet when the service is not running. */
export async function unloadDesign(): Promise<void> { try { await fetch(`${base()}/unload`, { method: 'POST', signal: AbortSignal.timeout(20_000) }); } catch { /* not running or not configured */ } }
