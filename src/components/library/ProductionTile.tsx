'use client';

import { useId, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Production } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { nextStep, productionHref } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { Button, Menu, MenuItem, MenuLink, Status, type Tone } from '@/components/ui/kit';
import { IconDelete, IconDuplicate, IconOpen } from '@/components/ui/icons';

/** Shared bits for productions in libraries and headers: the stage as a status line, and the overflow menu with
 *  the next step, Duplicate and Delete. Delete asks in a real dialog that names what goes and what stays (§5.17's
 *  ConfirmDialog anatomy; no `window.confirm`, §1.5). Owned by F3 until the page packages compose tiles themselves. */

const STAGE_TONE: Record<Production['stage'], Tone> = { STORY: 'neutral', CAST_AND_WORLD: 'neutral', STORYBOARD: 'info', PRODUCE: 'info', FINAL_CUT: 'warn', COMPLETE: 'ok' };

export function StageStatus({ p, className = '' }: { p: Production; className?: string }) {
  const T = useT();
  return <Status tone={STAGE_TONE[p.stage]} className={className}>{T.dyn(`stage.${p.stage}`)}</Status>;
}

export function ProductionMenu({ p }: { p: Production }) {
  const T = useT();
  const { act } = useStudio();
  const router = useRouter();
  const toast = useToast();
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const href = productionHref(p);
  const next = nextStep(p);
  const nextTab = p.kind === 'MUSIC_VIDEO' ? (next.tab === 'story' ? 'song' : next.tab === 'cast' ? 'performers' : next.tab) : next.tab === 'cast' ? 'characters' : next.tab;
  const remove = () => { dialog.current?.close(); act('deleteProduction', p.id); toast.ok(T('toast.deleted')); router.refresh(); };
  return (
    <>
      <Menu label={`${p.title}: ${T('nav.more')}`}>
        <MenuLink href={`${href}?tab=${nextTab}`} icon={<IconOpen />}>{T.dyn(next.key)}</MenuLink>
        <MenuItem icon={<IconDuplicate />} onClick={() => { const r = act('duplicateProduction', p.id); if (r.production) toast.ok(T('toast.created'), { label: T('btn.open'), href: productionHref(r.production) }); }}>{T('btn.duplicate')}</MenuItem>
        <MenuItem icon={<IconDelete />} tone="danger" onClick={() => dialog.current?.showModal()}>{T('btn.delete')}</MenuItem>
      </Menu>
      <dialog ref={dialog} className="dlg w-[min(92vw,26rem)]" aria-labelledby={`${id}-h`} aria-describedby={`${id}-d`}>
        <div className="p-5">
          <h2 id={`${id}-h`} className="h2" dir="auto">{T.f('media.delete.title', { title: p.title })}</h2>
          <p id={`${id}-d`} className="mt-2 text-sm text-muted">{T('media.delete.body')}</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="quiet" onClick={() => dialog.current?.close()} autoFocus>{T('btn.cancel')}</Button>
            <Button variant="destructive" onClick={remove}>{T('btn.delete')}</Button>
          </div>
        </div>
      </dialog>
    </>
  );
}

export function sortItems<T extends { title?: string; name?: string; updatedAt: string }>(xs: T[], sort: 'recent' | 'title'): T[] {
  return [...xs].sort((a, b) => (sort === 'recent' ? b.updatedAt.localeCompare(a.updatedAt) : (a.title ?? a.name ?? '').localeCompare(b.title ?? b.name ?? '')));
}
