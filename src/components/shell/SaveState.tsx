'use client';

import Link from 'next/link';
import { useStudio } from '@/studio/store';
import { isActiveStatus } from '@/domain/jobs';
import { useT } from '@/components/ui/locale';

/** SAVESTATE (docs/DESIGN-SYSTEM-V4.md §5.1, §5.18 Autosave; fixes AUDIT D1 / V4-12) — what the store's command
 *  queue says, never assumed: "Saved" only when nothing is queued or in flight; "Saving…" while changes are on their
 *  way; "Not saved — retrying" once a send failed and the changes are held for the next attempt. A polite live
 *  region, so a screen reader hears the change. Pages may place it too (the cutting room's CompactHeader). */
export function SaveState({ className = '', focusable = false }: { className?: string; /** the rail: reachable by Tab so its tooltip shows on focus */ focusable?: boolean }) {
  const T = useT();
  const { ready, saving } = useStudio();
  const word = !ready ? T('shell.save.opening') : saving === 'saved' ? T('shell.save.saved') : saving === 'saving' ? T('shell.save.saving') : T('shell.save.unsaved');
  const tone = !ready ? 'idle' : saving === 'saved' ? 'ok' : saving === 'saving' ? 'live' : 'warn';
  return (
    <div className={`shell-item shell-status ${className}`} data-tone={tone} data-save={ready ? saving : 'opening'} role="status" tabIndex={focusable ? 0 : undefined} data-tip={word}>
      <span className="shell-icon" aria-hidden><span className="dot" /></span>
      <span className="shell-label">{word}</span>
    </div>
  );
}

/** The connection (the event stream) and what the studio is running right now, counted from the job list the browser
 *  already holds. It links to Production, where the engine room says more. */
export function ConnectionState({ className = '', onNavigate }: { className?: string; onNavigate?: () => void }) {
  const T = useT();
  const { stream, jobs } = useStudio();
  const running = jobs.filter((j) => isActiveStatus(j.status) && j.status !== 'QUEUED').length;
  const queued = jobs.filter((j) => j.status === 'QUEUED').length;
  const word = stream.state === 'open'
    ? (running ? T.f('shell.conn.running', { n: running }) : queued ? T.f('shell.conn.queued', { n: queued }) : T('shell.conn.connected'))
    : stream.state === 'connecting' ? T('shell.conn.connecting') : T('shell.conn.down');
  const tone = stream.state === 'open' ? (running ? 'live' : 'ok') : stream.state === 'connecting' ? 'idle' : 'warn';
  return (
    <Link href="/production#engine-room" className={`shell-item shell-status ${className}`} data-tone={tone} data-stream={stream.state} aria-label={T.f('shell.conn.link', { state: word })} onClick={onNavigate} data-tip={word}>
      <span className="shell-icon" aria-hidden><span className="dot" /></span>
      <span className="shell-label">{word}</span>
    </Link>
  );
}
