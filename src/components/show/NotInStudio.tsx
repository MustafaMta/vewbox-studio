import { ErrorState } from '@/components/ui/kit';

/** A show, season or episode that is not in the studio (§5.23 error page): the page title, one sentence, the way back. */
export function NotInStudio({ what, back }: { what: 'show' | 'season' | 'episode'; back: { href: string; label: string } }) {
  return <ErrorState kind="page" title={`This ${what} isn’t in the studio`} back={back}>It may have been deleted, or the link is from an older studio.</ErrorState>;
}
