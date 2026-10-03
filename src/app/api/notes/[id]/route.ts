import { json, params, readJson, route } from '@/server/http';
import { bootstrap } from '@/server/bootstrap';
import { deleteNote, getNote, updateNote, type NotePatchInput } from '@/server/studio/notes';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** One note: GET → { note }; PATCH a NotePatch → { note }; DELETE (open and never sent only) → { ok: true }. */
export const GET = route(async (_req, ctx: Ctx) => { await bootstrap(); const { id } = await params(ctx); return json({ note: await getNote(id) }, { headers: { 'Cache-Control': 'no-store' } }); });
export const PATCH = route(async (req, ctx: Ctx) => { await bootstrap(); const { id } = await params(ctx); return json({ note: await updateNote(id, await readJson<NotePatchInput>(req)) }); });
export const DELETE = route(async (_req, ctx: Ctx) => { await bootstrap(); const { id } = await params(ctx); await deleteNote(id); return json({ ok: true }); });
