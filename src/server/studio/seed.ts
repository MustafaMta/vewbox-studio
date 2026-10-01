import { sql as dsql } from 'drizzle-orm';
import type { StudioState } from '@/domain/types';
import { DEFAULT_SETTINGS, seed as sampleState } from '@/domain/sample';
import { emptyStudio } from '@/domain/actions';
import { hashState } from '@/domain/hash';
import { db, schema } from '../db/client';
import { loadSnapshot } from './snapshot';
import { persistState } from './persist';
import { notifyChange } from './engine';
import { log } from '../log';

/** SEEDING — the first start fills an empty database with the sample studio (so every screen has something to show);
 *  Settings can return to it or empty the studio. Library files on disk belong to assets; when assets go, the
 *  caller removes the files (see media.ts). */

export type SeedKind = 'sample' | 'empty';

export async function replaceStudio(kind: SeedKind, keepSettings = true): Promise<{ version: number; hash: string }> {
  const out = await db().transaction(async (tx) => {
    await tx.execute(dsql`select pg_advisory_xact_lock(hashtext('vewbox-studio'))`);
    const snap = await loadSnapshot(tx);
    const settings = keepSettings ? snap.state.settings : DEFAULT_SETTINGS;
    const next: StudioState = kind === 'sample' ? { ...sampleState(), settings: keepSettings ? settings : sampleState().settings } : emptyStudio(settings);
    // usage rows are append-only in ordinary operation; a reset is the one place they are allowed to go
    await tx.delete(schema.characterUsage);
    const before = { ...snap.hashes, usage: new Map<string, string>() };
    const report = await persistState(tx, before, next);
    const now = new Date().toISOString();
    const rows = await tx.insert(schema.studioMeta).values({ id: 'studio', version: 1, seedVersion: 1, seededAt: now, seedKind: kind, updatedAt: now }).onConflictDoUpdate({ target: schema.studioMeta.id, set: { version: dsql`${schema.studioMeta.version} + 1`, seedVersion: dsql`${schema.studioMeta.version} + 1`, seededAt: now, seedKind: kind, updatedAt: now } }).returning({ version: schema.studioMeta.version });
    log.info({ kind, ...report }, 'studio replaced');
    return { version: rows[0].version, hash: hashState(next), removedAssets: snap.state.assets.filter((a) => !a.sample).map((a) => a.id) };
  });
  await notifyChange(out.version, 'seed');
  return out;
}

/** On boot: an untouched database gets the sample studio once. */
export async function seedIfEmpty(): Promise<boolean> {
  const meta = await db().select().from(schema.studioMeta);
  if (meta.length > 0) return false;
  await replaceStudio('sample', false);
  return true;
}
