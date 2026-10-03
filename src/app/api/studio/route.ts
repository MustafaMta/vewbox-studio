import { eq } from 'drizzle-orm';
import { db, schema } from '@/server/db/client';
import { readState } from '@/server/studio/engine';
import { capabilities } from '@/server/env';
import { json, route } from '@/server/http';
import { bootstrap } from '@/server/bootstrap';
import { listNotes } from '@/server/studio/notes';

export const dynamic = 'force-dynamic';

/** The whole studio, as the browser holds it. Small enough to send whole: the authoritative copy of every record.
 *  Beside the state (not inside it, so the hash stays the state's): the Screening Room notes (B2). */
export const GET = route(async () => {
  await bootstrap();
  const { state, version, hash } = await readState();
  const [meta, notes] = await Promise.all([db().select().from(schema.studioMeta).where(eq(schema.studioMeta.id, 'studio')), listNotes()]);
  return json({ state, version, hash, seeded: meta[0] ? { kind: meta[0].seedKind, at: meta[0].seededAt, version: meta[0].seedVersion } : null, capabilities: capabilities(), notes }, { headers: { 'Cache-Control': 'no-store' } });
});
