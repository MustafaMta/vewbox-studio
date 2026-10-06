import type { Asset, CutNote, StudioState } from '@/domain/types';
import type { Command } from '@/domain/commands';
import type { Job, JobEvent, JobPayload, JobType } from '@/domain/jobs';
import { StudioError, type StudioErrorCode } from '@/domain/errors';
import type { VoiceReferenceResult } from '@/components/character/contract';

/** THE BROWSER'S VIEW OF THE API — thin typed fetchers. Every error becomes a StudioError with the server's code
 *  and message, so pages can show the reason rather than "request failed". */

export interface Capabilities { minimax: boolean; llm: string | null; anthropic: boolean; openaiCompatible: boolean; comfyui: string; tts: string; asr: string; videoModel: string; videoResolution: string }
/** Live engine health from GET /api/status: whether each engine is reachable right now, and where it runs. */
export interface EngineHealth { ok: boolean; detail: string; where: 'hosted' | 'local' | null; backend?: string; model?: string }
export interface EngineStatus { video: EngineHealth; story: EngineHealth; images: EngineHealth; voice: EngineHealth; transcription: EngineHealth; music: EngineHealth; gpu: { device?: string; vramTotal?: number; vramFree?: number } | null; minimaxConfigured: boolean; /** the local helpers the checks and voices need (word timing, lip-sync and face checks, voice design, Iraqi voices) */ checks?: Record<string, EngineCheck> }
export interface EngineCheck { name: string; does: string; ok: boolean; detail: string }
/** contract §1.2 — the validation `POST /api/assets` returns for `purpose: 'character-reference'`. */
export interface ImageReferenceValidation { ok: boolean; width: number; height: number; sharpness?: number; faces?: number; faceBoxHeight?: number; reasons: string[] }
/** `notes`: the Screening Room notes (docs/CONTRACTS-REDESIGN-BACKEND.md B2), beside the state, never in its hash. */
export interface SnapshotResponse { state: StudioState; version: number; hash: string; seeded: { kind: string | null; at: string | null; version: number } | null; capabilities: Capabilities; notes: CutNote[]; /** which settings take effect today (src/domain/settings.ts) */ settingsHonoured?: import('@/domain/settings').SettingsHonoured }
/** What `POST /api/jobs` may add to a queued character job: the preflight's warnings (e.g. "identity not approved",
 *  "an approved image is replaced by a draft"). The job runs; the producer is told. */
export interface JobWarning { name: string; detail: string; characterIds?: string[] }
/** A job as `startJob` hands it back: the queued record plus any warnings that came with it. */
export type StartedJob = Job & { warnings?: JobWarning[] };
export type BatchResponse = ({ ok: true; version: number; hash: string; results: unknown[] } | { ok: false; version: number; hash: string; results: unknown[]; failedAt: number; error: { code: string; message: string; details?: Record<string, unknown> } }) & { replayed?: boolean };

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | null)?.error;
    // the HTTP status travels with the error: a refusal (4xx) is never retried like a network failure (send-policy.ts)
    throw new StudioError((err?.code as StudioErrorCode) ?? 'UNAVAILABLE', err?.message ?? `The server answered ${res.status}.`, { ...err?.details, httpStatus: res.status });
  }
  return body as T;
}

/** Writes are sent `keepalive` when small enough (the browser's limit is 64 KB in flight): a batch of edits or a reset
 *  then survives the page being left mid-request, instead of being cut off by the navigation. */
const jsonInit = (method: string, body: unknown): RequestInit => { const text = JSON.stringify(body); return { method, headers: { 'Content-Type': 'application/json' }, body: text, keepalive: text.length < 48_000 }; };

