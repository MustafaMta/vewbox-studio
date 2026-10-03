'use client';

import { useT } from '@/components/ui/locale';
import { MediaSpecimens } from '@/components/media/Specimens';

/** The temporary specimen route's page (F3; delete with the route once /kit is merged). */
export function KitMediaPage() {
  const T = useT();
  return (
    <div className="spec-page">
      <h1 className="page-title">{T('media.spec.title')}</h1>
      <p className="lead spec-lead">{T('media.spec.lead')}</p>
      <nav className="spec-nav" aria-label={T('media.spec.title')}>
        <a href="#media">{T('media.spec.media')}</a> · <a href="#players">{T('media.spec.players')}</a> · <a href="#edit">{T('media.spec.edit')}</a>
      </nav>
      <MediaSpecimens />
    </div>
  );
}
