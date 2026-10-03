'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStudio } from '@/studio/store';
import { T } from '@/lib/copy';
import { IconOffline } from '@/components/ui/icons';
import { fmtAgo } from '@/lib/format';
import { useShellMaybe } from './context';

/** THE SERVERBAR (docs/DESIGN-SYSTEM-V4.md §5.1) — a 40 px warn line at the top of the content, only when the studio's
 *  event stream has really dropped (the shell waits out a reconnect of a few seconds first): what happened, how old the
 *  data on screen is (from the store: the moment it was last known current), and Try now, which reopens the stream
 *  at once. While it shows, the page under it is dimmed to 0.7 (the data stays readable) and it adds its height to
 *  `--sticky-extra`. Live sections may say "Last known" with <LastKnown />. */
export function ServerBar({ onHeight }: { onHeight?: (px: number) => void }) {
  const { stream, reconnect } = useStudio();
  const [, tick] = useState(0);
  const [trying, setTrying] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // its height (40, or more where the sentence wraps on a phone) is what the sticky rows under it must clear
  useLayoutEffect(() => {
    const el = ref.current; if (!el || !onHeight) return;
    const report = () => onHeight(Math.ceil(el.getBoundingClientRect().height));
    report();
    const ro = new ResizeObserver(report); ro.observe(el);
    return () => { ro.disconnect(); onHeight(0); };
  }, [onHeight]);
  // the age reads "2 minutes ago", then "3 minutes ago": refresh it while the bar is up
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!trying) return; const t = setTimeout(() => setTrying(false), 1500); return () => clearTimeout(t); }, [trying]);
  const at = stream.lastDataAt;
  const since = at === null ? T('shell.server.nothing') : Date.now() - at < 60_000 ? T('shell.server.justNow') : T.f('shell.server.since', { ago: fmtAgo(new Date(at)) });
  return (
    <div ref={ref} className="server-bar" role="status">
      <IconOffline aria-hidden className="server-bar-icon" />
      <p className="server-bar-text"><span className="server-bar-what">{T('shell.server.down')}</span> <span>{since}</span></p>
      <button type="button" className="btn btn-secondary btn-xs server-bar-retry" aria-busy={trying || undefined} disabled={trying} onClick={() => { setTrying(true); reconnect(); }}>{T('shell.server.retry')}</button>
    </div>
  );
}

/** "Last known", for a live section while the studio server cannot be reached (nothing otherwise). */
export function LastKnown({ className = '' }: { className?: string }) {
  const shell = useShellMaybe();
  if (!shell?.serverDown) return null;
  return <span className={`last-known ${className}`}>{T('shell.lastKnown')}</span>;
}
