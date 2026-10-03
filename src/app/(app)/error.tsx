'use client';

import { T } from '@/lib/copy';
import { Button, Details, LinkButton } from '@/components/ui/kit';
import { HOME } from '@/components/shell/nav-model';

/** A page that broke (docs/DESIGN-SYSTEM-V4.md §5.16, the notice anatomy): what happened, what is kept, one recovery
 *  and an alternative; the raw error only inside Details, in mono (V4-06). The shell around it keeps working. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="shell-error" role="alert">
      <h1 className="page-title">{T('shell.error.title')}</h1>
      <p className="lead">{T('shell.error.hint')}</p>
      <div className="shell-error-actions">
        <Button variant="primary" onClick={reset}>{T('shell.error.retry')}</Button>
        <LinkButton href={HOME}>{T('shell.error.home')}</LinkButton>
      </div>
      {(error.message || error.digest) && (
        <Details summary={T('shell.error.details')}>
          <p className="tc break-all" dir="ltr">{[error.message, error.digest].filter(Boolean).join(' · ')}</p>
        </Details>
      )}
    </div>
  );
}
