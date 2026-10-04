'use client';

import { Suspense } from 'react';
import { LocationCreate } from '@/components/location/LocationCreate';
import { CreateLocationSkeleton } from '@/components/location/LocationCreateSkeleton';

/** A NEW LOCATION — Auto or Manual: src/components/location/LocationCreate.tsx (`?start=manual`). The fallback is the
 *  page's own skeleton (the route's, too: route-skeletons.tsx). */
export default function NewLocationPage() {
  return <Suspense fallback={<CreateLocationSkeleton />}><LocationCreate /></Suspense>;
}
