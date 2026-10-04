'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { Skeleton, SkeletonRegion } from '@/components/ui/kit';

/** /characters/new WHILE IT OPENS (VISUAL-STANDARD-V5.1 §5.22; the Design QA's M1) — the same frame the page draws,
 *  in the kit's placeholders: the back link, the title and its line, the mode switch (Auto · Manual · From a picture)
 *  with its hint, then the form card at its real width beside the figure's title card. The card holds the fields of
 *  the start that is asked for (`?start=`), each inside its own real line boxes, so nothing moves when the form takes
 *  over. The shell draws it before the studio's first snapshot; the page draws it until the draft and the engines are
 *  read. Kept apart from CreateCharacter.tsx so the shell can import it statically without the whole create package. */

export type CreateStart = 'describe' | 'sheet' | 'picture';
const STARTS: readonly CreateStart[] = ['describe', 'sheet', 'picture'];

/** A field's place: the label row (16), the control, and its help line (18) when the real field has one. */
function FieldSk({ label = '6rem', control, help, hint }: { label?: string; control: ReactNode; help?: boolean; hint?: boolean }) {
  return (
    <div className="field">
      <div className="field-label-row"><span className="label"><Skeleton.Line width={label} /></span>{hint && <span className="field-optional"><Skeleton.Line width="3rem" /></span>}</div>
      {control}
      {help && <p className="help"><Skeleton.Line width="min(22rem, 80%)" /></p>}
    </div>
  );
}
const input = <Skeleton.Block width="100%" height={40} radius="sm" />;
const textarea = (h: number) => <Skeleton.Block width="100%" height={h} radius="sm" />;
/** A labelled segmented control (the label 16 + 6, the 36 px group). */
const choice = (label: string, w: number) => <div><p className="label"><Skeleton.Line width={label} /></p><Skeleton.Block width={w} height={36} radius="sm" /></div>;
/** The settings line "For the library · Cartoon · English · Change" (20 px). */
const settings = <p className="settings-summary-line"><Skeleton.Line width="22rem" /></p>;
/** The "More control" disclosure's summary line (20 px). */
const more = <details className="details creation-more"><summary tabIndex={-1}><Skeleton.Line width="6rem" /></summary></details>;
/** The footer: the note at the start, Cancel and the primary at the end. */
const foot = (primary: number, secondary?: number) => (
  <div className="creation-foot">
    <span className="t-meta"><Skeleton.Line width="16rem" /></span>
    <span className="char-form-acts"><Skeleton.Block width={76} height={40} radius="pill" />{secondary && <Skeleton.Block width={secondary} height={40} radius="pill" />}<Skeleton.Block width={primary} height={40} radius="pill" /></span>
  </div>
);

function AutoFormSk() {
  return (
    <div className="char-form">
      <FieldSk label="5.5rem" control={textarea(120)} help hint />
      <FieldSk label="3rem" control={input} help hint />
      {settings}
      {more}
      {foot(172)}
    </div>
  );
}
function ManualFormSk() {
  return (
    <div className="char-form">
      <div className="pc-pair"><FieldSk label="3rem" control={input} /><FieldSk label="2.5rem" control={input} hint /></div>
      <div className="pc-choices">{choice('2.5rem', 208)}{choice('4.5rem', 142)}</div>
      {more}
      {foot(156, 176)}
    </div>
  );
}
function PictureFormSk() {
  return (
    <div className="char-form">
      <div className="pc-drop">
        <div><Skeleton.Media ratio="928/1664" className="shaped-drop-sk" /></div>
        <div className="char-form">
          <div className="pc-pair"><FieldSk label="3rem" control={input} hint /><FieldSk label="2.5rem" control={input} hint /></div>
          {choice('8rem', 248)}
          <FieldSk label="9rem" control={textarea(96)} help hint />
          {settings}
        </div>
      </div>
      {more}
      {foot(188)}
    </div>
  );
}

/** The skeleton for one start. */
export function CreateCharacterSkeletonFor({ start = 'describe' }: { start?: CreateStart }) {
  return (
    <SkeletonRegion label="Opening the new character…" className="pc-page pc-create pc-skeleton">
      <div className="pc-head">
        <div className="pc-head-words">
          <span className="pc-back"><Skeleton.Line width="5rem" /></span>
          <div className="t-page pc-head-title"><Skeleton.Line size="title" width="11rem" /></div>
          <div className="t-body pc-head-desc"><Skeleton.Line width="26rem" /></div>
        </div>
      </div>
      <div className="pc-methods">
        <Skeleton.Block width={242} height={36} radius="sm" />
        <div className="t-body pc-empty-line"><Skeleton.Line width="min(34rem, 90%)" /></div>
      </div>
      <div className="pc-create-body">
        <div className="card pc-create-card">
          {start === 'sheet' ? <ManualFormSk /> : start === 'picture' ? <PictureFormSk /> : <AutoFormSk />}
        </div>
        <div className="pc-create-preview">
          <div className="pc-preview">
            <Skeleton.Media ratio="928/1664" className="pc-preview-frame" />
            <div className="pc-preview-words"><span className="t-meta"><Skeleton.Line width="9rem" /></span></div>
            <p className="t-meta pc-preview-note"><Skeleton.Line width="100%" /><br /><Skeleton.Line width="60%" /></p>
          </div>
        </div>
      </div>
    </SkeletonRegion>
  );
}

function FromAddress() {
  const asked = useSearchParams().get('start');
  return <CreateCharacterSkeletonFor start={STARTS.includes(asked as CreateStart) ? (asked as CreateStart) : 'describe'} />;
}

/** The route's skeleton: the start the address asks for (`?start=sheet|picture`), Auto by default. */
export function CreateCharacterSkeleton() {
  return <Suspense fallback={<CreateCharacterSkeletonFor />}><FromAddress /></Suspense>;
}
