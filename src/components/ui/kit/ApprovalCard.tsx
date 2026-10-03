'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { cls } from './cls';
import { useSessionDraft } from './session';
import { ErrorNotice } from './States';
import { StateWord } from './Status';

/** THE APPROVAL CARD (docs/DESIGN-SYSTEM-V4.md §5.15) — the shell; the thing to approve comes from F3 through the
 *  `media` slot (a script excerpt on paper, the 16:9 cut in an InlinePlayer, the figure at 928:1664 without the
 *  light-backdrop filter, or a 3 × 2 storyboard grid). A group on --surface, radius 12, padding 20: at ≥ 1280 the
 *  thing takes 7 columns and the decision 5; below that they stack. The card is a region, so a queue of cards has one
 *  ivory primary per card: Approve. */

/** Request changes, inline (never window.prompt): "What should change?", kept in sessionStorage per decision while
 *  it is being written (3.3.7), submitted with *Send back*. Esc or Cancel closes it; the draft stays. */
export function InlineNote({ storageKey, label, submitLabel, onSubmit, onCancel, placeholder, className = '' }: {
  storageKey: string | null; label: ReactNode; submitLabel: ReactNode; onSubmit: (text: string) => Promise<void> | void; onCancel: () => void; placeholder?: string; className?: string;
}) {
  const id = useId();
  const [text, setText, clear] = useSessionDraft<string>(storageKey, '');
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { field.current?.focus(); }, []);
  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try { await onSubmit(t); clear(); } finally { setBusy(false); }
  };
  return (
    <form className={cls('inline-note', className)} onSubmit={(e) => { e.preventDefault(); void send(); }} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } }}>
      <label htmlFor={id} className="label">{label}</label>
      <textarea ref={field} id={id} className="textarea" dir="auto" rows={3} value={text} placeholder={placeholder} maxLength={2000} onChange={(e) => setText(e.target.value)} />
      <span className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={!text.trim()} loading={busy}>{submitLabel}</Button>
        <Button size="sm" variant="quiet" onClick={onCancel} disabled={busy}>Cancel</Button>
      </span>
    </form>
  );
}

type CardState = 'idle' | 'approving' | 'noting' | 'approved' | 'sent';

const SETTLE_MS = 10_000;

export function ApprovalCard({ id, media, kind, title, provenance, ask, onApprove, onRequestChanges, openHref, openLabel, onUndo, onSettled, failure, busy: busyProp, approved, headingLevel = 3, className = '' }: {
  /** the decision's id: it keys the request-changes draft */ id: string;
  /** F3's slot: the thing to approve, inline */ media?: ReactNode;
  /** "Story" */ kind: ReactNode; /** "The Kite — Episode 4" */ title: ReactNode;
  /** "Story Development handed it over · 12 min ago" */ provenance?: ReactNode;
  /** one sentence: what approving does ("Approve the story to start storyboarding.") */ ask?: ReactNode;
  onApprove: () => Promise<void> | void;
  /** omitted: no Request changes */ onRequestChanges?: (note: string) => Promise<void> | void;
  openHref?: string; openLabel?: ReactNode;
  /** after Approve the card is one line, "Approved · Undo", for 10 s (longer while hovered or focused) */ onUndo?: () => Promise<void> | void;
  /** the 10 s are over: the page moves the card to Recent decisions */ onSettled?: (outcome: 'approved' | 'sent') => void;
  /** a failure the page knows of (the notice anatomy, e.g. an ErrorNotice) */ failure?: ReactNode;
  /** the decision is being saved elsewhere (the card shows it as if Approve were pressed) */ busy?: boolean;
  /** the decision was already made: the card starts as the "Approved · Undo" line */ approved?: boolean;
  headingLevel?: 2 | 3; className?: string;
}) {
  const hid = useId();
  const [state, setState] = useState<CardState>(approved ? 'approved' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const H = headingLevel === 2 ? 'h2' : 'h3';
  const settled = state === 'approved' || state === 'sent';

  useEffect(() => {
    if (!settled || paused) return;
    const t = setTimeout(() => onSettled?.(state === 'approved' ? 'approved' : 'sent'), SETTLE_MS);
    return () => clearTimeout(t);
  }, [settled, paused, state, onSettled]);

  const approve = async () => {
    setState('approving'); setError(null);
    try { await onApprove(); setState('approved'); } catch (e) { setError((e as Error)?.message ?? String(e)); setState('idle'); }
  };
  const sendBack = async (note: string) => {
    setError(null);
    try { await onRequestChanges?.(note); setState('sent'); } catch (e) { setError((e as Error)?.message ?? String(e)); throw e; }
  };

  if (settled) {
    return (
      <section aria-labelledby={hid} className={cls('approval approval-done', className)}
        onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false); }}>
        <p role="status" className="approval-done-line">
          <span id={hid} className="min-w-0 truncate"><span className="text-fg">{kind} · {title}</span></span>
          <StateWord tone="done">{state === 'approved' ? 'Approved' : 'Sent back with your note'}</StateWord>
          {state === 'approved' && onUndo && <Button size="xs" variant="quiet" onClick={async () => { await onUndo(); setState('idle'); }}>Undo</Button>}
        </p>
      </section>
    );
  }

  const busy = state === 'approving' || Boolean(busyProp);
  return (
    <section aria-labelledby={hid} aria-busy={busy || undefined} className={cls('approval', className)}>
      {media && <div className="approval-media">{media}</div>}
      <div className="approval-decision">
        <H id={hid} className="h3" dir="auto">{kind} · {title}</H>
        {provenance && <p className="caption mt-1">{provenance}</p>}
        {ask && <p className="mt-3 text-body">{ask}</p>}
        <div className="approval-actions">
          <Button variant="primary" onClick={() => void approve()} loading={busy} disabled={state === 'noting'}>Approve</Button>
          {onRequestChanges && <Button variant="secondary" onClick={() => setState('noting')} disabled={busy} aria-expanded={state === 'noting'}>Request changes</Button>}
          {openHref && <Link href={openHref} className="btn btn-quiet">{openLabel ?? 'Open'}</Link>}
        </div>
        {state === 'noting' && onRequestChanges && (
          <InlineNote storageKey={`vewbox.note:${id}`} label={'What should change?'} submitLabel={'Send back'} onSubmit={sendBack} onCancel={() => setState('idle')} className="mt-4" />
        )}
        {error && <ErrorNotice className="mt-4" title={'The decision was not saved.'} why={'Nothing changed. Try again in a moment.'} details={error} />}
        {failure && <div className="mt-4">{failure}</div>}
      </div>
    </section>
  );
}
