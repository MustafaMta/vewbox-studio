import fs from 'node:fs/promises';
import { StudioError } from '@/domain/errors';
import { env } from '../env';
import { log } from '../log';

/** MINIMAX — the hosted side of the studio. Video (H3 on the v2 API; the legacy v1 Hailuo path kept behind the
 *  same interface), music, speech and voice cloning. Every call carries the request id into the logs; errors map
 *  MiniMax's status codes to retryable / terminal, and nothing here ever falls back to another provider. */

export type MinimaxVideoStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface VideoContentItem { type: 'text' | 'image_url' | 'video_url' | 'audio_url'; text?: string; image_url?: { url: string }; video_url?: { url: string }; audio_url?: { url: string }; role?: 'first_frame' | 'last_frame' | 'reference_image' | 'reference_video' | 'reference_audio' }
export interface CreateVideoInput { model?: string; content: VideoContentItem[]; resolution?: string; duration: number; ratio?: string; promptExpansion?: 'disabled' | 'balanced' | 'quality'; callbackUrl?: string }
export interface VideoTask { id: string; status: MinimaxVideoStatus; model?: string; url?: string; resolution?: string; duration?: number; ratio?: string; usage?: Record<string, number>; error?: { code: string; message: string }; createdAt?: number; updatedAt?: number }

const RETRYABLE_V1 = new Set([1000, 1001, 1002, 1024, 1033, 1039, 2045]);
const TERMINAL_V1 = new Set([1004, 1008, 1026, 1027, 2013, 2049]);

export class MinimaxError extends StudioError {
  readonly status: number;
  readonly providerCode?: string;
  readonly retryable: boolean;
  readonly requestId?: string;
  constructor(message: string, o: { status: number; providerCode?: string; retryable: boolean; requestId?: string; details?: Record<string, unknown> }) {
    super('PROVIDER', message, { ...o.details, status: o.status, providerCode: o.providerCode, retryable: o.retryable, requestId: o.requestId });
    this.status = o.status; this.providerCode = o.providerCode; this.retryable = o.retryable; this.requestId = o.requestId;
  }
}

function key(): string {
  const k = env().MINIMAX_API_KEY;
  if (!k) throw new StudioError('NOT_CONFIGURED', 'MINIMAX_API_KEY is not set; hosted MiniMax video, music and speech are unavailable until it is.');
  return k;
}
const base = () => env().MINIMAX_BASE_URL.replace(/\/$/, '');

async function call<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 60_000);
  const url = `${base()}${path}`;
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, headers: { authorization: `Bearer ${key()}`, ...(init.body && !(init.body instanceof FormData) ? { 'content-type': 'application/json' } : {}), ...(init.headers ?? {}) } });
    const reqId = res.headers.get('x-request-id') ?? res.headers.get('trace-id') ?? undefined;
    const text = await res.text();
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
    const j = (json ?? {}) as { error?: { type?: string; message?: string; http_code?: string }; base_resp?: { status_code?: number; status_msg?: string }; request_id?: string };
    // v2 envelope: HTTP status + error.type
    if (!res.ok || j.error) {
      const type = j.error?.type ?? '';
      const retryable = res.status === 429 || res.status >= 500 || type === 'rate_limit_error' || type === 'server_error';
      log.warn({ url: path, status: res.status, type, msg: j.error?.message, reqId }, 'minimax request failed');
      throw new MinimaxError(`MiniMax ${path}: ${j.error?.message ?? j.base_resp?.status_msg ?? `HTTP ${res.status}`}`, { status: res.status, providerCode: type || String(j.base_resp?.status_code ?? res.status), retryable, requestId: j.request_id ?? reqId });
    }
    // v1 envelope: base_resp.status_code
    if (j.base_resp && j.base_resp.status_code && j.base_resp.status_code !== 0) {
      const code = j.base_resp.status_code;
      const retryable = RETRYABLE_V1.has(code) && !TERMINAL_V1.has(code);
      log.warn({ url: path, code, msg: j.base_resp.status_msg, reqId }, 'minimax v1 request failed');
      throw new MinimaxError(`MiniMax ${path}: ${j.base_resp.status_msg ?? code} (code ${code})`, { status: res.status, providerCode: String(code), retryable, requestId: j.request_id ?? reqId });
    }
    return json as T;
  } catch (e) {
    if (e instanceof MinimaxError) throw e;
    if ((e as Error).name === 'AbortError') throw new MinimaxError(`MiniMax ${path} timed out`, { status: 0, retryable: true });
    throw new MinimaxError(`MiniMax ${path}: ${(e as Error).message}`, { status: 0, retryable: true });
  } finally { clearTimeout(t); }
}

// ------------------------------------------------------------------------------------------------- video (v2, H3)

