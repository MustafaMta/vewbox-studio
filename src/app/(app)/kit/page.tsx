import { notFound } from 'next/navigation';
import { KitSpecimen } from '@/components/ui/kit/specimen/Specimen';

/** /kit — the specimen of every shared component in every state (docs/design/VISUAL-STANDARD-V5.1.md §5): the kit, the
 *  media kit, the players and the cutting room on one page, the single reference for page engineers. Development only:
 *  a production build answers 404. */
export const dynamic = 'force-dynamic';

export default function KitPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <KitSpecimen />;
}
