import { isTerminalStatus, type Job } from '@/domain/jobs';

/** DEDUPE KEYS FOR CHARACTER JOBS (review findings 6, 19). A key stops a double submission (a double click, two tabs,
 *  a request retried after a timeout) from becoming two jobs. It must never turn a NEW request into a no-op: when
 *  the job a key points at has already ended — failed or cancelled, and for a voice build of that revision also
 *  completed — the request is queued again under a fresh key derived from the old one. Pure. */

/** The server's key for a voice build: one build per character and identity revision (contract §1.4). */
export const voiceBuildKey = (characterId: string, revision: number): string => `VOICE_BUILD:${characterId}:${revision}`;

/** The key to queue under instead, when the job found under `key` is finished and the request is a new one; null
 *  when the existing job is the answer (still active, or — for a creation — already made). Applies to every key of
 *  these kinds, whoever supplied it. */
export function requeueKeyFor(key: string | undefined, existing: Pick<Job, 'status'>, now: number = Date.now()): string | null {
  if (!key) return null;
  const fresh = `${key}:${now.toString(36)}`;
  if (key.startsWith('VOICE_BUILD:')) return isTerminalStatus(existing.status) ? fresh : null;
  // a creation that ended badly is retried by launching again; a finished or reviewing one is the answer
  if (key.startsWith('CREATE_CHARACTER:')) return existing.status === 'FAILED' || existing.status === 'CANCELLED' ? fresh : null;
  return null;
}