function parseTask(t: Record<string, unknown>): VideoTask {
  const content = (t.content as { url?: string } | undefined) ?? {};
  const err = t.error as { code?: string; message?: string } | undefined;
  return { id: String(t.id ?? t.task_id), status: String(t.status) as MinimaxVideoStatus, model: t.model as string | undefined, url: content.url, resolution: t.resolution as string | undefined, duration: t.duration as number | undefined, ratio: t.ratio as string | undefined, usage: t.usage as Record<string, number> | undefined, error: err ? { code: String(err.code ?? ''), message: String(err.message ?? '') } : undefined, createdAt: t.created_at as number | undefined, updatedAt: t.updated_at as number | undefined };
}

export async function createVideo(input: CreateVideoInput): Promise<{ taskId: string }> {
  const e = env();
  const body: Record<string, unknown> = { model: input.model ?? e.MINIMAX_VIDEO_MODEL, content: input.content, resolution: input.resolution ?? e.MINIMAX_VIDEO_RESOLUTION, duration: input.duration };
  if (input.ratio) body.ratio = input.ratio;
  if (input.callbackUrl) body.callback_url = input.callbackUrl;
  if (input.promptExpansion) body.extra = { prompt_expansion_mode: input.promptExpansion };
  const r = await call<{ task_id: string }>('/v2/video_generation', { method: 'POST', body: JSON.stringify(body), timeoutMs: 120_000 });
  return { taskId: r.task_id };
}

export async function queryVideo(taskId: string): Promise<VideoTask> {
  const r = await call<{ task: Record<string, unknown> }>(`/v2/query/video_generation/${encodeURIComponent(taskId)}`, { method: 'GET' });
  return parseTask(r.task ?? (r as unknown as Record<string, unknown>));
}

