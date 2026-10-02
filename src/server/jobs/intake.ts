import { eq } from 'drizzle-orm';
import { StudioError } from '@/domain/errors';
import { db, schema } from '@/server/db/client';
import { log } from '@/server/log';

/** JOB INTAKE — the maintenance switch. While paused, `enqueue` refuses every new job with the reason and workers
 *  claim nothing (queued jobs wait; running jobs finish or are cancelled by the operator). Stored on the studio row,
 *  so the web server, the worker and any container see the same state. Operated with `scripts/studio-intake.ts`. */

export interface IntakeState { paused: boolean; since?: string; reason?: string }

export async function intakeState(): Promise<IntakeState> {
  const [m] = await db().select({ at: schema.studioMeta.intakePausedAt, reason: schema.studioMeta.intakePausedReason }).from(schema.studioMeta).where(eq(schema.studioMeta.id, 'studio'));
  return m?.at ? { paused: true, since: m.at, reason: m.reason ?? undefined } : { paused: false };
}

export async function assertIntakeOpen(): Promise<void> {
  const s = await intakeState();
  if (s.paused) throw new StudioError('UNAVAILABLE', `The studio is not accepting new work right now${s.reason ? `: ${s.reason}` : ''}.`, { intakePaused: true, since: s.since });
}

export async function pauseIntake(reason: string): Promise<IntakeState> {
  const now = new Date().toISOString();
  await db().insert(schema.studioMeta).values({ id: 'studio', updatedAt: now, intakePausedAt: now, intakePausedReason: reason.slice(0, 300) })
    .onConflictDoUpdate({ target: schema.studioMeta.id, set: { intakePausedAt: now, intakePausedReason: reason.slice(0, 300) } });
  log.warn({ reason }, 'job intake paused');
  return intakeState();
}

export async function resumeIntake(): Promise<IntakeState> {
  await db().update(schema.studioMeta).set({ intakePausedAt: null, intakePausedReason: null }).where(eq(schema.studioMeta.id, 'studio'));
  log.info('job intake resumed');
  return intakeState();
}
