'use client';

import Link from 'next/link';
import { useId, type ReactNode } from 'react';
import { useT } from '../locale';
import { IconAuto, IconCheck, IconChevronLeft, IconManual } from '../icons';
import { Button } from './Button';
import { ChoiceTiles, type TileOption } from './Choice';
import { cls } from './cls';
import { Notice } from './States';

/** CREATION FLOWS (docs/DESIGN-SYSTEM-V4.md §5.19) — one layout for every "new" page (show, season, episode, short,
 *  music video, character, location), composed by P1a and P2:
 *
 *    ‹ Back to The Last Sip · Season 2                                       [ Cancel ]
 *    New episode                                                           ← .page-title
 *    For The Last Sip · Season 2 · Cartoon · Arabic (Iraqi)                ← slate
 *    How do you want to start?  ( ● Let the studio propose )  ( ○ Write it yourself )
 *    ┌ group ─────────────────────────────┐  ┌ preview (≥ 1280, 4 cols) ┐
 *    │ the one essential input             │  │ the title card, live      │
 *    │ SettingsSummary · Change            │  └───────────────────────────┘
 *    │ ▸ More control                      │
 *    │ About a minute.  [ Cancel ] [ Propose ]
 *    └─────────────────────────────────────┘
 *
 *  Three states: `form` (the method's essential input; More control disclosed, ≤ 2 levels, ≤ 6 visible fields per
 *  step), `working` (JobProgress replaces the group's content; the preview shows the phase inside it; one Cancel
 *  stops the chain and keeps what was finished), `review` (Auto only: the proposal as an editable sheet; Create,
 *  Another idea, Change preferences; nothing is made before Create). Every flow lands on the object's own page. */

export type CreationMethod = 'auto' | 'manual';

/** The method tiles in the kit's words; pass your own options for a flow with other methods. */
export function useMethodOptions(): Array<TileOption<CreationMethod>> {
  const T = useT();
  return [
    { value: 'auto', label: T('kit.create.auto'), hint: T('kit.create.autoHint'), icon: <IconAuto /> },
    { value: 'manual', label: T('kit.create.manual'), hint: T('kit.create.manualHint'), icon: <IconManual /> },
  ];
}

export function CreationShell<M extends string = CreationMethod>({ back, cancel, title, slate, method, state = 'form', preview, estimate, primary, moreControl, working, review, stepper, notice, children, className = '' }: {
  back?: { href: string; label: string };
  /** Cancel, at the top end and next to the primary (a link back, or a handler) */ cancel?: { href: string } | { onClick: () => void };
  title: ReactNode; /** "For The Last Sip · Season 2 · Cartoon · Arabic (Iraqi)" (F3's <Slate>) */ slate?: ReactNode;
  /** the method choice; omitted for a flow with one method */ method?: { value: M; onChange: (v: M) => void; options: Array<TileOption<M>>; label?: string };
  state?: 'form' | 'working' | 'review';
  /** ≥ 1280: the title card in the content's shape, updated live as the producer types (F3's TitleCard) */ preview?: ReactNode;
  /** said before the actions: "About a minute." */ estimate?: ReactNode;
  /** the group's ivory action (Propose, Create) */ primary?: ReactNode;
  /** disclosed under "More control" */ moreControl?: ReactNode;
  /** state="working": JobProgress */ working?: ReactNode;
  /** state="review": the editable proposal (with ReviewActions) */ review?: ReactNode;
  /** Manual, multi-step: <Stepper> */ stepper?: ReactNode;
  /** a refusal or a kept draft, said above the group */ notice?: ReactNode;
  /** state="form": the one essential input, then SettingsSummary */ children?: ReactNode;
  className?: string;
}) {
  const T = useT();
  const howId = useId();
  const cancelEl = cancel ? ('href' in cancel ? <Link href={cancel.href} className="btn btn-quiet">{T('btn.cancel')}</Link> : <Button variant="quiet" onClick={cancel.onClick}>{T('btn.cancel')}</Button>) : null;
  return (
    <div className={cls('creation', className)}>
      <div className="creation-top">
        {back ? <Link href={back.href} className="page-back"><IconChevronLeft className="size-3.5 rtl:rotate-180" aria-hidden />{back.label}</Link> : <span />}
        {cancelEl}
      </div>
      <h1 className="page-title" dir="auto">{title}</h1>
      {slate && <div className="creation-slate">{slate}</div>}
      {stepper && <div className="mt-4">{stepper}</div>}
      {method && state === 'form' && (
        <div className="creation-method">
          <p id={howId} className="label">{method.label ?? T('kit.create.how')}</p>
          <ChoiceTiles value={method.value} onChange={method.onChange} options={method.options} labelledBy={howId} />
        </div>
      )}
      {notice && <div className="mt-6">{notice}</div>}
      <div className="creation-body" data-preview={preview ? 'true' : undefined}>
        <div className="creation-group">
          {state === 'working' ? working : state === 'review' ? review : (
            <>
              {children}
              {moreControl && (
                <details className="details creation-more">
                  <summary>{T('kit.create.moreControl')}</summary>
                  <div className="mt-4">{moreControl}</div>
                </details>
              )}
              {(primary || cancelEl || estimate) && (
                <div className="creation-foot">
                  <span className="caption creation-estimate">{estimate}</span>
                  <span className="flex flex-wrap items-center gap-2">{cancelEl}{primary}</span>
                </div>
              )}
            </>
          )}
        </div>
        {preview && <aside className="creation-preview" aria-label={T('kit.create.preview')}>{preview}</aside>}
      </div>
    </div>
  );
}