/** Cancels a queued task (no charge); for a finished task MiniMax deletes the record instead. */
export async function cancelVideo(taskId: string): Promise<{ action: string }> {
  const r = await call<{ action: string; status: string }>(`/v2/video_generation/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
  return { action: r.action ?? r.status };
}

/** Poll until the task finishes. `onTick` reports the provider status for the job's progress. Download URLs are
 *  time-limited, so the caller downloads at once. */
export async function waitForVideo(taskId: string, opts: { intervalMs?: number; timeoutMs?: number; onTick?: (t: VideoTask) => Promise<void> | void; shouldStop?: () => Promise<boolean> | boolean } = {}): Promise<VideoTask> {
  const started = Date.now();
  const interval = opts.intervalMs ?? 10_000;
  const timeout = opts.timeoutMs ?? 40 * 60_000;
  for (;;) {
    if (await opts.shouldStop?.()) throw new StudioError('CONFLICT', 'cancelled');
    const t = await queryVideo(taskId);
    await opts.onTick?.(t);
    if (t.status === 'succeeded') {
      if (!t.url) throw new MinimaxError('MiniMax reported success without a download url', { status: 200, retryable: true, details: { taskId } });
      return t;
    }
    if (t.status === 'failed') {
      const code = t.error?.code ?? '';
      const moderation = code === '1026' || code === '1027' || /sensitive/i.test(t.error?.message ?? '');
      throw new MinimaxError(`MiniMax video failed: ${t.error?.message ?? 'unknown error'}${code ? ` (code ${code})` : ''}`, { status: 200, providerCode: code, retryable: !moderation, details: { taskId, moderation } });
    }
    if (t.status === 'cancelled') throw new MinimaxError('MiniMax video task was cancelled', { status: 200, retryable: false, details: { taskId } });
    if (Date.now() - started > timeout) throw new MinimaxError(`MiniMax video task ${taskId} did not finish within ${Math.round(timeout / 60000)} min`, { status: 0, retryable: true, details: { taskId, lastStatus: t.status } });
    await new Promise((r) => setTimeout(r, interval));
  }
}

/** Stream a provider URL to disk. */
export async function download(url: string, dest: string, opts: { timeoutMs?: number } = {}): Promise<{ bytes: number }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20 * 60_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok || !res.body) throw new MinimaxError(`download failed: HTTP ${res.status}`, { status: res.status, retryable: res.status >= 500 || res.status === 403 });
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(dest, buf);
    return { bytes: buf.length };
  } finally { clearTimeout(t); }
}

/** Upload a local file so a request can refer to it as `mm_file://{id}` (7-day retention). */
export async function uploadFile(file: string, purpose: 'video_generation_input' | 'voice_clone' | 'prompt_audio' | 't2a_async_input', filename?: string): Promise<{ fileId: string }> {
  const buf = await fs.readFile(file);
  const fd = new FormData();
  fd.set('purpose', purpose);
  fd.set('file', new Blob([buf]), filename ?? file.split(/[\\/]/).pop() ?? 'file');
  const r = await call<{ file: { file_id: string | number } }>('/v1/files/upload', { method: 'POST', body: fd, timeoutMs: 300_000 });
  return { fileId: String(r.file.file_id) };
}

/** A data URI for a local image, the simplest way to hand MiniMax a first frame or reference without a public URL. */
export async function dataUri(file: string, mime: string): Promise<string> {
  const buf = await fs.readFile(file);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

// ---------------------------------------------------------------------------------------------------------- music

export interface MusicInput { prompt: string; lyrics?: string; instrumental?: boolean; model?: string; format?: 'mp3' | 'wav'; sampleRate?: number; bitrate?: number }

/** `POST /v1/music_generation` — closed to new accounts since 2026-08-20; existing paying accounts still work. */
export async function generateMusic(input: MusicInput): Promise<{ bytes: Buffer; format: string; traceId?: string }> {
  const body = { model: input.model ?? env().MINIMAX_MUSIC_MODEL, prompt: input.prompt, lyrics: input.lyrics ?? '', is_instrumental: Boolean(input.instrumental), stream: false, output_format: 'hex', audio_setting: { sample_rate: input.sampleRate ?? 44100, bitrate: input.bitrate ?? 256000, format: input.format ?? 'mp3' } };
  const r = await call<{ data?: { audio?: string; status?: number }; trace_id?: string }>('/v1/music_generation', { method: 'POST', body: JSON.stringify(body), timeoutMs: 600_000 });
  const hex = r.data?.audio;
  if (!hex) throw new MinimaxError('MiniMax music returned no audio', { status: 200, retryable: true });
  return { bytes: Buffer.from(hex, 'hex'), format: input.format ?? 'mp3', traceId: r.trace_id };
}

// --------------------------------------------------------------------------------------------------------- speech

export interface SpeechInput { text: string; voiceId: string; model?: string; languageBoost?: string; emotion?: string; speed?: number; pitch?: number; format?: 'mp3' | 'wav' | 'flac'; sampleRate?: number }

export async function speak(input: SpeechInput): Promise<{ bytes: Buffer; format: string; durationMs?: number; traceId?: string }> {
  const body = { model: input.model ?? env().MINIMAX_SPEECH_MODEL, text: input.text, stream: false, output_format: 'hex', language_boost: input.languageBoost ?? 'auto', voice_setting: { voice_id: input.voiceId, speed: input.speed ?? 1, vol: 1, pitch: input.pitch ?? 0, ...(input.emotion ? { emotion: input.emotion } : {}) }, audio_setting: { sample_rate: input.sampleRate ?? 32000, bitrate: 128000, format: input.format ?? 'mp3', channel: 1 } };
  const r = await call<{ data?: { audio?: string }; extra_info?: { audio_length?: number }; trace_id?: string }>('/v1/t2a_v2', { method: 'POST', body: JSON.stringify(body), timeoutMs: 300_000 });
  const hex = r.data?.audio;
  if (!hex) throw new MinimaxError('MiniMax speech returned no audio', { status: 200, retryable: true });
  return { bytes: Buffer.from(hex, 'hex'), format: input.format ?? 'mp3', durationMs: r.extra_info?.audio_length, traceId: r.trace_id };
}

/** Rapid voice clone from a 10 s – 5 min recording. The id is reusable; MiniMax deletes clones unused for 7 days. */
export async function cloneVoice(input: { file: string; voiceId: string; previewText?: string; languageBoost?: string; model?: string }): Promise<{ voiceId: string; demoUrl?: string }> {
  const up = await uploadFile(input.file, 'voice_clone');
  const body = { file_id: Number(up.fileId) || up.fileId, voice_id: input.voiceId, ...(input.previewText ? { text: input.previewText, model: input.model ?? env().MINIMAX_SPEECH_MODEL } : {}), ...(input.languageBoost ? { language_boost: input.languageBoost } : {}), need_noise_reduction: true, need_volume_normalization: true };
  const r = await call<{ demo_audio?: string }>('/v1/voice_clone', { method: 'POST', body: JSON.stringify(body), timeoutMs: 300_000 });
  return { voiceId: input.voiceId, demoUrl: r.demo_audio };
}

/** Pricing as published on 2026-10-02 (USD per output second), for the take record; absent for unknown models. */
export function estimateVideoCostUsd(model: string, resolution: string, seconds: number, inputImages = 0): number | undefined {
  const m = model.toLowerCase();
  if (m === 'minimax-h3') { const per = resolution === '2K' ? 0.13 : 0.08; return per * seconds + Math.max(0, inputImages - 5) * 0.04; }
  if (m === 'minimax-h3-max') { const per = resolution === '480P' ? 0.05 : 0.08; return per * seconds + Math.max(0, inputImages - 2) * 0.074; }
  return undefined;
}
