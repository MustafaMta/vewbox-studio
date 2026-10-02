import type { Job } from '@/domain/jobs';

/** The failure classes an unchanged retry may repeat safely (src/server/org/runs.ts RETRYABLE_CLASSES): a transient
 *  infrastructure, provider or resource failure. A cancelled job may also be restarted as it was. */
const TRANSIENT = new Set(['INFRASTRUCTURE', 'PROVIDER', 'RESOURCE_EXHAUSTION']);

/** The browser's copy of the server's `retryNeedsChange`: any other failure is refused by POST /api/jobs/{id}/retry
 *  unless the request says what was changed (`changeMade`), so the interface asks for it before sending. */
export function retryNeedsChange(job: Pick<Job, 'status' | 'error'>): boolean {
  if (job.status !== 'FAILED') return false;
  const fc = job.error?.details?.failureClass;
  return typeof fc === 'string' ? !TRANSIENT.has(fc) : job.error?.retryable !== true;
}
