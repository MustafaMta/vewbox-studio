'use client';

import { ScreeningSkeleton } from '@/components/screening/ScreeningRoom';

/** While the Screening Room's code loads: its own skeleton, in the exact shapes of the page. */
export default function Loading() {
  return <ScreeningSkeleton />;
}
