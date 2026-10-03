'use client';

import Link from 'next/link';
import { Children, Fragment, useId, type ReactNode } from 'react';
import { IconBad, IconInfo, IconOk, IconWarn } from '../icons';
import { Spinner } from './Button';
import { cls } from './cls';
import { Badge } from './Status';

/** EMPTY, LOADING, ERROR AND PARTIAL STATES (docs/design/VISUAL-STANDARD-V5.1.md §5.19, §5.23).
 *
 *    EmptyState    `section`: the section head stays; one sentence (.t-body text-2) and one secondary sm action, on
 *                  the start edge — never a large empty card. `page`: the page title (.t-page), one sentence and the
 *                  start cards (ToolCard / StartCard) for what can be made; no illustration.
 *    ErrorState    `page`: "This show isn't in the studio" (.t-page), one sentence, a secondary "Back to Shows".
 *                  `section`: the notice at the section's width.
 *    Notice        surface-1, radius 14, padding 16, a 3 px start bar (--wait waiting, --bad failure, --ok done); the
 *                  title 14/20 500 text-1, one sentence text-2, one secondary sm recovery and a quiet Details
 *                  disclosure with the raw words in mono on a page-tone well.
 *    ErrorNotice   the notice for a failure: what happened, why, what is kept, the recovery, Details.
 *    PageEmpty, SectionEmpty, LoadingFrame, TextBars, LoadingLine, PartialLine, SampleBadge (kept names) */

export function EmptyState({ kind = 'section', title, children, action, cards, className }: {
  kind?: 'section' | 'page';
  /** the page title (`page` only) */ title?: ReactNode;
  /** the one sentence */ children: ReactNode;
  /** `section`: one secondary sm action; `page`: optional buttons under the sentence */ action?: ReactNode;
  /** `page`: the start cards for what can be made */ cards?: ReactNode;
  className?: string;
}) {
  if (kind === 'page') {
    return (
      <div className={cls('empty-page', className)}>
        {title && <h1 className="t-page">{title}</h1>}
        <p className="empty-page-sentence">{children}</p>
        {action && <div className="empty-page-actions">{action}</div>}
        {cards && <div className="empty-page-cards">{cards}</div>}
      </div>
    );
  }
  return (
    <div className={cls('empty-section', className)}>
      <p>{children}</p>
      {action}
    </div>
  );
}

export function ErrorState({ kind = 'section', title, children, back, action, details, className }: {
  kind?: 'section' | 'page';
  title: ReactNode;
  /** one sentence */ children?: ReactNode;
  /** `page`: where to go instead ("Back to Shows") */ back?: { href: string; label: string };
  /** `section`: the recovery (one secondary sm button) */ action?: ReactNode;
  /** the raw words, behind Details */ details?: string | null;
  className?: string;
}) {
  if (kind === 'page') {
    return (
      <div className={cls('error-page', className)} role="alert">
        <h1 className="t-page">{title}</h1>
        {children && <p>{children}</p>}
        {back && <Link href={back.href} className="btn btn-secondary">{back.label}</Link>}
        {action}
      </div>
    );
  }
  return <Notice tone="bad" title={title} action={action} details={details} className={className}>{children}</Notice>;
}

/** The empty page (kept name): `art`, then one sentence, one primary and at most two alternatives. */
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

/** The empty section (kept name): one sentence, then one secondary action. */
export function SectionEmpty({ children, action, className = '' }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return <EmptyState action={action} className={className}>{children}</EmptyState>;
}

/** Text bars that hold a title and a slate's place while they load. */
export function TextBars({ lines = 2, className = '' }: { lines?: 1 | 2 | 3; className?: string }) {
  return <span aria-hidden className={cls('text-bars', className)}>{Array.from({ length: lines }, (_, i) => <span key={i} className="text-bar" />)}</span>;
}

/** A picture's place while it loads: the frame at its ratio, then text bars; with a `phase` (the job's real words)
 *  there is no pulse — the words carry it. */
