'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { Skeleton, SkeletonRegion } from '@/components/ui/kit';

/** /locations/new WHILE IT OPENS (VISUAL-STANDARD-V5.1 §5.22; the Design QA's M1) — the page's own frame in the kit's
 *  placeholders: the back link, the title and its line, the mode switch (Auto · Manual) with its hint, then the form
 *  card at its real width and, for Auto, the 2.39:1 plate's title card beside it. The fields are those of the start
 *  the address asks for (`?start=manual`), each in its real line boxes, so the form replaces it without a move. Kept
 *  apart from LocationCreate.tsx so the shell imports it statically without the form's code. */

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
const choice = (label: string, w: number) => <div><p className="label"><Skeleton.Line width={label} /></p><Skeleton.Block width={w} height={36} radius="sm" /></div>;
const foot = (primary: number, secondary?: number) => (
  <div className="creation-foot">
    <span className="t-meta"><Skeleton.Line width="16rem" /></span>
    <span className="char-form-acts"><Skeleton.Block width={76} height="var(--control-h)" radius="pill" />{secondary && <Skeleton.Block width={secondary} height="var(--control-h)" radius="pill" />}<Skeleton.Block width={primary} height="var(--control-h)" radius="pill" /></span>
  </div>
);

function AutoFormSk() {
  return (
    <div className="char-form">
      <FieldSk label="7rem" control={textarea(120)} help hint />
      <FieldSk label="3rem" control={input} help hint />
      <div className="pc-choices">{choice('2.5rem', 148)}{choice('3rem', 208)}</div>
      {foot(196)}
    </div>
  );
}
function ManualFormSk() {
  return (
    <div className="char-form">
      <div className="pc-pair"><FieldSk label="3rem" control={input} /><FieldSk label="5.5rem" control={input} hint /></div>
      <div className="pc-choices">{choice('2.5rem', 148)}{choice('3rem', 208)}</div>
      <FieldSk label="7rem" control={textarea(96)} help />
      <FieldSk label="5rem" control={textarea(96)} help hint />
      <FieldSk label="3rem" control={textarea(96)} help hint />
      <div><p className="label"><Skeleton.Line width="6rem" /></p><div className="pc-choices"><Skeleton.Block width={88} height={20} radius="xs" /><Skeleton.Block width={72} height={20} radius="xs" /><Skeleton.Block width={80} height={20} radius="xs" /><Skeleton.Block width={64} height={20} radius="xs" /></div></div>
      {foot(196, 176)}
    </div>
  );
}

/** The skeleton for one start. */
export function CreateLocationSkeletonFor({ method = 'auto' }: { method?: 'auto' | 'manual' }) {
  return (
    <SkeletonRegion label="Opening the new location…" className="pc-page pc-create pc-skeleton">
      <div className="pc-head">
        <div className="pc-head-words">
          <span className="pc-back"><Skeleton.Line width="5rem" /></span>
          <div className="t-page pc-head-title"><Skeleton.Line size="title" width="10rem" /></div>
          <div className="t-body pc-head-desc"><Skeleton.Line width="30rem" /></div>
        </div>
      </div>
      <div className="pc-methods">
        <Skeleton.Block width={132} height={36} radius="sm" />
        <div className="t-body pc-empty-line"><Skeleton.Line width="min(32rem, 90%)" /></div>
      </div>
      <div className="pc-create-body" data-plate>
        <div className="card pc-create-card">{method === 'manual' ? <ManualFormSk /> : <AutoFormSk />}</div>
        {method === 'auto' && (
          <div className="pc-create-preview">
            <div className="pc-preview">
              <Skeleton.Media ratio="2.39/1" className="pc-preview-frame" />
              <span className="t-meta"><Skeleton.Line width="8rem" /></span>
              <p className="t-meta pc-preview-note"><Skeleton.Line width="100%" /><br /><Skeleton.Line width="50%" /></p>
            </div>
          </div>
        )}
      </div>
    </SkeletonRegion>
  );
}

function FromAddress() {
  return <CreateLocationSkeletonFor method={useSearchParams().get('start') === 'manual' ? 'manual' : 'auto'} />;
}

/** The route's skeleton: Manual when the address asks for it (`?start=manual`), Auto otherwise. */
export function CreateLocationSkeleton() {
  return <Suspense fallback={<CreateLocationSkeletonFor />}><FromAddress /></Suspense>;
}
