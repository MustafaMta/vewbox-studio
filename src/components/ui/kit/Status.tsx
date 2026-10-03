'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Stage } from '@/domain/vocabulary';
import { T } from '@/lib/copy';
import { IconClose, IconShield } from '../icons';
import { cls } from './cls';

/** STATUS (docs/DESIGN-SYSTEM-V4.md §5.10) — state lives under the picture, in words (§1.2 principle 5): a 6 px dot
 *  and a phrase. Colour is never the only carrier: the words say it, the dot repeats it. */

/** idle: faint dot, muted words · running: the tally (an iris dot that breathes; the word carries it under reduced
 *  motion) · done: ok dot · waiting (for the producer): warn dot and words · failed: bad dot and words. */
export type StateTone = 'idle' | 'running' | 'done' | 'waiting' | 'failed';

export function StateWord({ tone = 'idle', children, className = '', title, id }: { tone?: StateTone; children: ReactNode; className?: string; title?: string; id?: string }) {
  return <span id={id} className={cls('state-word', className)} data-tone={tone} title={title}><span aria-hidden className="state-dot" />{children}</span>;
}

/** A 40 px line under a hero's actions, only while something waits for the producer; the whole line is the link to
 *  the decision ("● Waiting for you: approve the story of Episode 4 ›"). */
export function StatusStrip({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cls('status-strip', className)}>
      <span aria-hidden className="state-dot" />
      <span className="min-w-0 flex-1">{children}</span>
      <span aria-hidden className="status-strip-chevron">›</span>
    </Link>
  );
}

/** A character's identity in the words the identity contract fixes, one style everywhere (tile, profile slate,
 *  pickers, cast rows). `videos` is how many videos the locked identity appeared in, when that is known. */
export type Identity = 'draft' | 'approved' | 'locked' | 'none';
export function IdentityState({ state, videos, className = '' }: { state: Identity; videos?: number; className?: string }) {
  if (state === 'draft') return <StateWord tone="waiting" className={className}>Draft — awaiting your approval</StateWord>;
  if (state === 'approved') return <StateWord tone="done" className={className}>Approved</StateWord>;
  if (state === 'locked') {
    return (
      <span className={cls('state-word identity-locked', className)} data-tone="idle">
        <IconShield aria-hidden className="identity-shield" />
        {videos && videos > 0 ? T.p('kit.identity.lockedIn', videos) : 'Locked'}
      </span>
    );
  }
  return <StateWord tone="idle" className={className}>No image yet</StateWord>;
}

/** A production's stage in words (§5.10), then the pipeline's sub-state when it is true: "Storyboard · Waiting for
 *  you", "Producing · Running · drawing shot 7 of 20", "Story · Refused by QA". The tone follows the sub-state. */
export function StageWord({ stage, sub, tone, className = '' }: { stage: Stage; sub?: ReactNode; tone?: StateTone; className?: string }) {
  const t: StateTone = tone ?? (stage === 'COMPLETE' ? 'done' : 'idle');
  return <StateWord tone={t} className={className}>{T.dyn(`kit.stage.${stage}`)}{sub ? <> · {sub}</> : null}</StateWord>;
}

/** The pipeline's sub-states in words, for StageWord's `sub`. */
export function useStageSub() {
  return {
    waiting: 'Waiting for you',
    running: (what?: string) => (what ? `${'Running'} · ${what}` : 'Running'),
    refused: 'Refused by the quality check',
  };
}

/** A filter that is on, under the catalogue bar: a 32 px pill on --raised-2, the label, and × (a 24 × 24 target)
 *  that removes it. */
export function FilterChip({ children, onRemove, className = '' }: { children: ReactNode; onRemove: () => void; className?: string }) {
  const label = typeof children === 'string' ? children : '';
  return (
    <span className={cls('filter-chip', className)}>
      <span className="min-w-0 truncate">{children}</span>
      <button type="button" className="filter-chip-x" onClick={onRemove} aria-label={label ? `Remove the filter ${label}` : 'Remove'}><IconClose aria-hidden /></button>
    </span>
  );
}

/** 4 px, --accent-strong on --raised-2, only when the worker reports a percent (it fills from the
 *  start). `value` is 0–1. */
export function ProgressBar({ value, label, className = '' }: { value: number; label: string; className?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return <div className={cls('progress', className)} role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span style={{ inlineSize: `${pct}%` }} /></div>;
}

/* ---- v3 (kept until Q1; new code uses StateWord and the neutral Badge) ---------------------------------------- */

/** ok = done · info = running · teal = live · gold = waiting for your decision · warn = provisional · bad = failed ·
 *  accent = selected · neutral = idle. */
export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral' | 'accent' | 'gold' | 'teal';

/** A 22 px pill for counts and the SAMPLE mark only (§5.10); `neutral` is the v4 badge, the tones are v3's. */
export function Badge({ children, tone = 'neutral', title, className = '' }: { children: ReactNode; tone?: Tone; title?: string; className?: string }) {
  return <span className={cls('badge', `badge-${tone}`, className)} title={title}>{children}</span>;
}
/** Status in words: a coloured dot and a phrase (v3; StateWord is its v4 form). */
export function Status({ tone = 'neutral', children, live, title, className = '' }: { tone?: Tone; children: ReactNode; live?: boolean; title?: string; className?: string }) {
  return <span className={cls('status', `status-${tone}`, live && 'status-live', className)} title={title}>{children}</span>;
}
/** The one word on every bundled picture, clip and sound: this is sample content. */
export function SampleMark({ className = '' }: { className?: string }) {
  return <span className={cls('mark', className)}>Sample</span>;
}
