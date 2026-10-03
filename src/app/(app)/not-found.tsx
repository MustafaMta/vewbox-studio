'use client';

import { useT } from '@/components/ui/locale';
import { LinkButton } from '@/components/ui/kit';
import { HOME } from '@/components/shell/nav-model';

/** An address the studio does not have, or a record that was deleted: say so, and offer the home. */
export default function NotFound() {
  const T = useT();
  return (
    <div className="shell-error">
      <h1 className="page-title">{T('misc.notFound')}</h1>
      <p className="lead">{T('misc.notFound.hint')}</p>
      <div className="shell-error-actions"><LinkButton href={HOME} variant="primary">{T('shell.error.home')}</LinkButton></div>
    </div>
  );
}
