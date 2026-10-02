'use client';

import { useState } from 'react';
import type { Job } from '@/domain/jobs';
import { useStudio } from '@/studio/store';
import { useT } from '@/components/ui/locale';
import { Button, Input } from '@/components/ui/kit';
import { IconRetry } from '@/components/ui/icons';
import { retryNeedsChange } from './contract';

/** RETRY, HONESTLY — a transient failure (the engine was unreachable, the provider hiccuped, the GPU was busy) is
 *  retried as it was. Any other failure would only repeat, so the retry first asks, inline, what changed; the answer
 *  travels with the retry and is recorded (the retry route refuses an unchanged retry of such a failure). */
export function RetryWithChange({ job, label, size = 'sm' }: { job: Job; label?: string; size?: 'sm' | 'xs' }) {
  const T = useT();
  const { retryJob } = useStudio();
  const needs = retryNeedsChange(job);
  const [asking, setAsking] = useState(false);
  const [change, setChange] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async (changeMade?: string) => { setBusy(true); try { await retryJob(job.id, changeMade); setAsking(false); setChange(''); } catch { /* the store says why */ } finally { setBusy(false); } };
  if (!needs) return <Button size={size} variant="secondary" icon={<IconRetry />} loading={busy} onClick={() => void go()}>{label ?? T('jobs.retry')}</Button>;
  if (!asking) return <Button size={size} variant="secondary" icon={<IconRetry />} aria-expanded={false} onClick={() => setAsking(true)}>{label ?? T('jobs.retry')}…</Button>;
  return (
    <form className="flex w-full flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (change.trim()) void go(change.trim()); }}>
      <label className="min-w-0 flex-1 basis-56">
        <span className="label">{T('cast.retry.whatChanged')}</span>
        <Input value={change} onChange={(e) => setChange(e.target.value)} maxLength={500} placeholder={T('cast.retry.whatChangedPh')} autoFocus />
      </label>
      <Button type="submit" size={size} variant="secondary" icon={<IconRetry />} loading={busy} disabled={!change.trim()}>{label ?? T('jobs.retry')}</Button>
      <Button size={size} variant="quiet" onClick={() => setAsking(false)}>{T('btn.cancel')}</Button>
    </form>
  );
}
