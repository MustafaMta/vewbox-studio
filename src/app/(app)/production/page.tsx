'use client';

import { Suspense } from 'react';
import { ControlRoom, ControlRoomSkeleton } from '@/components/production/ControlRoom';

/** /production — the control room (src/components/production/ControlRoom.tsx). `?job=` opens a job's log. */
export default function ProductionPage() {
  return <Suspense fallback={<ControlRoomSkeleton />}><ControlRoom /></Suspense>;
}