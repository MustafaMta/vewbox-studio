'use client';

import { useCallback, useMemo, useState } from 'react';
import type { CutNote, Shot } from '@/domain/types';
import { useLive } from '@/studio/org';

/** THE NOTES OF ONE PRODUCTION (docs/CONTRACTS-REDESIGN-BACKEND.md B2) through the real routes: read with
 *  `GET /api/notes?productionId=` (again on every studio activity event, which every note change writes), written with
 *  `POST /api/notes`, `POST /api/notes/{id}/resolve` and `POST /api/notes/{id}/send-to-shot`. A write's answer is
 *  merged at once, so the page never waits for the next read; a refusal comes back as the server's own sentence. */

export interface NewNote { productionId: string; cutAssetId: string; timecode: number; pin?: { x: number; y: number }; text: string }

async function call<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await r.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!r.ok) throw new Error((json as { error?: { message?: string } } | null)?.error?.message ?? `The studio answered ${r.status}.`);
  return json as T;
}

export const notesApi = {
  add: (n: NewNote) => call<{ note: CutNote }>('/api/notes', { ...n, author: 'producer' }).then((x) => x.note),
  resolve: (id: string, resolved: boolean) => call<{ note: CutNote }>(`/api/notes/${encodeURIComponent(id)}/resolve`, { resolved }).then((x) => x.note),
  send: (id: string, shotId: string) => call<{ note: CutNote; shot: Shot }>(`/api/notes/${encodeURIComponent(id)}/send-to-shot`, { shotId, by: 'producer' }),
};

const newer = (a: CutNote, b: CutNote) => (a.updatedAt >= b.updatedAt ? a : b);

export function useNotes(productionId: string | null) {
  const live = useLive<{ notes: CutNote[] }>(productionId ? `/api/notes?productionId=${encodeURIComponent(productionId)}` : null);
  const [mine, setMine] = useState<Record<string, CutNote>>({});
  const notes = useMemo(() => {
    const out = new Map<string, CutNote>();
    for (const n of live.data?.notes ?? []) if (n.productionId === productionId) out.set(n.id, n);
    for (const n of Object.values(mine)) if (n.productionId === productionId) out.set(n.id, out.has(n.id) ? newer(out.get(n.id)!, n) : n);
    return [...out.values()].sort((a, b) => a.timecode - b.timecode || a.createdAt.localeCompare(b.createdAt));
  }, [live.data, mine, productionId]);
  const keep = useCallback((n: CutNote) => { setMine((m) => ({ ...m, [n.id]: n })); return n; }, []);
  const add = useCallback(async (n: NewNote) => keep(await notesApi.add(n)), [keep]);
  const resolve = useCallback(async (id: string, resolved: boolean) => keep(await notesApi.resolve(id, resolved)), [keep]);
  const send = useCallback(async (id: string, shotId: string) => { const r = await notesApi.send(id, shotId); keep(r.note); return r; }, [keep]);
  return { notes, loaded: live.data !== null, error: live.data === null ? live.error : null, add, resolve, send };
}
