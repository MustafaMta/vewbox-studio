'use client';

import { useId, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Production } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { nextStep } from '@/studio/selectors';
import { T } from '@/lib/copy';
import { useToast } from '@/components/ui/toast';
import { Button, Menu, MenuItem, MenuLink, Status, type Tone } from '@/components/ui/kit';
import { IconDelete, IconDuplicate, IconOpen } from '@/components/ui/icons';
import { nextTab, workspaceHref } from '@/components/workspace/model';

/** Shared bits for productions in libraries and headers: the stage as a status line, and the overflow menu with
 *  the next step, Duplicate and Delete. Delete asks in a real dialog that names what goes and what stays (§5.17's
 *  ConfirmDialog anatomy; no `window.confirm`, §1.5). Owned by F3 until the page packages compose tiles themselves. */

const STAGE_TONE: Record<Production['stage'], Tone> = { STORY: 'neutral', CAST_AND_WORLD: 'neutral', STORYBOARD: 'info', PRODUCE: 'info', FINAL_CUT: 'warn', COMPLETE: 'ok' };

export function StageStatus({ p, className = '' }: { p: Production; className?: string }) {
  return <Status tone={STAGE_TONE[p.stage]} className={className}>{T.dyn(`stage.${p.stage}`)}</Status>;
}

export function ProductionMenu({ p }: { p: Production }) {
  const { act } = useStudio();
  const router = useRouter();
  const toast = useToast();
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const next = nextStep(p);
  const remove = () => { dialog.current?.close(); act('deleteProduction', p.id); toast.ok('Deleted.'); router.refresh(); };
  return (
    <>
      <Menu label={`${p.title}: ${'More'}`}>
        <MenuLink href={workspaceHref(p, nextTab(p))} icon={<IconOpen />}>{T.dyn(next.key)}</MenuLink>
        <MenuLink href={workspaceHref(p)} icon={<IconOpen />}>Open the production map</MenuLink>
        <MenuItem icon={<IconDuplicate />} onClick={() => { const r = act('duplicateProduction', p.id); if (r.production) toast.ok('Created.', { label: 'Open', href: workspaceHref(r.production) }); }}>{'Duplicate'}</MenuItem>
        <MenuItem icon={<IconDelete />} tone="danger" onClick={() => dialog.current?.showModal()}>{'Delete'}</MenuItem>
      </Menu>
      <dialog ref={dialog} className="dlg w-[min(92vw,26rem)]" aria-labelledby={`${id}-h`} aria-describedby={`${id}-d`}>
        <div className="p-5">
          <h2 id={`${id}-h`} className="h2" dir="auto">{T.f('media.delete.title', { title: p.title })}</h2>
          <p id={`${id}-d`} className="mt-2 text-sm text-muted">{'Its story, shots and takes go with it. Characters, locations and files stay in the studio.'}</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="quiet" onClick={() => dialog.current?.close()} autoFocus>{'Cancel'}</Button>
            <Button variant="destructive" onClick={remove}>{'Delete'}</Button>
          </div>
        </div>
      </dialog>
    </>
  );
}

export function sortItems<T extends { title?: string; name?: string; updatedAt: string }>(xs: T[], sort: 'recent' | 'title'): T[] {
  return [...xs].sort((a, b) => (sort === 'recent' ? b.updatedAt.localeCompare(a.updatedAt) : (a.title ?? a.name ?? '').localeCompare(b.title ?? b.name ?? '')));
}
