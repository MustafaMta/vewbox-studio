import Link from 'next/link';

/** A show, season or episode that is not in the studio (§5.23 error page): the page title, one sentence, the way back. */
export function NotInStudio({ what, back }: { what: 'show' | 'season' | 'episode'; back: { href: string; label: string } }) {
  return (
    <div className="shows shows-missing">
      <h1 className="t-page">This {what} isn’t in the studio</h1>
      <p className="t-body">It may have been deleted, or the link is from an older studio.</p>
      <Link className="btn btn-secondary" href={back.href}>{back.label}</Link>
    </div>
  );
}
