'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { MediaSpecimens } from '@/components/media/Specimens';

/** The temporary specimen route's page (F3; delete with the route once /kit is merged). `?only=media|players|edit`
 *  renders one section, so each can be captured on its own. */
function Sections() {
  const only = useSearchParams().get('only');
  return <MediaSpecimens only={only === 'media' || only === 'players' || only === 'edit' ? only : undefined} />;
}

export function KitMediaPage() {
  return (
    <div className="spec-page">
      <h1 className="page-title">Media, players and the cutting room</h1>
      <p className="lead spec-lead">Every part of the media kit in its states, on the bundled sample media. A page for development.</p>
      <nav className="spec-nav" aria-label={'Media, players and the cutting room'}>
        <a href="#media">Media</a> · <a href="#players">Players</a> · <a href="#edit">Cutting room</a>
      </nav>
      <Suspense fallback={null}><Sections /></Suspense>
    </div>
  );
}
