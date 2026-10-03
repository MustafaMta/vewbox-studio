'use client';

import Link from 'next/link';
import { useStudio } from '@/studio/store';
import { isActiveStatus } from '@/domain/jobs';

/** SAVESTATE (docs/DESIGN-SYSTEM-V4.md §5.1, §5.18 Autosave; fixes AUDIT D1 / V4-12) — what the store's command
 *  queue says, never assumed: "Saved" only when nothing is queued or in flight; "Saving…" while changes are on their
 *  way; "Not saved — retrying" once a send failed and the changes are held for the next attempt. A polite live
 *  region, so a screen reader hears the change. The sidebar shows it only when it is abnormal (`onlyWhenAbnormal`:
 *  the failed state); pages may place it too (the cutting room's CompactHeader). */
export function SaveState({ className = '', focusable = false, onlyWhenAbnormal = false }: { className?: string; /** the rail: reachable by Tab so its tooltip shows on focus */ focusable?: boolean; onlyWhenAbnormal?: boolean }) {
  const { ready, saving } = useStudio();
  const word = !ready ? 'Opening the studio…' : saving === 'saved' ? 'Saved' : saving === 'saving' ? 'Saving…' : 'Not saved — retrying';
  const tone = !ready ? 'idle' : saving === 'saved' ? 'ok' : saving === 'saving' ? 'live' : 'warn';
  if (onlyWhenAbnormal && tone !== 'warn') return null;
  return (
    <div className={`nav-item nav-status ${className}`} data-tone={tone} data-save={ready ? saving : 'opening'} role="status" tabIndex={focusable ? 0 : undefined} data-tip={word}>
      <span className="nav-icon" aria-hidden><span className="dot" /></span>
      <span className="nav-label">{word}</span>
    </div>
  );
}

/** The connection (the event stream) and what the studio is running right now, counted from the job list the browser
 *  already holds. It links to Production, where the engine room says more. The sidebar shows it only while the
 *  stream is down (the ServerBar's condition). */
export function ConnectionState({ className = '', onNavigate }: { className?: string; onNavigate?: () => void }) {
  const { stream, jobs } = useStudio();
  const running = jobs.filter((j) => isActiveStatus(j.status) && j.status !== 'QUEUED').length;
  const queued = jobs.filter((j) => j.status === 'QUEUED').length;
  const word = stream.state === 'open'
    ? (running ? `Connected · ${running} running` : queued ? `Connected · ${queued} queued` : 'Connected')
    : stream.state === 'connecting' ? 'Connecting…' : 'Not connected';
  const tone = stream.state === 'open' ? (running ? 'live' : 'ok') : stream.state === 'connecting' ? 'idle' : 'warn';
  return (
    <Link href="/production#engine-room" className={`nav-item nav-status ${className}`} data-tone={tone} data-stream={stream.state} aria-label={`${word}. Open the engine room in Production`} onClick={onNavigate} data-tip={word}>
      <span className="nav-icon" aria-hidden><span className="dot" /></span>
      <span className="nav-label">{word}</span>
    </Link>
  );
}
