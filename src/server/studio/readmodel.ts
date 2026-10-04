import type { StudioState } from '@/domain/types';
import { canonical, hashString } from '@/domain/hash';
import type { AggregateVersions } from './snapshot';

/** THE READ MODEL (docs/BACKEND-AUDIT-2026-10.md H2, step 13) — the last whole studio this process knows, with the
 *  studio version it belongs to and its hash. A scoped write that commits version N while this holds N-1 puts its
 *  changed aggregates into it (src/server/studio/scope.ts mergeScoped) instead of reading the whole studio again; any
 *  other version is read again, whole and consistently, by the caller. Shared between the command engine (the hash a
 *  batch's answer carries, which the browser compares with its own copy) and readState(). Never mutated in place: a
 *  new version replaces it. */

export interface ReadModel {
  version: number; state: StudioState; hash: string;
  /** read whole from the database at that version (readState serves only these); otherwise assembled from a batch's result */
  fromDatabase?: boolean;
  /** the aggregates' versions, when read from the database */
  versions?: AggregateVersions;
}

const g = globalThis as unknown as { __vewboxReadModel?: ReadModel };

export const readModel = (): ReadModel | undefined => g.__vewboxReadModel;
export const readModelAt = (version: number): ReadModel | undefined => (g.__vewboxReadModel?.version === version ? g.__vewboxReadModel : undefined);
/** Keep `state` as the studio at `version` (an older version never replaces a newer one). */
export function remember(version: number, state: StudioState, hash = hashStateCached(state), from: { fromDatabase?: boolean; versions?: AggregateVersions } = {}): ReadModel {
  const cur = g.__vewboxReadModel;
  const next: ReadModel = { version, state, hash, ...from };
  if (!cur || cur.version <= version) g.__vewboxReadModel = next;
  return next;
}
export const forgetReadModel = () => { g.__vewboxReadModel = undefined; };

/** canonical() of each record, kept per object: a studio that shares most of its records with the previous one (a
 *  merged scoped write) hashes in the time of the records that changed plus one pass over the string. */
const canon = new WeakMap<object, string>();
const canonOf = (x: unknown): string => {
  if (!x || typeof x !== 'object') return canonical(x);
  let c = canon.get(x as object);
  if (c === undefined) { c = canonical(x); canon.set(x as object, c); }
  return c;
};

/** Exactly hashState(state) (src/domain/hash.ts) — the same string is hashed — with each record's canonical form
 *  memoised. */
export function hashStateCached(state: StudioState): string {
  const o = state as unknown as Record<string, unknown>;
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
  const parts = keys.map((k) => {
    const v = o[k];
    const body = Array.isArray(v) ? `[${v.map(canonOf).join(',')}]` : canonOf(v);
    return `${JSON.stringify(k)}:${body}`;
  });
  return hashString(`{${parts.join(',')}}`);
}
