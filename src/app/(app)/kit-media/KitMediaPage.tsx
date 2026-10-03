'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useT } from '@/components/ui/locale';
import { MediaSpecimens } from '@/components/media/Specimens';

/** The temporary specimen route's page (F3; delete with the route once /kit is merged). `?only=media|players|edit`
 *  renders one section, so each can be captured on its own. */
function Sections() {
  const only = useSearchParams().get('only');
  return <MediaSpecimens only={only === 'media' || only === 'players' || only === 'edit' ? only : undefined} />;
}

export function KitMediaPage() {
  const T = useT();
  return (
    <div className="spec-page">
      <h1 className="page-title">{T('media.spec.title')}</h1>
      <p className="lead spec-lead">{T('media.spec.lead')}</p>
      <nav className="spec-nav" aria-label={T('media.spec.title')}>
        <a href="#media">{T('media.spec.media')}</a> · <a href="#players">{T('media.spec.players')}</a> · <a href="#edit">{T('media.spec.edit')}</a>
      </nav>
      <Suspense fallback={null}><Sections /></Suspense>
    </div>
  );
}
