'use client';

import { useRouter } from 'next/navigation';
import type { Production } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { productionHref } from '@/studio/selectors';
import { MenuButton, MenuItem, MenuLink, useConfirm } from '@/components/ui/kit';
import { useToast } from '@/components/ui/toast';
import { IconDelete, IconDuplicate, IconOpen } from '@/components/ui/icons';
import { continueAction, songTitle } from './model';

/** A music video's More menu (catalogue tiles and the title page): the next step in the production, Duplicate, and
 *  Delete behind a confirmation. Every write goes through the studio's own commands. */
export function MusicVideoMenu({ p, after = 'stay', variant = 'quiet', size = 'sm', next: withNext = true }: { p: Production; after?: 'stay' | 'catalogue'; variant?: 'quiet' | 'secondary'; size?: 'sm' | 'md'; /** false where the next step is already the page's primary */ next?: boolean }) {
  const { act } = useStudio();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const title = songTitle(p);
  const next = continueAction(p);
  const remove = async () => {
    const ok = await confirm({ title: `Delete ${title}?`, body: 'The music video, its song, lyrics and shots leave the studio. Characters and locations stay.', confirmLabel: `Delete ${title}` });
    if (!ok) return;
    act('deleteProduction', p.id);
    toast.ok(`${title} was deleted`);
    if (after === 'catalogue') router.push('/music-videos');
  };
  return (
    <MenuButton label={`More for ${title}`} iconOnly variant={variant} size={size === 'md' ? undefined : size}>
      {withNext && <MenuLink href={next.href} icon={<IconOpen aria-hidden />}>{next.label}</MenuLink>}
      <MenuItem icon={<IconDuplicate aria-hidden />} onClick={() => { const r = act('duplicateProduction', p.id); if (r.production) toast.ok(`${songTitle(r.production)} was made from ${title}`, { label: 'Open', href: productionHref(r.production) }); }}>Duplicate</MenuItem>
      <MenuItem icon={<IconDelete aria-hidden />} tone="danger" onClick={() => void remove()}>Delete</MenuItem>
    </MenuButton>
  );
}
