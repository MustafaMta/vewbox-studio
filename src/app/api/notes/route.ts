import { json, readJson, route } from '@/server/http';
import { bootstrap } from '@/server/bootstrap';
import { addNote, listNotes, type NewNoteInput } from '@/server/studio/notes';

export const dynamic = 'force-dynamic';

/** Screening Room notes (docs/CONTRACTS-REDESIGN-BACKEND.md B2). GET ?productionId=&cutAssetId=&status=open|resolved
 *  → { notes } in timecode order; POST a NewNote → 201 { note }. */
export const GET = route(async (req) => {
  await bootstrap();
  const u = new URL(req.url);
  const status = u.searchParams.get('status');
  const notes = await listNotes({ productionId: u.searchParams.get('productionId') ?? undefined, cutAssetId: u.searchParams.get('cutAssetId') ?? undefined, status: status === 'open' || status === 'resolved' ? status : undefined });
  return json({ notes }, { headers: { 'Cache-Control': 'no-store' } });
});

export const POST = route(async (req) => {
  await bootstrap();
  const note = await addNote(await readJson<NewNoteInput>(req));
  return json({ note }, { status: 201 });
});
