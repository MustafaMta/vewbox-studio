import { isStudioError } from '@/domain/errors';

/** WHAT A FAILED COMMAND SEND MEANS (src/studio/store.tsx). Only a send that may not have reached the server, or that
 *  the server could not handle right now, is sent again: a network failure (fetch threw, no answer), a 5xx, a 408
 *  timeout or a 429. Any other answer is the server REFUSING the batch — 403 FORBIDDEN (a system command), 400/422 (a
 *  malformed or invalid command), 404 — and sending it again would be refused again, forever: the batch is dropped, the
 *  optimistic changes are rolled back (the snapshot is read again) and the refusal is shown once. Pure. */
export type SendFailure = 'retry' | 'refused';

export function sendFailure(e: unknown): SendFailure {
  if (!isStudioError(e)) return 'retry';
  const status = e.details?.httpStatus;
  if (typeof status === 'number') return status >= 500 || status === 408 || status === 429 ? 'retry' : 'refused';
  return e.code === 'UNAVAILABLE' ? 'retry' : 'refused';
}