/** The review's actions: Create (ivory), Another idea (secondary), Change preferences (quiet). */
export function ReviewActions({ onCreate, onAnother, onPreferences, creating, anotherBusy }: { onCreate: () => void; onAnother?: () => void; onPreferences?: () => void; creating?: boolean; anotherBusy?: boolean }) {
  const T = useT();
  return (
    <div className="creation-foot">
      <span />
      <span className="flex flex-wrap items-center gap-2">
        {onPreferences && <Button variant="quiet" onClick={onPreferences}>{T('kit.create.changePrefs')}</Button>}
        {onAnother && <Button onClick={onAnother} loading={anotherBusy} disabled={creating}>{T('kit.create.another')}</Button>}
        <Button variant="primary" onClick={onCreate} loading={creating}>{T('btn.create')}</Button>
      </span>
    </div>
  );
}

/** Manual, multi-step: "① Identity ─ ② Look ─ ③ Voice". The current step is iris, done steps are ok. On a phone it
 *  reads "Step 2 of 3 · Look". */
export function Stepper({ steps, current, className = '' }: { steps: ReadonlyArray<{ id: string; label: ReactNode }>; current: number; className?: string }) {
  const T = useT();
  return (
    <div className={cls('stepper-v4', className)}>
      <ol className="stepper stepper-full" aria-label={T('kit.create.steps')}>
        {steps.map((s, i) => (
          <li key={s.id} className="step-v4" aria-current={i === current ? 'step' : undefined} data-done={i < current ? '' : undefined}>
            <span className="stepper-n" aria-hidden>{i < current ? <IconCheck className="size-3.5" /> : i + 1}</span>
            <span>{s.label}{i < current && <span className="sr-only"> ({T('jp.done')})</span>}</span>
            {i < steps.length - 1 && <span aria-hidden className="step-line" />}
          </li>
        ))}
      </ol>
      <p className="stepper-short">{T.f('kit.create.stepOf', { n: current + 1, total: steps.length })} · {steps[current]?.label}</p>
    </div>
  );
}

/** The one-time notice on the object's own page after a flow lands there: what was made, and the next step. */
export function MadeNotice({ children, next, onDismiss }: { children: ReactNode; next?: ReactNode; onDismiss?: () => void }) {
  const T = useT();
  return <Notice tone="ok" title={children} action={<span className="flex flex-wrap items-center gap-2">{next}{onDismiss && <Button size="sm" variant="quiet" onClick={onDismiss}>{T('kit.dismiss')}</Button>}</span>} />;
}
