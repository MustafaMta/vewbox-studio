import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/server/db/client';
import { nid } from '@/domain/ids';
import type { DevelopmentStage } from '@/domain/development';

/** THE DEVELOPMENT ARTIFACT STORE — every development agent writes its output here as a new version; nothing is
 *  overwritten (docs/CONTRACTS-AUTO-IDEA.md §2). Stages read earlier stages by artifact id, so a retried stage reads
 *  exactly what the stage before it produced. */

export interface DevelopmentArtifact<T = Record<string, unknown>> { id: string; ideaJobId: string; stage: DevelopmentStage; version: number; agentId: string; jobId?: string; content: T; createdAt: string }

type Row = typeof schema.developmentArtifacts.$inferSelect;
const toArtifact = <T>(r: Row): DevelopmentArtifact<T> => ({ id: r.id, ideaJobId: r.ideaJobId, stage: r.stage as DevelopmentStage, version: r.version, agentId: r.agentId, jobId: r.jobId ?? undefined, content: r.content as T, createdAt: r.createdAt });

/** Writes the next version of a stage's artifact. A retried job that already wrote its artifact gets that row back
 *  (same job id) instead of a duplicate version. */
export async function saveArtifact<T extends object>(a: { ideaJobId: string; stage: DevelopmentStage; agentId: string; jobId?: string; content: T }): Promise<DevelopmentArtifact<T>> {
  const existing = await db().select().from(schema.developmentArtifacts).where(and(eq(schema.developmentArtifacts.ideaJobId, a.ideaJobId), eq(schema.developmentArtifacts.stage, a.stage))).orderBy(desc(schema.developmentArtifacts.version));
  if (a.jobId) { const mine = existing.find((r) => r.jobId === a.jobId); if (mine) return toArtifact<T>(mine); }
  const version = (existing[0]?.version ?? 0) + 1;
  const row = { id: nid('dev'), ideaJobId: a.ideaJobId, stage: a.stage, version, agentId: a.agentId, jobId: a.jobId ?? null, content: a.content as unknown as Record<string, unknown>, createdAt: new Date().toISOString() };
  await db().insert(schema.developmentArtifacts).values(row);
  return toArtifact<T>(row as Row);
}

export async function loadArtifact<T = Record<string, unknown>>(id: string): Promise<DevelopmentArtifact<T> | undefined> {
  const [r] = await db().select().from(schema.developmentArtifacts).where(eq(schema.developmentArtifacts.id, id));
  return r ? toArtifact<T>(r) : undefined;
}

export async function loadArtifacts(ids: string[]): Promise<DevelopmentArtifact[]> {
  if (!ids.length) return [];
  return (await db().select().from(schema.developmentArtifacts).where(inArray(schema.developmentArtifacts.id, ids))).map((r) => toArtifact(r));
}

/** Every artifact of one Auto Idea, oldest first (the dossier and the review page read this). */
export async function artifactsOf(ideaJobId: string): Promise<DevelopmentArtifact[]> {
  return (await db().select().from(schema.developmentArtifacts).where(eq(schema.developmentArtifacts.ideaJobId, ideaJobId)).orderBy(schema.developmentArtifacts.createdAt)).map((r) => toArtifact(r));
}
