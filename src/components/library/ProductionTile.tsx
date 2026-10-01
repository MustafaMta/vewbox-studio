'use client';

import { useRouter } from 'next/navigation';
import type { Production } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { nextStep, productionHref } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { Menu, MenuItem, MenuLink, Status, type Tone } from '@/components/ui/kit';
import { IconDelete, IconDuplicate, IconOpen } from '@/components/ui/icons';

/** Shared bits for productions in libraries and headers: the stage as a status line, and the overflow menu with
 *  the next step, Duplicate and Delete. */

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
  const href = productionHref(p);
  const next = nextStep(p);
  const nextTab = p.kind === 'MUSIC_VIDEO' ? (next.tab === 'story' ? 'song' : next.tab === 'cast' ? 'performers' : next.tab) : next.tab === 'cast' ? 'characters' : next.tab;
  return (
    <Menu label={`${p.title}: ${T('nav.more')}`}>
      <MenuLink href={`${href}?tab=${nextTab}`} icon={<IconOpen />}>{T.dyn(next.key)}</MenuLink>
      <MenuItem icon={<IconDuplicate />} onClick={() => { const r = act('duplicateProduction', p.id); if (r.production) toast.ok(T('toast.created'), { label: T('btn.open'), href: productionHref(r.production) }); }}>{T('btn.duplicate')}</MenuItem>
      <MenuItem icon={<IconDelete />} tone="danger" onClick={() => { if (window.confirm(`${T('btn.delete')} “${p.title}”?`)) { act('deleteProduction', p.id); toast.ok(T('toast.deleted')); router.refresh(); } }}>{T('btn.delete')}</MenuItem>
    </Menu>
  );
}

export function sortItems<T extends { title?: string; name?: string; updatedAt: string }>(xs: T[], sort: 'recent' | 'title'): T[] {
  return [...xs].sort((a, b) => (sort === 'recent' ? b.updatedAt.localeCompare(a.updatedAt) : (a.title ?? a.name ?? '').localeCompare(b.title ?? b.name ?? '')));
}
