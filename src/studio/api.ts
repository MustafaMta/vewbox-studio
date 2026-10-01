import type { Asset, StudioState } from '@/domain/types';
import type { Command } from '@/domain/commands';
import type { Job, JobEvent, JobPayload, JobType } from '@/domain/jobs';
import { StudioError, type StudioErrorCode } from '@/domain/errors';

/** THE BROWSER'S VIEW OF THE API — thin typed fetchers. Every error becomes a StudioError with the server's code
 *  and message, so pages can show the reason rather than "request failed". */

export interface Capabilities { minimax: boolean; llm: string | null; anthropic: boolean; openaiCompatible: boolean; comfyui: string; tts: string; asr: string; videoModel: string; videoResolution: string }
export interface SnapshotResponse { state: StudioState; version: number; hash: string; seeded: { kind: string | null; at: string | null; version: number } | null; capabilities: Capabilities }
export type BatchResponse = { ok: true; version: number; hash: string; results: unknown[] } | { ok: false; version: number; hash: string; results: unknown[]; failedAt: number; error: { code: string; message: string; details?: Record<string, unknown> } };

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | null)?.error;
    throw new StudioError((err?.code as StudioErrorCode) ?? 'UNAVAILABLE', err?.message ?? `The server answered ${res.status}.`, err?.details);
  }
  return body as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const api = {
  snapshot: () => fetch('/api/studio', { cache: 'no-store' }).then((r) => parse<SnapshotResponse>(r)),
  commands: async (clientId: string, commands: Command[]): Promise<BatchResponse> => {
    const res = await fetch('/api/commands', jsonInit('POST', { clientId, commands }));
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
  deleteAsset: (id: string) => fetch(`/api/assets/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) => parse<{ ok: true }>(r)),
  reset: (kind: 'sample' | 'empty') => fetch('/api/studio/reset', jsonInit('POST', { kind })).then((r) => parse<{ version: number; hash: string }>(r)),
  jobs: (q: { productionId?: string; active?: boolean; limit?: number } = {}) => {
    const sp = new URLSearchParams();
    if (q.productionId) sp.set('productionId', q.productionId);
    if (q.active) sp.set('active', '1');
    if (q.limit) sp.set('limit', String(q.limit));
    return fetch(`/api/jobs?${sp}`, { cache: 'no-store' }).then((r) => parse<{ jobs: Job[] }>(r)).then((r) => r.jobs);
  },
  job: (id: string) => fetch(`/api/jobs/${encodeURIComponent(id)}`, { cache: 'no-store' }).then((r) => parse<{ job: Job; events: JobEvent[] }>(r)),
  startJob: <T extends JobType>(type: T, payload: JobPayload<T>, opts: { idempotencyKey?: string; priority?: number } = {}) => fetch('/api/jobs', jsonInit('POST', { type, payload, ...opts })).then((r) => parse<{ job: Job; created: boolean }>(r)),
  cancelJob: (id: string) => fetch(`/api/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' }).then((r) => parse<{ job: Job }>(r)).then((r) => r.job),
  retryJob: (id: string) => fetch(`/api/jobs/${encodeURIComponent(id)}/retry`, { method: 'POST' }).then((r) => parse<{ job: Job }>(r)).then((r) => r.job),
  proposal: (id: string) => fetch(`/api/proposals/${encodeURIComponent(id)}`, { cache: 'no-store' }).then((r) => parse<{ id: string; jobId: string | null; proposal: import('@/domain/types').IdeaProposal; request: unknown }>(r)),
  health: () => fetch('/api/health', { cache: 'no-store' }).then((r) => r.json()),
};
