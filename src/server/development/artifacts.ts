import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/server/db/client';
import { nid } from '@/domain/ids';
import type { DevelopmentStage } from '@/domain/development';

/** THE DEVELOPMENT ARTIFACT STORE — every development agent writes its output here as a new version; nothing is
 *  overwritten (docs/CONTRACTS-AUTO-IDEA.md §1). Stages read earlier stages by artifact id, so a retried stage reads
 *  exactly what the stage before it produced. */

export interface DevelopmentArtifact<T = Record<string, unknown>> { id: string; ideaJobId: string; stage: DevelopmentStage; version: number; agentId: string; jobId?: string; content: T; createdAt: string }

type Row = typeof schema.developmentArtifacts.$inferSelect;
const toArtifact = <T>(r: Row): DevelopmentArtifact<T> => ({ id: r.id, ideaJobId: r.ideaJobId, stage: r.stage as DevelopmentStage, version: r.version, agentId: r.agentId, jobId: r.jobId ?? undefined, content: r.content as T, createdAt: r.createdAt });

/** Writes the next version of a stage's artifact. A retried job that already wrote its artifact gets that row back
 *  (same job id) instead of a duplicate version; two writers racing for one version number retry once with the next. */
export async function saveArtifact<T extends object>(a: { ideaJobId: string; stage: DevelopmentStage; agentId: string; jobId?: string; content: T }): Promise<DevelopmentArtifact<T>> {
  for (let attempt = 0; ; attempt++) {
    const existing = await db().select().from(schema.developmentArtifacts).where(and(eq(schema.developmentArtifacts.ideaJobId, a.ideaJobId), eq(schema.developmentArtifacts.stage, a.stage))).orderBy(desc(schema.developmentArtifacts.version));
    if (a.jobId) { const mine = existing.find((r) => r.jobId === a.jobId); if (mine) return toArtifact<T>(mine); }
    const version = (existing[0]?.version ?? 0) + 1;
    const row = { id: nid('dev'), ideaJobId: a.ideaJobId, stage: a.stage, version, agentId: a.agentId, jobId: a.jobId ?? null, content: a.content as unknown as Record<string, unknown>, createdAt: new Date().toISOString() };
    const inserted = await db().insert(schema.developmentArtifacts).values(row).onConflictDoNothing({ target: [schema.developmentArtifacts.ideaJobId, schema.developmentArtifacts.stage, schema.developmentArtifacts.version] }).returning();
    if (inserted.length) return toArtifact<T>(inserted[0]);
    if (attempt >= 2) throw new Error(`could not write the ${a.stage} artifact of ${a.ideaJobId}: version ${version} was taken twice`);
  }
}

/** The artifact a job already wrote for its stage (a retried job returns it instead of calling the model again). */
export async function artifactOfJob<T = Record<string, unknown>>(ideaJobId: string, stage: DevelopmentStage, jobId: string): Promise<DevelopmentArtifact<T> | undefined> {
  const [r] = await db().select().from(schema.developmentArtifacts).where(and(eq(schema.developmentArtifacts.ideaJobId, ideaJobId), eq(schema.developmentArtifacts.stage, stage), eq(schema.developmentArtifacts.jobId, jobId)));
  return r ? toArtifact<T>(r) : undefined;
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
  return (await db().select().from(schema.developmentArtifacts).where(eq(schema.developmentArtifacts.ideaJobId, ideaJobId)).orderBy(asc(schema.developmentArtifacts.createdAt), asc(schema.developmentArtifacts.version))).map((r) => toArtifact(r));
}
