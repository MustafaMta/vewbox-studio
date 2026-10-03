import { notFound } from 'next/navigation';
import { MediaSpecimens } from '@/components/media/Specimens';
import { KitSpecimen } from '@/components/ui/kit/specimen/Specimen';

/** /kit — the interface kit's specimen page (docs/DESIGN-SYSTEM-V4.md §8.3, §8.5 F2): every kit component in every
 *  state, the More-contrast and compact-density demonstrations, then the media kit's sections (F3,
 *  src/components/media/Specimens.tsx). Development only: a production build answers 404. */
export const dynamic = 'force-dynamic';

export default function KitPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <KitSpecimen media={<MediaSpecimens />} />;
}
