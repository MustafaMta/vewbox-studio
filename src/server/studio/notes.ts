import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { CutNote, Production, Shot } from '@/domain/types';
import { StudioError } from '@/domain/errors';
import { nid } from '@/domain/ids';
import { cutVersionsOf } from '@/studio/selectors/cuts';
import { db, schema } from '../db/client';
import { command, currentVersion, notifyChange, readState } from './engine';
import { studioEvent } from '../org/runs';

/** SCREENING ROOM NOTES (docs/CONTRACTS-REDESIGN-BACKEND.md B2; docs/DESIGN-SYSTEM-V5.md §8.12). A note is a record
 *  of its own (table `cut_notes`), not part of the studio state: it is read beside the snapshot (`GET /api/studio`
 *  → `notes`) and through /api/notes, and every change tells the open pages (the studio change feed and an activity
 *  event). *Send to shot* is the one bridge into the state: it copies the note's text into the shot's `notes`
 *  through the ordinary `updateShot` command and records the shot on the note — it never generates anything; the
 *  take a later generation makes for that shot is recorded on the note by the take handler. */

const id = z.string().min(1).max(80);
const unit = z.number().min(0).max(1);
export const PinSchema = z.object({ x: unit, y: unit });
export const NewNoteSchema = z.object({
  productionId: id,
  cutAssetId: id.optional(),
  cutVersion: z.number().int().min(1).optional(),
  timecode: z.number().min(0).max(24 * 3600),
  rangeEnd: z.number().min(0).max(24 * 3600).optional(),
  pin: PinSchema.optional(),
  drawingAssetId: id.optional(),
  text: z.string().trim().min(1).max(4000),
  author: z.string().trim().min(1).max(80).optional(),
}).refine((n) => n.rangeEnd === undefined || n.rangeEnd >= n.timecode, { message: 'the range ends at or after its start', path: ['rangeEnd'] });
export const NotePatchSchema = z.object({
  timecode: z.number().min(0).max(24 * 3600).optional(),
  rangeEnd: z.number().min(0).max(24 * 3600).nullable().optional(),
  pin: PinSchema.nullable().optional(),
  drawingAssetId: id.nullable().optional(),
  text: z.string().trim().min(1).max(4000).optional(),
}).strict();
export type NewNoteInput = z.input<typeof NewNoteSchema>;
export type NotePatchInput = z.input<typeof NotePatchSchema>;

type Row = typeof schema.cutNotes.$inferSelect;
const undef = <T>(v: T | null): T | undefined => (v === null ? undefined : v);

export function noteFromRow(r: Row): CutNote {
  return { id: r.id, productionId: r.productionId, cutAssetId: undef(r.cutAssetId), cutVersion: undef(r.cutVersion), timecode: r.timecode, rangeEnd: undef(r.rangeEnd), pin: r.pinX !== null && r.pinY !== null ? { x: r.pinX, y: r.pinY } : undefined, drawingAssetId: undef(r.drawingAssetId), text: r.text, author: r.author, status: r.status === 'resolved' ? 'resolved' : 'open', sentToShotId: undef(r.sentToShotId), producedTakeId: undef(r.producedTakeId), createdAt: r.createdAt, updatedAt: r.updatedAt };
}

