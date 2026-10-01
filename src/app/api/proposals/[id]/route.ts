import { eq } from 'drizzle-orm';
import { StudioError } from '@/domain/errors';
import { db, schema } from '@/server/db/client';
import { json, route } from '@/server/http';

export const dynamic = 'force-dynamic';

/** A proposal the story engine wrote (looked up by proposal id or by the job that produced it). */
export const GET = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  let rows = await db().select().from(schema.proposals).where(eq(schema.proposals.id, id));
  if (rows.length === 0) rows = await db().select().from(schema.proposals).where(eq(schema.proposals.jobId, id));
  if (rows.length === 0) throw new StudioError('NOT_FOUND', 'Proposal not found.');
  return json({ id: rows[0].id, jobId: rows[0].jobId, request: rows[0].request, proposal: rows[0].proposal, createdAt: rows[0].createdAt });
});
