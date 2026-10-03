import { isStudioError } from '@/domain/errors';

/** THE LEASE HEARTBEAT of one running job (audit H6). Every `intervalMs` the worker renews its lease:
 *  - the answer says whether a cancel was requested → `onCancel()`;
 *  - a CONFLICT means another worker owns the job now (the lease was reclaimed) → `onLost()`, the attempt stops;
 *  - ANY OTHER error (the database restarting, a dropped connection, a pool timeout) is transient: it is logged and
 *    the beat is retried after a short backoff (`retryMs`), then on the normal interval — it never cancels the job.
 *    If the outage outlasts the lease, the job is reclaimed elsewhere and the next successful beat reports CONFLICT;
 *    until then the attempt's result writes are fenced on the lease anyway (step 5).
 *  Returns `stop()`. Pure scheduling, so tests drive it with fake timers. */
export interface HeartbeatOptions {
  beat: () => Promise<{ cancelRequested: boolean }>;
  intervalMs: number;
  retryMs?: number[];
  onCancel: () => void;
  onLost: () => void;
  onError?: (e: unknown, failures: number) => void;
}

export function startHeartbeat(o: HeartbeatOptions): () => void {
  const retry = o.retryMs ?? [2_000, 5_000, 10_000];
  let stopped = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (ms: number) => { if (!stopped) timer = setTimeout(tick, ms); };
  const tick = async () => {
    if (stopped) return;
    try {
      const r = await o.beat();
      failures = 0;
      if (r.cancelRequested) o.onCancel();
      schedule(o.intervalMs);
    } catch (e) {
      if (isStudioError(e) && e.code === 'CONFLICT') { stopped = true; o.onLost(); return; }
      failures++;
      o.onError?.(e, failures);
      schedule(retry[Math.min(failures - 1, retry.length - 1)] ?? o.intervalMs);
    }
  };
  schedule(o.intervalMs);
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