const parse = <T>(s: z.ZodType<T>, v: unknown, what: string): T => { const r = s.safeParse(v); if (!r.success) throw new StudioError('INVALID', `${what}: ${r.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'body'} ${i.message}`).join('; ')}`, { issues: r.error.issues.slice(0, 10).map((i) => ({ path: i.path.map(String), message: i.message })) }); return r.data; };

/** `00:51` / `01:02:03` for a note's timecode (seconds), as the shot's notes quote it. */
export const timecodeText = (seconds: number): string => { const s = Math.max(0, Math.floor(seconds)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60; return `${h ? `${String(h).padStart(2, '0')}:` : ''}${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`; };

/** The line a sent note adds to a shot's notes (docs/DESIGN-SYSTEM-V5.md §8.12: the note becomes the regeneration
 *  brief that pre-fills *What happens*). Pure. */
export function noteLine(n: Pick<CutNote, 'timecode' | 'rangeEnd' | 'cutVersion' | 'text' | 'author'>): string {
  const when = n.rangeEnd !== undefined && n.rangeEnd > n.timecode ? `${timecodeText(n.timecode)}–${timecodeText(n.rangeEnd)}` : timecodeText(n.timecode);
  return `Screening note at ${when}${n.cutVersion ? ` (cut ${n.cutVersion})` : ''}, ${n.author}: ${n.text.trim()}`;
}

/** The shot's notes with the sent note appended once (sending the same note twice adds nothing). Pure. */
export function appendNoteToShotNotes(existing: string | undefined, line: string): string {
  const cur = existing?.trim() ?? '';
  if (cur.split('\n').some((l) => l.trim() === line)) return cur;
  return cur ? `${cur}\n\n${line}` : line;
}

async function announce(kind: string, note: CutNote, message: string, data: Record<string, unknown> = {}) {
  await studioEvent({ departmentId: 'POST', productionId: note.productionId, kind, message, data: { noteId: note.id, cutAssetId: note.cutAssetId, timecode: note.timecode, ...data } });
  // the open pages re-read the snapshot (notes travel beside it); the version is the studio's own, unchanged
  await notifyChange(await currentVersion(), 'notes').catch(() => undefined);
}

export async function listNotes(opts: { productionId?: string; cutAssetId?: string; status?: 'open' | 'resolved' } = {}): Promise<CutNote[]> {
  const conds = [];
  if (opts.productionId) conds.push(eq(schema.cutNotes.productionId, opts.productionId));
  if (opts.cutAssetId) conds.push(eq(schema.cutNotes.cutAssetId, opts.cutAssetId));
  if (opts.status) conds.push(eq(schema.cutNotes.status, opts.status));
  const rows = await db().select().from(schema.cutNotes).where(conds.length ? and(...conds) : undefined).orderBy(asc(schema.cutNotes.timecode), asc(schema.cutNotes.createdAt));
  return rows.map(noteFromRow);
}

export async function getNote(noteId: string): Promise<CutNote> {
  const rows = await db().select().from(schema.cutNotes).where(eq(schema.cutNotes.id, noteId));
  if (!rows[0]) throw new StudioError('NOT_FOUND', `Note ${noteId} was not found.`, { noteId });
  return noteFromRow(rows[0]);
}

/** A new note on a production's cut. The production must exist; a cut asset named must be one of its cuts (its
 *  version number is derived from the cut history when not given); a drawing must be a stored picture. */
export async function addNote(input: NewNoteInput): Promise<CutNote> {
  const n = parse(NewNoteSchema, input, 'addNote');
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === n.productionId);
  if (!p) throw new StudioError('NOT_FOUND', `Production ${n.productionId} was not found.`, { productionId: n.productionId });
  let cutVersion = n.cutVersion;
  const cutAssetId = n.cutAssetId ?? p.cutAssetId;
  if (cutAssetId) {
    const versions = cutVersionsOf(p, state.assets);
    const v = versions.find((c) => c.assetId === cutAssetId);
    if (!v) throw new StudioError('INVALID', 'The cut named is not a cut of this production.', { productionId: p.id, cutAssetId });
    cutVersion ??= v.version;
  }
  if (n.drawingAssetId) { const a = state.assets.find((x) => x.id === n.drawingAssetId); if (!a || a.kind !== 'IMAGE') throw new StudioError('INVALID', 'A drawing is a stored picture.', { drawingAssetId: n.drawingAssetId }); }
  const now = new Date().toISOString();
  const row: typeof schema.cutNotes.$inferInsert = { id: nid('note'), productionId: p.id, cutAssetId: cutAssetId ?? null, cutVersion: cutVersion ?? null, timecode: n.timecode, rangeEnd: n.rangeEnd ?? null, pinX: n.pin?.x ?? null, pinY: n.pin?.y ?? null, drawingAssetId: n.drawingAssetId ?? null, text: n.text, author: n.author ?? 'producer', status: 'open', createdAt: now, updatedAt: now };
  const [inserted] = await db().insert(schema.cutNotes).values(row).returning();
  const note = noteFromRow(inserted);
  await announce('NOTE_ADDED', note, `${note.author} noted “${p.title}” at ${timecodeText(note.timecode)}${note.cutVersion ? ` (cut ${note.cutVersion})` : ''}: ${note.text.slice(0, 120)}`);
  return note;
}

/** Change what a note says or where it points. A resolved note is edited like an open one; what it was sent to is
 *  never changed here. */
export async function updateNote(noteId: string, patch: NotePatchInput): Promise<CutNote> {
  const pt = parse(NotePatchSchema, patch, 'updateNote');
  const cur = await getNote(noteId);
  const timecode = pt.timecode ?? cur.timecode;
  const rangeEnd = pt.rangeEnd === null ? undefined : pt.rangeEnd ?? cur.rangeEnd;
  if (rangeEnd !== undefined && rangeEnd < timecode) throw new StudioError('INVALID', 'The range ends at or after its start.', { noteId, timecode, rangeEnd });
  if (pt.drawingAssetId) { const a = (await readState()).state.assets.find((x) => x.id === pt.drawingAssetId); if (!a || a.kind !== 'IMAGE') throw new StudioError('INVALID', 'A drawing is a stored picture.', { drawingAssetId: pt.drawingAssetId }); }
  const set: Partial<typeof schema.cutNotes.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (pt.timecode !== undefined) set.timecode = pt.timecode;
  if (pt.rangeEnd !== undefined) set.rangeEnd = pt.rangeEnd;
  if (pt.pin !== undefined) { set.pinX = pt.pin?.x ?? null; set.pinY = pt.pin?.y ?? null; }
  if (pt.drawingAssetId !== undefined) set.drawingAssetId = pt.drawingAssetId;
  if (pt.text !== undefined) set.text = pt.text;
  const [row] = await db().update(schema.cutNotes).set(set).where(eq(schema.cutNotes.id, noteId)).returning();
  const note = noteFromRow(row);
  await announce('NOTE_UPDATED', note, `note at ${timecodeText(note.timecode)} changed: ${note.text.slice(0, 120)}`);
  return note;
}

/** Resolve a note (or open it again with `resolved: false`). The same state again changes nothing. */
export async function resolveNote(noteId: string, resolved = true): Promise<CutNote> {
  const cur = await getNote(noteId);
  const status = resolved ? 'resolved' : 'open';
  if (cur.status === status) return cur;
  const [row] = await db().update(schema.cutNotes).set({ status, updatedAt: new Date().toISOString() }).where(eq(schema.cutNotes.id, noteId)).returning();
  const note = noteFromRow(row);
  await announce(resolved ? 'NOTE_RESOLVED' : 'NOTE_REOPENED', note, `note at ${timecodeText(note.timecode)} ${resolved ? 'resolved' : 'reopened'}: ${note.text.slice(0, 120)}`);
  return note;
}

/** Remove a note that was never acted on (open, not sent). A sent or resolved note is a record and stays. */
export async function deleteNote(noteId: string): Promise<void> {
  const cur = await getNote(noteId);
  if (cur.status !== 'open' || cur.sentToShotId) throw new StudioError('CONFLICT', 'A note that was sent to a shot or resolved is kept; resolve it instead.', { noteId });
  await db().delete(schema.cutNotes).where(eq(schema.cutNotes.id, noteId));
  await announce('NOTE_REMOVED', cur, `note at ${timecodeText(cur.timecode)} removed`);
}

/** *Send to shot*: the note's text joins the shot's notes (through `updateShot`, so the browser's copy and the
 *  history agree) and the shot is recorded on the note. Nothing is generated: the producer starts the new take from
 *  the shot workspace, and that take is recorded here when it arrives (`recordProducedTake`). Sending the same note to
 *  the same shot again changes nothing; sending it to another shot moves the record (the first shot keeps the text). */
export async function sendNoteToShot(noteId: string, shotId: string, opts: { by?: string } = {}): Promise<{ note: CutNote; shot: Shot; production: Production }> {
  const cur = await getNote(noteId);
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === cur.productionId);
  if (!p) throw new StudioError('NOT_FOUND', `Production ${cur.productionId} was not found.`, { productionId: cur.productionId });
  const sh = p.shots.find((x) => x.id === shotId);
  if (!sh) throw new StudioError('NOT_FOUND', `Shot ${shotId} is not a shot of “${p.title}”.`, { productionId: p.id, shotId });
  const line = noteLine(cur);
  const notes = appendNoteToShotNotes(sh.notes, line);
  if (notes !== (sh.notes?.trim() ?? '')) await command('updateShot', [p.id, sh.id, { notes }], opts.by ?? 'screening');
  let note = cur;
  if (cur.sentToShotId !== shotId) {
    const [row] = await db().update(schema.cutNotes).set({ sentToShotId: shotId, producedTakeId: null, updatedAt: new Date().toISOString() }).where(eq(schema.cutNotes.id, noteId)).returning();
    note = noteFromRow(row);
    await announce('NOTE_SENT_TO_SHOT', note, `note at ${timecodeText(note.timecode)} sent to shot ${p.scenes.find((sc) => sc.id === sh.sceneId)?.number ?? '?'}.${sh.number} of “${p.title}”`, { shotId });
  }
  const after = (await readState()).state.productions.find((x) => x.id === p.id)!;
  return { note, shot: after.shots.find((x) => x.id === shotId)!, production: after };
}

/** A take arrived for a shot: every note sent to that shot and still waiting for its take records it. Called by the
 *  take handler after `addTake`; never throws into it. */
export async function recordProducedTake(shotId: string, takeId: string): Promise<number> {
  const rows = await db().update(schema.cutNotes).set({ producedTakeId: takeId, updatedAt: new Date().toISOString() }).where(and(eq(schema.cutNotes.sentToShotId, shotId), eq(schema.cutNotes.status, 'open'))).returning({ id: schema.cutNotes.id });
  return rows.length;
}