export const api = {
  snapshot: () => fetch('/api/studio', { cache: 'no-store' }).then((r) => parse<SnapshotResponse>(r)),
  /** `batchId`: the batch's identity; sending the same batch again (after a network error) with the same id is answered
   *  from the server's command journal instead of being applied twice. */
  commands: async (clientId: string, commands: Command[], batchId?: string): Promise<BatchResponse> => {
    const res = await fetch('/api/commands', jsonInit('POST', { clientId, commands, ...(batchId ? { batchId } : {}) }));
    if (res.status === 409) return (await res.json()) as BatchResponse;
    return parse<BatchResponse>(res);
  },
  upload: async (file: File, meta: { label?: string; tags?: string[]; expect?: Asset['kind'] }): Promise<Asset> => {
    const fd = new FormData();
    fd.set('file', file, file.name);
    if (meta.label) fd.set('label', meta.label);
    if (meta.tags?.length) fd.set('tags', meta.tags.join(','));
    if (meta.expect) fd.set('expect', meta.expect);
    const r = await parse<{ asset: Asset }>(await fetch('/api/assets', { method: 'POST', body: fd }));
    return r.asset;
  },
  /** contract §1.2 — a character reference picture: `expect: IMAGE`, `purpose: 'character-reference'`; the server
   *  measures it (size, sharpness, one face) and answers with the asset and the validation. The caller refreshes the
   *  snapshot afterwards so the asset appears in the library. */
  uploadReference: async (file: File, meta: { label?: string; tags?: string[] }): Promise<{ asset: Asset; validation?: ImageReferenceValidation }> => {
    const fd = new FormData();
    fd.set('file', file, file.name);
    fd.set('expect', 'IMAGE'); fd.set('purpose', 'character-reference');
    if (meta.label) fd.set('label', meta.label);
    if (meta.tags?.length) fd.set('tags', meta.tags.join(','));
    return parse<{ asset: Asset; validation?: ImageReferenceValidation }>(await fetch('/api/assets', { method: 'POST', body: fd }));
  },
  /** contract §1.4 — `POST /api/characters/{id}/voice-reference` (multipart: file, label, language, dialect). The
   *  server validates the recording (duration, sample rate, loudness, peak, speech by ASR, language), trims the window
   *  and records the sample; a refusal comes back as `{ ok: false, code, message }` (HTTP 4xx), not as an exception. */
  uploadVoiceReference: async (id: string, file: File, meta: { label?: string; language?: string; dialect?: string; transcript?: string; /** voice identity v2: the producer's consent statement, required for a real person's recording */ consent?: 'MY_VOICE' | 'SPEAKER_PERMISSION' }): Promise<VoiceReferenceResult> => {
    const fd = new FormData();
    fd.set('file', file, file.name);
    if (meta.consent) fd.set('consent', meta.consent);
    if (meta.label) fd.set('label', meta.label);
    if (meta.language) fd.set('language', meta.language);
    if (meta.dialect) fd.set('dialect', meta.dialect);
    if (meta.transcript) fd.set('transcript', meta.transcript);
    const res = await fetch(`/api/characters/${encodeURIComponent(id)}/voice-reference`, { method: 'POST', body: fd });
    const text = await res.text();
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : null; } catch { /* not json */ }
    const b = body as { ok?: boolean; code?: string; message?: string; error?: { code?: string; message?: string } } | null;
    if (b && b.ok === false && b.code) return b as VoiceReferenceResult;
    if (!res.ok) throw new StudioError((b?.error?.code as StudioErrorCode) ?? 'UNAVAILABLE', b?.error?.message ?? b?.message ?? `The server answered ${res.status}.`);
    return b as unknown as VoiceReferenceResult;
  },
  /** Live engine health (GET /api/status), for gating a GPU button before it is pressed. */
  status: () => fetch('/api/status', { cache: 'no-store' }).then((r) => parse<EngineStatus>(r)),
  deleteAsset: (id: string) => fetch(`/api/assets/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) => parse<{ ok: true }>(r)),
  /** Empty the studio (the sample studio is a test fixture the browser never asks for). */
  reset: (kind: 'empty') => fetch('/api/studio/reset', jsonInit('POST', { kind })).then((r) => parse<{ version: number; hash: string }>(r)),
  jobs: (q: { productionId?: string; active?: boolean; limit?: number } = {}) => {
    const sp = new URLSearchParams();
    if (q.productionId) sp.set('productionId', q.productionId);
    if (q.active) sp.set('active', '1');
    if (q.limit) sp.set('limit', String(q.limit));
    return fetch(`/api/jobs?${sp}`, { cache: 'no-store' }).then((r) => parse<{ jobs: Job[] }>(r)).then((r) => r.jobs);
  },
  job: (id: string) => fetch(`/api/jobs/${encodeURIComponent(id)}`, { cache: 'no-store' }).then((r) => parse<{ job: Job; events: JobEvent[] }>(r)),
  startJob: <T extends JobType>(type: T, payload: JobPayload<T>, opts: { idempotencyKey?: string; priority?: number } = {}) => fetch('/api/jobs', jsonInit('POST', { type, payload, ...opts })).then((r) => parse<{ job: Job; created: boolean; warnings?: JobWarning[] }>(r)),
  cancelJob: (id: string) => fetch(`/api/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' }).then((r) => parse<{ job: Job }>(r)).then((r) => r.job),
  retryJob: (id: string, changeMade?: string) => fetch(`/api/jobs/${encodeURIComponent(id)}/retry`, changeMade ? jsonInit('POST', { changeMade }) : { method: 'POST' }).then((r) => parse<{ job: Job }>(r)).then((r) => r.job),
  proposal: (id: string) => fetch(`/api/proposals/${encodeURIComponent(id)}`, { cache: 'no-store' }).then((r) => parse<{ id: string; jobId: string | null; proposal: import('@/domain/types').IdeaProposal; request: unknown }>(r)),
  health: () => fetch('/api/health', { cache: 'no-store' }).then((r) => r.json()),
};
