'use client';

import { Children, Fragment, type ReactNode } from 'react';
import { useT } from '../locale';
import { IconBad, IconInfo, IconOk, IconWarn } from '../icons';
import { Spinner } from './Button';
import { cls } from './cls';
import { Badge } from './Status';

/** EMPTY, LOADING, ERROR AND PARTIAL STATES (docs/DESIGN-SYSTEM-V4.md §5.16). An empty page is a title card in the
 *  page's own shape, one sentence and one primary — never the lead again (V4-01; tests/unit/empty-hint.test.ts). An
 *  empty section is one sentence and one action, with no dashed box and no icon tile. Loading is ratio-true frames
 *  and text bars, never a spinner without a sentence. An error says what happened, why, what is kept, the one
 *  recovery — and the raw words only inside Details. */

/** The empty page: `art` is the page's TitleCard (F3, in the page's shape), then one sentence, one primary and at
 *  most two alternatives (any more are not shown). */
export function PageEmpty({ art, children, primary, alternatives, className = '' }: { art?: ReactNode; children: ReactNode; primary?: ReactNode; alternatives?: ReactNode; className?: string }) {
  const alts = Children.toArray(alternatives).slice(0, 2);
  return (
    <div className={cls('empty-page', className)}>
      {art && <div className="empty-page-art">{art}</div>}
      <p className="empty-page-sentence">{children}</p>
      {(primary || alts.length > 0) && <div className="empty-page-actions">{primary}{alts}</div>}
    </div>
  );
}

/** The empty section: one sentence in --fg-muted at the section's start, then one (secondary) action. */
export function SectionEmpty({ children, action, className = '' }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cls('empty-section', className)}>
      <p>{children}</p>
      {action}
    </div>
  );
}

/** Text bars that hold a title and a slate's place while they load. */
export function TextBars({ lines = 2, className = '' }: { lines?: 1 | 2 | 3; className?: string }) {
  return <span aria-hidden className={cls('text-bars', className)}>{Array.from({ length: lines }, (_, i) => <span key={i} className="text-bar" />)}</span>;
}

/** A picture's place while it loads: the frame at its true ratio on --art-ph, then text bars. The pulse runs once,
 *  for at most a second; with a `phase` (the job's real words) there is no pulse at all — the words carry it. */
export function LoadingFrame({ ratio = '16/9', lines = 2, phase, label, className = '' }: { ratio?: string; lines?: 0 | 1 | 2 | 3; phase?: ReactNode; /** what is loading, for assistive tech */ label?: string; className?: string }) {
  return (
    <div className={cls('loading-frame', className)} role={label ? 'status' : undefined} aria-label={label}>
      <div className="loading-frame-art" data-phase={phase ? 'true' : undefined} style={{ aspectRatio: ratio.replace('/', ' / ') }}>
        {phase && <span className="frame-phase"><span aria-hidden className="state-dot" data-tone="running" />{phase}</span>}
      </div>
      {lines > 0 && <TextBars lines={lines as 1 | 2 | 3} />}
    </div>
  );
}

/** A spinner always comes with its sentence: "Loading the studio…". */
export function LoadingLine({ children, className = '' }: { children?: ReactNode; className?: string }) {
  const T = useT();
  return <p role="status" className={cls('loading-line', className)}><Spinner />{children ?? T('kit.loading')}</p>;
}

/** The error notice (v3 anatomy): 1 what happened, 2 why in plain words, 3 what is kept, 4 one recovery then
 *  alternatives, 5 Details. The raw exception (an engine's own message, a stack) goes only into `details`, set in
 *  `.tc` and broken anywhere, behind a disclosure (fixes V4-06). */
export function ErrorNotice({ title, why, kept, action, alternatives, details, live = true, className = '' }: {
  title: ReactNode; why?: ReactNode; kept?: ReactNode; action?: ReactNode; alternatives?: ReactNode; details?: string | null; live?: boolean; className?: string;
}) {
  const T = useT();
  return (
    <div role={live ? 'alert' : undefined} className={cls('notice notice-bad error-notice', className)}>
      <IconBad aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        {why && <p className="mt-0.5 text-body">{why}</p>}
        {kept && <p className="mt-0.5 text-muted">{kept}</p>}
        {(action || alternatives) && <div className="mt-2 flex flex-wrap items-center gap-2">{action}{alternatives}</div>}
        {details && (
          <details className="details mt-2">
            <summary>{T('misc.details')}</summary>
            <p className="tc break-all mt-2 text-muted" dir="ltr">{details}</p>
          </details>
        )}
      </div>
    </div>
  );
}

/** A partial state said honestly, in one line of facts: "Episode 4 · cut missing · 18 of 20 shots chosen". */
export function PartialLine({ items, className = '' }: { items: ReadonlyArray<ReactNode>; className?: string }) {
  const shown = items.filter((x) => x !== null && x !== undefined && x !== false && x !== '');
  return <p className={cls('slate', className)}>{shown.map((x, i) => <Fragment key={i}>{i > 0 && <span aria-hidden className="slate-sep"> · </span>}<span>{x}</span></Fragment>)}</p>;
}

/** The neutral SAMPLE badge on bundled media (§5.16). */
export function SampleBadge({ className = '' }: { className?: string }) {
  const T = useT();
  return <Badge className={className}>{T('label.sample')}</Badge>;
}

/** A notice (v3): an icon, a title, a muted body and one action row; `gold` is a decision waiting for a person. */
export function Notice({ tone = 'info', children, title, action, className = '', icon }: { tone?: 'info' | 'warn' | 'bad' | 'ok' | 'gold'; children?: ReactNode; title?: ReactNode; action?: ReactNode; className?: string; icon?: ReactNode }) {
  const Icon = tone === 'bad' ? IconBad : tone === 'warn' || tone === 'gold' ? IconWarn : tone === 'ok' ? IconOk : IconInfo;
  return (
    <div role={tone === 'bad' && !icon ? 'alert' : 'note'} className={cls('notice', `notice-${tone}`, className)}>
      {icon ?? <Icon aria-hidden />}
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? 'mt-0.5 text-muted' : ''}>{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}
