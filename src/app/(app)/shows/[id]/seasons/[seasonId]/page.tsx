'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Old season links land on the show's Seasons tab with that season selected. */
export default function SeasonRedirect() {
  const { id, seasonId } = useParams<{ id: string; seasonId: string }>();
  const router = useRouter();
  useEffect(() => { router.replace(`/shows/${id}?tab=seasons&season=${seasonId}`); }, [id, seasonId, router]);
  return null;
}
