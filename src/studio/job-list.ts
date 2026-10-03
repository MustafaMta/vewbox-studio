import type { Job } from '@/domain/jobs';

/** THE BROWSER'S JOB LIST — the newest jobs, newest first, kept current by the rows the event stream carries (one
 *  `job` event per change, with the row), not by reloading the list on every event. */

/** How many jobs the browser holds (the first load asks for this many). */
export const JOB_LIST_LIMIT = 300;

/** Put one job row into the list: replace the copy it has (unless that copy is newer — events can overtake each
 *  other), or insert a job it has not seen at its place by creation time. The list stays at most `limit` long by
 *  dropping its oldest OTHER job: a job that just moved is kept even when it is older than the rest (a long creation
 *  a page is following must keep updating). */
export function mergeJob(jobs: Job[], job: Job, limit = JOB_LIST_LIMIT): Job[] {
  const at = jobs.findIndex((j) => j.id === job.id);
  if (at >= 0) {
    if (jobs[at].updatedAt > job.updatedAt) return jobs;
    const next = jobs.slice();
    next[at] = job;
    return next;
  }
  const next = jobs.slice();
  const before = next.findIndex((j) => j.createdAt < job.createdAt);
  next.splice(before < 0 ? next.length : before, 0, job);
  while (next.length > limit) {
    let drop = next.length - 1;
    if (next[drop].id === job.id) drop -= 1;
    next.splice(drop, 1);
  }
  return next;
}

export interface JobEvent { jobId?: string; job?: Job | null }

/** A `job` event the list cannot apply by itself — a reset (`jobId: '*'`), or one that came without the row — means
 *  the list is read again. */
export const jobEventNeedsReload = (e: JobEvent): boolean => !e.job && !(e.job === null && e.jobId && e.jobId !== '*');

/** What one `job` event does to the list: the row replaces or joins it; `job: null` (the row is gone) removes it. */
export function applyJobEvent(jobs: Job[], e: JobEvent): Job[] {
  if (e.job) return mergeJob(jobs, e.job);
  if (e.job === null && e.jobId && e.jobId !== '*') return jobs.filter((j) => j.id !== e.jobId);
  return jobs;
}
