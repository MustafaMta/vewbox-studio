import { Suspense } from 'react';
import { ScreeningRoom, ScreeningSkeleton } from '@/components/screening/ScreeningRoom';

/** THE SCREENING ROOM — `/screening` lists every film with a cut; `/screening?p=<productionId>[&cut=<n>]` screens one
 *  (src/components/screening). The room reads the address, so it waits for it inside its own boundary. */
export default function ScreeningPage() {
  return <Suspense fallback={<ScreeningSkeleton />}><ScreeningRoom /></Suspense>;
}