export function LoadingFrame({ ratio = '16/9', lines = 2, phase, label, className = '' }: { ratio?: string; lines?: 0 | 1 | 2 | 3; phase?: ReactNode; /** what is loading, for assistive tech */ label?: string; className?: string }) {
  return (
    <div className={cls('loading-frame', className)} role={label ? 'status' : undefined} aria-label={label}>
      <div className="loading-frame-art" data-phase={phase ? 'true' : undefined} style={{ aspectRatio: ratio.replace('/', ' / ') }}>
        {phase && <span className="frame-phase"><span aria-hidden className="m-tally" />{phase}</span>}
      </div>
      {lines > 0 && <TextBars lines={lines as 1 | 2 | 3} />}
    </div>
  );
}

/** A spinner always comes with its sentence: "Loading the studio…". */
export function LoadingLine({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <p role="status" className={cls('loading-line', className)}><Spinner />{children ?? 'Loading…'}</p>;
}

/** The error notice: what happened, why in plain words, what is kept, one recovery then alternatives, and the raw
 *  exception only inside Details (mono, left to right). */
export function ErrorNotice({ title, why, kept, action, alternatives, details, live = true, className = '' }: {
  title: ReactNode; why?: ReactNode; kept?: ReactNode; action?: ReactNode; alternatives?: ReactNode; details?: string | null; live?: boolean; className?: string;
}) {
  return (
    <Notice tone="bad" title={title} live={live} className={cls('error-notice', className)} details={details}
      action={(action || alternatives) ? <>{action}{alternatives}</> : undefined}>
      {why}{kept && <>{why ? ' ' : null}<span className="notice-kept">{kept}</span></>}
    </Notice>
  );
}

/** A partial state said honestly, in one line of facts: "Episode 4 · cut missing · 18 of 20 shots chosen". */
export function PartialLine({ items, className = '' }: { items: ReadonlyArray<ReactNode>; className?: string }) {
  const shown = items.filter((x) => x !== null && x !== undefined && x !== false && x !== '');
  return <p className={cls('t-facts t-meta', className)}>{shown.map((x, i) => <Fragment key={i}><span>{x}</span></Fragment>)}</p>;
}

/** The neutral Sample badge on bundled media. */
export function SampleBadge({ className = '' }: { className?: string }) {
  return <Badge className={className}>Sample</Badge>;
}

/** The inline notice (§5.19). `tone`: info (no bar), wait (also `warn`, `gold`), bad, ok. */
export function Notice({ tone = 'info', children, title, action, details, className = '', icon, live }: {
  tone?: 'info' | 'wait' | 'warn' | 'gold' | 'bad' | 'ok';
  children?: ReactNode; title?: ReactNode;
  /** one secondary sm recovery */ action?: ReactNode;
  /** the raw engine words, behind a quiet Details disclosure */ details?: string | null;
  className?: string; icon?: ReactNode;
  /** announce it (a failure that just happened); default: a failure is an alert */ live?: boolean;
}) {
  const Icon = tone === 'bad' ? IconBad : tone === 'wait' || tone === 'warn' || tone === 'gold' ? IconWarn : tone === 'ok' ? IconOk : IconInfo;
  const id = useId();
  const alert = live ?? (tone === 'bad' && !icon);
  return (
    <div role={alert ? 'alert' : 'note'} className={cls('notice', `notice-${tone === 'warn' || tone === 'gold' ? 'wait' : tone}`, className)}>
      {icon ?? <Icon aria-hidden />}
      <div className="notice-main">
        {title && <p className="notice-title">{title}</p>}
        {children && <div className="notice-text">{children}</div>}
        {(action || details) && (
          <div className="notice-actions">
            {action}
            {details && (
              <details className="details notice-details">
                <summary aria-controls={`${id}-raw`}>Details</summary>
                <p id={`${id}-raw`} className="notice-raw tc" dir="ltr">{details}</p>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
