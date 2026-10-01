import { sql as dsql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { queueStats } from '@/server/jobs/queue';
import { currentVersion } from '@/server/studio/engine';
import { capabilities } from '@/server/env';
import { json, route } from '@/server/http';
import { bootstrap } from '@/server/bootstrap';

export const dynamic = 'force-dynamic';

/** Liveness and readiness in one: the database answers, migrations ran, and how the queue looks. */
export const GET = route(async () => {
  const t0 = Date.now();
  let dbOk = false; let error: string | undefined;
  try { await bootstrap(); await db().execute(dsql`select 1`); dbOk = true; } catch (e) { error = (e as Error).message; }
  const body = { ok: dbOk, service: 'web', dbMs: Date.now() - t0, version: dbOk ? await currentVersion() : null, queue: dbOk ? await queueStats() : null, capabilities: capabilities(), codeVersion: process.env.CODE_VERSION ?? 'dev', error };
  return json(body, { status: dbOk ? 200 : 503 });
});
