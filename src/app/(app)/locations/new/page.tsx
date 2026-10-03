'use client';

import { Suspense } from 'react';
import { LocationCreate } from '@/components/location/LocationCreate';

/** A NEW LOCATION — Auto or Manual: src/components/location/LocationCreate.tsx (`?start=manual`). */
export default function NewLocationPage() {
  return <Suspense><LocationCreate /></Suspense>;
}
