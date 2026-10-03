import { notFound } from 'next/navigation';
import { KitMediaPage } from './KitMediaPage';

/** TEMPORARY (package F3): a dev-only route that renders the media specimen sections on their own, for F3's tests and
 *  captures, until F2's /kit page (which renders the same `<MediaSpecimens />`) is merged. Delete this folder then.
 *  It does not exist in a production build. */
export default function Page() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <KitMediaPage />;
}
